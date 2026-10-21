/** One-shot reactivation of an existing suspended contract after verified payment.
 * Default OFF, no worker/public route, no retries of uncertain mutations. */
import {and,eq} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {billingCustomerBindings,billingInvoices,billingProviderPayments,billingSubscriptions} from "@/infrastructure/db/billing-schema";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import type {TenantContext} from "@/domain/security/tenant-context";
import type {StepUpProof} from "@/application/security/password-step-up";
import {vendeContractTerms,vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {fmLocalCivilDate,fmPaidThroughExclusiveInstant} from "@/domain/billing/vende-commercial-policy-v1";
import {currentBoundVendePaymentEvidence} from "./vende-payment-evidence";
import {recordVendeCompensationRisk} from "./vende-compensation-risk";
import type {PlanProjectionConfig} from "./assistant-plan-outbox-dispatcher";
import {ASSISTANT_COMMERCIAL_TRANSITION_PATH,signAssistantCommercialTransition} from "./assistant-commercial-lifecycle-signer";
import {VendeCommercialDeliveryDenied,requireVendeCommercialDelivery,postVendeCommercialSigned,
  readVendeCommercialSnapshot,hasFreshVendeApproval,type VendeRemoteCommercialStatus} from "./vende-c06-delivery";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Command=typeof vendeLifecycleCommands.$inferSelect;
type Target=NonNullable<Command["deliveryTarget"]>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function denied():never{throw new VendeCommercialDeliveryDenied();}

/** Command -> invoice -> term -> subscription lock order, repeated after I/O.
 * Current binding, paid invoice AND received PSP payment AND fresh bound evidence
 * must agree. A refund/chargeback/unknown state never grants access. */
async function eligibility(tx:Tx,row:Command,now:Date){
  if(row.action!=="REACTIVATE_VERIFIED"||!row.sourceInvoiceId)return null;
  const [invoice]=await tx.select().from(billingInvoices).where(and(
    eq(billingInvoices.tenantId,row.tenantId),eq(billingInvoices.id,row.sourceInvoiceId),
    eq(billingInvoices.productId,row.productId),eq(billingInvoices.customerId,row.customerId),
    eq(billingInvoices.subscriptionId,row.subscriptionId),
  )).for("update").limit(1);
  if(!invoice||invoice.status!=="paid"||invoice.currency!=="BRL")return null;
  const [payment]=await tx.select().from(billingProviderPayments).where(and(
    eq(billingProviderPayments.tenantId,row.tenantId),eq(billingProviderPayments.invoiceId,invoice.id),
    eq(billingProviderPayments.gatewayAccountId,invoice.gatewayAccountId),
  )).limit(1);
  if(!payment||payment.status!=="received")return null;
  const evidence=await currentBoundVendePaymentEvidence(tx,invoice,now);
  if(!evidence||evidence.outcome!=="settled_verified")return null;
  const [term]=await tx.select().from(vendeContractTerms).where(and(
    eq(vendeContractTerms.tenantId,row.tenantId),eq(vendeContractTerms.productId,row.productId),
    eq(vendeContractTerms.subscriptionId,row.subscriptionId),eq(vendeContractTerms.customerId,row.customerId),
  )).for("update").limit(1);
  if(!term||term.revision!==row.revision||term.lifecycleState!=="reactivation_pending"||
     term.effectiveFrom>fmLocalCivilDate(now))return null;
  const validUntil=fmPaidThroughExclusiveInstant(term.paidThrough).getTime()/1000;
  if(validUntil<=now.getTime()/1000)return null;
  const [subscription]=await tx.select().from(billingSubscriptions).where(and(
    eq(billingSubscriptions.tenantId,row.tenantId),eq(billingSubscriptions.id,row.subscriptionId),
    eq(billingSubscriptions.productId,row.productId),eq(billingSubscriptions.customerId,row.customerId),
  )).for("update").limit(1);
  if(!subscription||!["active","past_due","suspended"].includes(subscription.status))return null;
  const [product]=await tx.select({id:productDefinitions.id}).from(productDefinitions).where(and(
    eq(productDefinitions.tenantId,row.tenantId),eq(productDefinitions.id,row.productId),
    eq(productDefinitions.slug,"vendeatendeia"),eq(productDefinitions.status,"active"),
  )).limit(1);
  const [binding]=await tx.select({id:billingCustomerBindings.id}).from(billingCustomerBindings).where(and(
    eq(billingCustomerBindings.tenantId,row.tenantId),eq(billingCustomerBindings.productId,row.productId),
    eq(billingCustomerBindings.customerId,row.customerId),eq(billingCustomerBindings.externalTenantId,row.externalTenantId),
  )).limit(1);
  if(!product||!binding)return null;
  return {term,planCode:subscription.planCode,validUntil,paymentRef:evidence.externalPaymentRef};
}
function targetMatches(target:Target,eligible:NonNullable<Awaited<ReturnType<typeof eligibility>>>){
  return target.schema==="fm.vende.reactivation-target.v1"&&target.termsRevision===eligible.term.revision&&
    target.planCode===eligible.planCode&&target.validUntil===eligible.validUntil&&target.paymentRef===eligible.paymentRef;
}
function ackMatches(proof:VendeRemoteCommercialStatus,target:Target|null){
  return !!target&&proof.operation_status==="applied"&&proof.applied_action==="REACTIVATE_VERIFIED"&&
    proof.license_status==="active"&&proof.plan_code===target.planCode&&
    proof.plan_revision===target.planRevision&&proof.valid_until===target.validUntil;
}
async function finish(id:string,expected:"processing"|"unknown",proof:VendeRemoteCommercialStatus|null){
  return db.transaction(async tx=>{
    const [row]=await tx.select().from(vendeLifecycleCommands).where(eq(vendeLifecycleCommands.id,id)).for("update").limit(1);
    if(!row||row.state!==expected||row.action!=="REACTIVATE_VERIFIED")return denied();
    const now=new Date();const eligible=proof&&ackMatches(proof,row.deliveryTarget)?await eligibility(tx,row,now):null;
    if(eligible&&row.deliveryTarget&&targetMatches(row.deliveryTarget,eligible)){
      await tx.update(vendeContractTerms).set({lifecycleState:"active",updatedAt:now}).where(eq(vendeContractTerms.id,eligible.term.id));
      await tx.update(vendeLifecycleCommands).set({state:"delivered",deliveredAt:now}).where(eq(vendeLifecycleCommands.id,id));
      return "delivered" as const;
    }
    // The Assistant may have applied the activation before a financial reversal.
    // Preserve a durable, deduplicated human-compensation alert atomically
    // with UNKNOWN. Never invent proof that the remote license was revoked.
    if(proof?.operation_status==="applied")
      await recordVendeCompensationRisk(tx,row,proof,"reactivation_unconfirmed",now);
    await tx.update(vendeLifecycleCommands).set({state:"unknown"}).where(eq(vendeLifecycleCommands.id,id));
    return "unknown" as const;
  });
}

export async function dispatchVendeReactivationOnce(commandId:string,config:PlanProjectionConfig,
  http:typeof fetch=fetch,now:Date=new Date()):Promise<"delivered"|"unknown">{
  const base=requireVendeCommercialDelivery(config);if(!UUID.test(commandId))return denied();
  const row=await db.transaction(async tx=>{
    const [candidate]=await tx.select().from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.id,commandId),eq(vendeLifecycleCommands.tenantId,config.organizationId),
    )).for("update").limit(1);
    if(!candidate||candidate.state!=="pending"||candidate.claimedAt||candidate.deliveredAt||candidate.deliveryTarget||
       !hasFreshVendeApproval(candidate.approvedAt,now)||!await eligibility(tx,candidate,now))return denied();
    const [claimed]=await tx.update(vendeLifecycleCommands).set({state:"processing",claimedAt:now})
      .where(eq(vendeLifecycleCommands.id,commandId)).returning();return claimed;
  });
  try{
    const remote=await readVendeCommercialSnapshot(base,row,config,http,now);
    // Pending commands cannot already have a matching persisted delivery target.
    // Never reconstruct one from an unsolicited remote success.
    if(remote.operation_status!=="not_applied"||remote.license_status!=="suspended"||remote.plan_revision<1||remote.valid_until<=0)
      return finish(commandId,"processing",null);
    const target=await db.transaction(async tx=>{
      const [claimed]=await tx.select().from(vendeLifecycleCommands).where(eq(vendeLifecycleCommands.id,row.id)).for("update").limit(1);
      const at=new Date();
      if(!claimed||claimed.state!=="processing"||claimed.deliveryTarget||claimed.actorId!==row.actorId||
         claimed.approvedAt?.getTime()!==row.approvedAt?.getTime()||!hasFreshVendeApproval(claimed.approvedAt,at))return null;
      const eligible=await eligibility(tx,claimed,at);
      if(!eligible||remote.plan_code!==eligible.planCode||remote.valid_until>eligible.validUntil)return null;
      const fixed:Target={schema:"fm.vende.reactivation-target.v1",planCode:eligible.planCode,
        planRevision:remote.plan_revision,validUntil:eligible.validUntil,paymentRef:eligible.paymentRef,termsRevision:claimed.revision};
      await tx.update(vendeLifecycleCommands).set({deliveryTarget:fixed}).where(eq(vendeLifecycleCommands.id,row.id));
      return fixed;
    });
    const mutationAt=new Date();
    if(!target||!hasFreshVendeApproval(row.approvedAt,mutationAt))return finish(commandId,"processing",null);
    const envelope=signAssistantCommercialTransition(config,{
      tenantId:row.externalTenantId,actorId:row.actorId,operationId:row.operationId,approvedAt:row.approvedAt,
      action:"REACTIVATE_VERIFIED",expectedStatus:"suspended",expectedPlanCode:remote.plan_code,
      expectedPlanRevision:remote.plan_revision,expectedValidUntil:new Date(remote.valid_until*1000),
      targetPlanCode:target.planCode,targetPlanRevision:target.planRevision,targetValidUntil:new Date(target.validUntil*1000),
      effectiveAt:mutationAt,verifiedPaymentRef:target.paymentRef,
    },mutationAt);
    const response=await postVendeCommercialSigned(base,ASSISTANT_COMMERCIAL_TRANSITION_PATH,envelope,http);
    if(!response.ok)return finish(commandId,"processing",null);
    return finish(commandId,"processing",await readVendeCommercialSnapshot(base,row,config,http,new Date()));
  }catch{return finish(commandId,"processing",null);}
}

/** Read-only recovery after timeout or quarantine, even after approval expires.
 * It cannot extend validity, synthesize the target, or send a second mutation. */
export async function reconcileUnknownVendeReactivation(commandId:string,config:PlanProjectionConfig,
  http:typeof fetch=fetch,now:Date=new Date()):Promise<"delivered"|"unknown">{
  const base=requireVendeCommercialDelivery(config);if(!UUID.test(commandId))return denied();
  const [row]=await db.select().from(vendeLifecycleCommands).where(and(
    eq(vendeLifecycleCommands.id,commandId),eq(vendeLifecycleCommands.tenantId,config.organizationId),
    eq(vendeLifecycleCommands.action,"REACTIVATE_VERIFIED"),eq(vendeLifecycleCommands.state,"unknown"),
  )).limit(1);
  if(!row)return denied();
  if(!row.deliveryTarget)return "unknown";
  try{return await finish(commandId,"unknown",await readVendeCommercialSnapshot(base,row,config,http,now));}
  catch{return "unknown";}
}

/** B1.9 — corporate reapproval of an EXPIRED, never-attempted reactivation.
 * This does not send an operation, re-open unknown claims, alter invoices,
 * refresh payment evidence or change the SaaS license. */
export async function reapproveVendeReactivation(
  context:TenantContext,proof:StepUpProof,
  input:{productId:string;commandId:string;expectedApprovedAt:string|null},
  now:Date=new Date(),
){
  requireFMPlanAuthority(context,true);
  if(!UUID.test(input.productId)||!UUID.test(input.commandId)||
     proof.userId!==context.userId||!hasFreshVendeApproval(proof.verifiedAt,now)||
     (input.expectedApprovedAt!==null&&
       (typeof input.expectedApprovedAt!=="string"||
        !Number.isFinite(Date.parse(input.expectedApprovedAt))||
        new Date(input.expectedApprovedAt).toISOString()!==input.expectedApprovedAt)))
    return denied();
  return db.transaction(async tx=>{
    const [row]=await tx.select().from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.id,input.commandId),
      eq(vendeLifecycleCommands.tenantId,context.tenantId),
      eq(vendeLifecycleCommands.productId,input.productId),
    )).for("update").limit(1);
    if(!row||row.action!=="REACTIVATE_VERIFIED"||row.state!=="pending"||
       row.claimedAt||row.deliveredAt||row.deliveryTarget||
       (row.approvedAt?.toISOString()??null)!==input.expectedApprovedAt)
      return denied();
    // An existing valid/future approval cannot be silently refreshed.
    if(row.approvedAt){
      const age=now.getTime()-row.approvedAt.getTime();
      if(!Number.isFinite(age)||age<=300_000)return denied();
    }
    // Reuse the EXACT paid-invoice/PSP evidence, contract, binding and
    // current plan fences used by the one-shot dispatcher.
    const eligible=await eligibility(tx,row,now);
    if(!eligible)return denied();
    await tx.insert(auditEvents).values({
      tenantId:context.tenantId,actorId:context.userId,actorType:"user",
      action:"vende.reactivation_intent.reapproved",
      resourceType:"vende_lifecycle_command",resourceId:row.id,
      result:"success",correlationId:context.correlationId,
      metadata:{
        previousActorId:row.actorId,
        previousApprovedAt:row.approvedAt?.toISOString()??null,
        approvedAt:proof.verifiedAt.toISOString(),
        operationId:row.operationId,productId:row.productId,
        revision:row.revision,sourceInvoiceId:row.sourceInvoiceId,
        paymentRef:eligible.paymentRef,
      },
    });
    await tx.update(vendeLifecycleCommands).set({
      approvedAt:proof.verifiedAt,actorId:context.userId,
    }).where(eq(vendeLifecycleCommands.id,row.id));
    return {commandId:row.id,approvedAt:proof.verifiedAt.toISOString(),
      state:"pending" as const,dispatched:false};
  });
}
