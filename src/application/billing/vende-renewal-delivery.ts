/** B1.15 — signed one-shot renewal of a PAID existing Vende contract.
 * No public dispatcher, no scheduler, no untrusted change to target dates.
 * Unknown outcomes are reconciled exclusively by signed READ ONLY status.
 */
import {and,eq} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {billingInvoices,billingProviderPayments,billingSubscriptions,billingCustomerBindings,
  billingProductPlans} from "@/infrastructure/db/billing-schema";
import {assistantPlanRevisions} from "@/infrastructure/db/assistant-plan-schema";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import {vendeContractTerms,vendeContractTermAudit,vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {currentBoundVendePaymentEvidence} from "./vende-payment-evidence";
import {nextVendePaidThrough} from "@/domain/billing/vende-renewal-period";
import {fmPaidThroughExclusiveInstant} from "@/domain/billing/vende-commercial-policy-v1";
import {captureVendeContractRevision} from "@/domain/billing/vende-contract-snapshot";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import type {TenantContext} from "@/domain/security/tenant-context";
import type {StepUpProof} from "@/application/security/password-step-up";
import type {PlanProjectionConfig} from "./assistant-plan-outbox-dispatcher";
import {ASSISTANT_COMMERCIAL_TRANSITION_PATH,signAssistantCommercialTransition} from "./assistant-commercial-lifecycle-signer";
import {VendeCommercialDeliveryDenied,hasFreshVendeApproval,requireVendeCommercialDelivery,
  readVendeCommercialSnapshot,postVendeCommercialSigned,type VendeRemoteCommercialStatus} from "./vende-c06-delivery";
import {recordVendeCompensationRisk} from "./vende-compensation-risk";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Command=typeof vendeLifecycleCommands.$inferSelect;
type Target=NonNullable<Command["deliveryTarget"]>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const denied=():never=>{throw new VendeCommercialDeliveryDenied();};

/** Re-evaluate exactly the immutable B1.14 commercial snapshot. The remote
 * readback is a separate pre-POST fence; never infer license state from
 * payment, billing subscription or Command claim status. */
async function eligible(tx:Tx,row:Command,now:Date){
  const t=row.deliveryTarget;
  if(row.action!=="RENEW_VERIFIED"||!row.sourceInvoiceId||!t||
     t.schema!=="fm.vende.renewal-target.v1"||!t.paidThrough||!t.nextDueDate||
     !t.previousValidUntil||!t.amountMinor||!t.billingInterval||
     !Number.isSafeInteger(t.planRevision)||t.planRevision<1||
     t.termsRevision!==row.revision||row.revision!==row.expectedRevision+1||
     t.paidThrough!==row.effectiveDate||t.validUntil<=now.getTime()/1000)return null;
  // Keep invoice before contract lock in delivery/reconciliation.
  const [invoice]=await tx.select().from(billingInvoices).where(and(
    eq(billingInvoices.id,row.sourceInvoiceId),eq(billingInvoices.tenantId,row.tenantId),
    eq(billingInvoices.subscriptionId,row.subscriptionId),eq(billingInvoices.productId,row.productId),
    eq(billingInvoices.customerId,row.customerId),
  )).for("update").limit(1);
  if(!invoice||invoice.status!=="paid"||invoice.currency!=="BRL"||
     invoice.amountMinor!==t.amountMinor)return null;
  const [payment]=await tx.select().from(billingProviderPayments).where(and(
    eq(billingProviderPayments.tenantId,row.tenantId),
    eq(billingProviderPayments.invoiceId,invoice.id),
    eq(billingProviderPayments.gatewayAccountId,invoice.gatewayAccountId),
  )).limit(1);
  if(!payment||payment.status!=="received")return null;
  const evidence=await currentBoundVendePaymentEvidence(tx,invoice,now);
  if(!evidence||evidence.outcome!=="settled_verified"||
     evidence.externalPaymentRef!==t.paymentRef)return null;
  const [term]=await tx.select().from(vendeContractTerms).where(and(
    eq(vendeContractTerms.tenantId,row.tenantId),eq(vendeContractTerms.productId,row.productId),
    eq(vendeContractTerms.customerId,row.customerId),
    eq(vendeContractTerms.subscriptionId,row.subscriptionId),
  )).for("update").limit(1);
  if(!term||term.revision!==row.expectedRevision||term.lifecycleState!=="active"||
     !term.autoRenew||invoice.createdAt<=term.createdAt)return null;
  const [subscription]=await tx.select().from(billingSubscriptions).where(and(
    eq(billingSubscriptions.tenantId,row.tenantId),eq(billingSubscriptions.id,row.subscriptionId),
    eq(billingSubscriptions.productId,row.productId),eq(billingSubscriptions.customerId,row.customerId),
  )).for("update").limit(1);
  if(!subscription||subscription.status!=="active"||subscription.planCode!==t.planCode)return null;
  const [product]=await tx.select({id:productDefinitions.id}).from(productDefinitions).where(and(
    eq(productDefinitions.tenantId,row.tenantId),eq(productDefinitions.id,row.productId),
    eq(productDefinitions.slug,"vendeatendeia"),eq(productDefinitions.status,"active"),
  )).limit(1);
  const [binding]=await tx.select({id:billingCustomerBindings.id}).from(billingCustomerBindings).where(and(
    eq(billingCustomerBindings.tenantId,row.tenantId),eq(billingCustomerBindings.productId,row.productId),
    eq(billingCustomerBindings.customerId,row.customerId),
    eq(billingCustomerBindings.externalTenantId,row.externalTenantId),
  )).limit(1);
  if(!product||!binding)return null;
  const [billingPlan]=await tx.select().from(billingProductPlans).where(and(
    eq(billingProductPlans.tenantId,row.tenantId),eq(billingProductPlans.productId,row.productId),
    eq(billingProductPlans.planCode,t.planCode),eq(billingProductPlans.status,"active"),
  )).limit(1);
  const [aiPlan]=await tx.select().from(assistantPlanRevisions).where(and(
    eq(assistantPlanRevisions.tenantId,row.tenantId),eq(assistantPlanRevisions.productId,row.productId),
    eq(assistantPlanRevisions.planCode,t.planCode),
    eq(assistantPlanRevisions.revision,t.planRevision),eq(assistantPlanRevisions.status,"published"),
  )).limit(1);
  if(!billingPlan||!aiPlan||billingPlan.currency!=="BRL"||
     billingPlan.interval!==t.billingInterval||
     billingPlan.amountMinor!==t.amountMinor||aiPlan.amountMinor!==t.amountMinor||
     aiPlan.billingInterval!==t.billingInterval)return null;
  const next=nextVendePaidThrough(term.paidThrough,t.billingInterval);
  const nextDue=nextVendePaidThrough(term.dueDate,t.billingInterval).paidThrough;
  if(t.paidThrough!==next.paidThrough||t.validUntil!==next.validUntil||
     t.previousValidUntil!==fmPaidThroughExclusiveInstant(term.paidThrough).getTime()/1000||
     t.nextDueDate!==nextDue||t.validUntil<=t.previousValidUntil)return null;
  return {term,target:t};
}
function exactAck(proof:VendeRemoteCommercialStatus|null,t:Target){
  return !!proof&&proof.operation_status==="applied"&&
    proof.applied_action==="RENEW_VERIFIED"&&proof.license_status==="active"&&
    proof.plan_code===t.planCode&&proof.plan_revision===t.planRevision&&
    proof.valid_until===t.validUntil;
}
async function finish(id:string,state:"processing"|"unknown",proof:VendeRemoteCommercialStatus|null){
  return db.transaction(async tx=>{
    const [row]=await tx.select().from(vendeLifecycleCommands).where(
      eq(vendeLifecycleCommands.id,id)).for("update").limit(1);
    if(!row||row.state!==state||row.action!=="RENEW_VERIFIED")return denied();
    const now=new Date();
    const ready=proof&&row.deliveryTarget&&exactAck(proof,row.deliveryTarget)
      ?await eligible(tx,row,now):null;
    if(ready&&row.deliveryTarget){
      const after={...ready.term,revision:row.revision,
        paidThrough:ready.target.paidThrough!,dueDate:ready.target.nextDueDate!,
        sourceRef:row.sourceRef,actorId:row.actorId,updatedAt:now};
      // Canonical local revision and immutable history ONLY after exact ACK.
      await tx.update(vendeContractTerms).set({
        revision:after.revision,paidThrough:after.paidThrough,dueDate:after.dueDate,
        sourceRef:after.sourceRef,actorId:after.actorId,updatedAt:now,
      }).where(eq(vendeContractTerms.id,ready.term.id));
      await tx.insert(vendeContractTermAudit).values({
        tenantId:row.tenantId,subscriptionId:row.subscriptionId,revision:row.revision,
        operationId:row.operationId,action:row.action,actorId:row.actorId,
        previousState:ready.term.lifecycleState,newState:"active",
        effectiveDate:after.paidThrough,sourceRef:row.sourceRef,
        termsSnapshot:captureVendeContractRevision(ready.term,after),
      });
      await tx.update(vendeLifecycleCommands).set({state:"delivered",deliveredAt:now})
        .where(eq(vendeLifecycleCommands.id,id));
      return "delivered" as const;
    }
    if(proof?.operation_status==="applied")
      await recordVendeCompensationRisk(tx,row,proof,"renewal_unconfirmed",now);
    await tx.update(vendeLifecycleCommands).set({state:"unknown"})
      .where(eq(vendeLifecycleCommands.id,id));
    return "unknown" as const;
  });
}

/** Reapprove expired, NEVER claimed intent, preserving B1.14 immutable target.
 * This does not issue a license mutation or create a new billing period. */
export async function reapproveVendeRenewal(
  context:TenantContext,proof:StepUpProof,
  input:{productId:string;commandId:string;expectedApprovedAt:string|null},now:Date=new Date(),
){
  requireFMPlanAuthority(context,true);
  if(!UUID.test(input.productId)||!UUID.test(input.commandId)||proof.userId!==context.userId||
     !hasFreshVendeApproval(proof.verifiedAt,now)||
     (input.expectedApprovedAt!==null&&
      (typeof input.expectedApprovedAt!=="string"||
       !Number.isFinite(Date.parse(input.expectedApprovedAt))||
       new Date(input.expectedApprovedAt).toISOString()!==input.expectedApprovedAt)))return denied();
  return db.transaction(async tx=>{
    const [row]=await tx.select().from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.id,input.commandId),eq(vendeLifecycleCommands.tenantId,context.tenantId),
      eq(vendeLifecycleCommands.productId,input.productId),
    )).for("update").limit(1);
    if(!row||row.action!=="RENEW_VERIFIED"||row.state!=="pending"||
       row.claimedAt||row.deliveredAt||
       (row.approvedAt?.toISOString()??null)!==input.expectedApprovedAt||
       (row.approvedAt&&now.getTime()-row.approvedAt.getTime()<=300_000)||
       !await eligible(tx,row,now))return denied();
    await tx.insert(auditEvents).values({
      tenantId:context.tenantId,actorId:context.userId,actorType:"user",
      action:"vende.renewal_intent.reapproved",resourceType:"vende_lifecycle_command",
      resourceId:row.id,result:"success",correlationId:context.correlationId,
      metadata:{operationId:row.operationId,productId:row.productId,revision:row.revision,
        previousActorId:row.actorId,previousApprovedAt:row.approvedAt?.toISOString()??null,
        approvedAt:proof.verifiedAt.toISOString(),sourceInvoiceId:row.sourceInvoiceId,
        targetValidUntil:row.deliveryTarget!.validUntil},
    });
    await tx.update(vendeLifecycleCommands).set({approvedAt:proof.verifiedAt,actorId:context.userId})
      .where(eq(vendeLifecycleCommands.id,row.id));
    return {state:"pending" as const,commandId:row.id,dispatched:false,
      approvedAt:proof.verifiedAt.toISOString()};
  });
}
export async function dispatchVendeRenewalOnce(
  commandId:string,config:PlanProjectionConfig,http:typeof fetch=fetch,now:Date=new Date(),
):Promise<"delivered"|"unknown">{
  const base=requireVendeCommercialDelivery(config);
  if(!UUID.test(commandId))return denied();
  const row=await db.transaction(async tx=>{
    const [candidate]=await tx.select().from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.id,commandId),eq(vendeLifecycleCommands.tenantId,config.organizationId),
    )).for("update").limit(1);
    if(!candidate||candidate.action!=="RENEW_VERIFIED"||candidate.state!=="pending"||
       candidate.claimedAt||candidate.deliveredAt||
       !hasFreshVendeApproval(candidate.approvedAt,now)||
       !await eligible(tx,candidate,now))return denied();
    const [claimed]=await tx.update(vendeLifecycleCommands).set({state:"processing",claimedAt:now})
      .where(eq(vendeLifecycleCommands.id,commandId)).returning();
    return claimed;
  });
  try{
    const remote=await readVendeCommercialSnapshot(base,row,config,http,now);
    const t=row.deliveryTarget!;
    if(remote.operation_status!=="not_applied"||
       !["active","trial"].includes(remote.license_status)||
       remote.plan_code!==t.planCode||remote.plan_revision!==t.planRevision||
       remote.valid_until!==t.previousValidUntil)
      return finish(commandId,"processing",null);
    const fenced=await db.transaction(async tx=>{
      const [claimed]=await tx.select().from(vendeLifecycleCommands).where(and(
        eq(vendeLifecycleCommands.id,row.id),eq(vendeLifecycleCommands.tenantId,row.tenantId),
      )).for("update").limit(1);
      const at=new Date();
      if(!claimed||claimed.state!=="processing"||claimed.actorId!==row.actorId||
         claimed.approvedAt?.getTime()!==row.approvedAt?.getTime()||
         !hasFreshVendeApproval(claimed.approvedAt,at)||!await eligible(tx,claimed,at))
        return false;
      return true;
    });
    const mutationAt=new Date();
    if(!fenced||!hasFreshVendeApproval(row.approvedAt,mutationAt))
      return finish(commandId,"processing",null);
    const envelope=signAssistantCommercialTransition(config,{
      tenantId:row.externalTenantId,actorId:row.actorId,operationId:row.operationId,
      approvedAt:row.approvedAt!,action:"RENEW_VERIFIED",
      expectedStatus:remote.license_status as "active"|"trial",
      expectedPlanCode:t.planCode,expectedPlanRevision:t.planRevision,
      expectedValidUntil:new Date(t.previousValidUntil!*1000),
      targetPlanCode:t.planCode,targetPlanRevision:t.planRevision,
      targetValidUntil:new Date(t.validUntil*1000),effectiveAt:mutationAt,
      verifiedPaymentRef:t.paymentRef,
    },mutationAt);
    const response=await postVendeCommercialSigned(base,ASSISTANT_COMMERCIAL_TRANSITION_PATH,envelope,http);
    if(!response.ok)return finish(commandId,"processing",null);
    return finish(commandId,"processing",await readVendeCommercialSnapshot(base,row,config,http,new Date()));
  }catch{return finish(commandId,"processing",null);}
}

/** A never-repeated mutation; signed status queries may finish UNKNOWN after
 * the original human step-up expired, but only for the B1.14 locked target. */
export async function reconcileUnknownVendeRenewal(
  commandId:string,config:PlanProjectionConfig,http:typeof fetch=fetch,now:Date=new Date(),
):Promise<"delivered"|"unknown">{
  const base=requireVendeCommercialDelivery(config);
  if(!UUID.test(commandId))return denied();
  const [row]=await db.select().from(vendeLifecycleCommands).where(and(
    eq(vendeLifecycleCommands.id,commandId),eq(vendeLifecycleCommands.tenantId,config.organizationId),
    eq(vendeLifecycleCommands.action,"RENEW_VERIFIED"),eq(vendeLifecycleCommands.state,"unknown"),
  )).limit(1);
  if(!row||!row.deliveryTarget)return denied();
  try{return await finish(commandId,"unknown",
    await readVendeCommercialSnapshot(base,row,config,http,now));}
  catch{return "unknown";}
}
