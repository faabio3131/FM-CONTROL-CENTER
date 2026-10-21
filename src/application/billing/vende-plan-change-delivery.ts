/** B1.16 — signed one-shot plan changes, default OFF, no automatic worker.
 * Upgrade changes quotas NOW without shortening the paid term; downgrade
 * changes quotas only AFTER the entire paid civil day has elapsed.
 */
import {and,eq} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {billingCustomerBindings,billingInvoices,billingProviderPayments,billingSubscriptions} from "@/infrastructure/db/billing-schema";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import {vendeContractTerms,vendeContractTermAudit,vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {currentBoundVendePaymentEvidence} from "./vende-payment-evidence";
import {certifiedVendePlanPair} from "./vende-plan-change-admission";
import {fmPaidThroughExclusiveInstant} from "@/domain/billing/vende-commercial-policy-v1";
import {nextVendePaidThrough} from "@/domain/billing/vende-renewal-period";
import {captureVendeContractRevision} from "@/domain/billing/vende-contract-snapshot";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import type {TenantContext} from "@/domain/security/tenant-context";
import type {StepUpProof} from "@/application/security/password-step-up";
import type {PlanProjectionConfig} from "./assistant-plan-outbox-dispatcher";
import type {VendePlanChangeAction} from "@/domain/billing/vende-plan-change-policy";
import {ASSISTANT_COMMERCIAL_TRANSITION_PATH,signAssistantCommercialTransition} from "./assistant-commercial-lifecycle-signer";
import {VendeCommercialDeliveryDenied,hasFreshVendeApproval,requireVendeCommercialDelivery,
  readVendeCommercialSnapshot,postVendeCommercialSigned,type VendeRemoteCommercialStatus} from "./vende-c06-delivery";
import {recordVendeCompensationRisk} from "./vende-compensation-risk";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Command=typeof vendeLifecycleCommands.$inferSelect;
type Target=NonNullable<Command["deliveryTarget"]>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const denied=():never=>{throw new VendeCommercialDeliveryDenied();};
const actionOK=(a:string):a is VendePlanChangeAction=>
  a==="APPLY_UPGRADE"||a==="APPLY_DOWNGRADE";

async function eligibility(tx:Tx,row:Command,now:Date){
  const t=row.deliveryTarget;
  if(!actionOK(row.action)||!row.sourceInvoiceId||!t||
     t.schema!=="fm.vende.plan-change-target.v1"||
     !t.previousPlanCode||!t.previousPlanRevision||!t.previousValidUntil||
     !t.paidThrough||!t.nextDueDate||!t.amountMinor||!t.previousAmountMinor||
     !t.billingInterval||t.termsRevision!==row.revision||
     row.revision!==row.expectedRevision+1||
     !Number.isSafeInteger(t.planRevision)||t.planRevision<1||
     !Number.isSafeInteger(t.previousPlanRevision)||t.previousPlanRevision<1||
     !Number.isSafeInteger(t.validUntil)||t.validUntil<=now.getTime()/1000)return null;
  const isUpgrade=row.action==="APPLY_UPGRADE";
  // Downgrade cannot execute before paid-through EXCLUSIVE instant.
  if(isUpgrade?now.getTime()/1000>=t.previousValidUntil
     :now.getTime()/1000<t.previousValidUntil)return null;
  const [term]=await tx.select().from(vendeContractTerms).where(and(
    eq(vendeContractTerms.tenantId,row.tenantId),
    eq(vendeContractTerms.productId,row.productId),
    eq(vendeContractTerms.subscriptionId,row.subscriptionId),
    eq(vendeContractTerms.customerId,row.customerId),
  )).for("update").limit(1);
  if(!term||term.revision!==row.expectedRevision||term.lifecycleState!=="active"||
     !term.autoRenew)return null;
  const [invoice]=await tx.select().from(billingInvoices).where(and(
    eq(billingInvoices.tenantId,row.tenantId),eq(billingInvoices.id,row.sourceInvoiceId),
    eq(billingInvoices.productId,row.productId),eq(billingInvoices.subscriptionId,row.subscriptionId),
    eq(billingInvoices.customerId,row.customerId),
  )).for("update").limit(1);
  if(!invoice||invoice.status!=="paid"||invoice.currency!=="BRL"||
     invoice.amountMinor!==t.amountMinor||invoice.createdAt<=term.createdAt)return null;
  const [payment]=await tx.select().from(billingProviderPayments).where(and(
    eq(billingProviderPayments.tenantId,row.tenantId),
    eq(billingProviderPayments.invoiceId,invoice.id),
    eq(billingProviderPayments.gatewayAccountId,invoice.gatewayAccountId),
  )).limit(1);
  if(!payment||payment.status!=="received")return null;
  const observed=await currentBoundVendePaymentEvidence(tx,invoice,now);
  if(!observed||observed.outcome!=="settled_verified"||
     observed.externalPaymentRef!==t.paymentRef)return null;
  const [subscription]=await tx.select().from(billingSubscriptions).where(and(
    eq(billingSubscriptions.tenantId,row.tenantId),eq(billingSubscriptions.id,row.subscriptionId),
    eq(billingSubscriptions.productId,row.productId),eq(billingSubscriptions.customerId,row.customerId),
  )).for("update").limit(1);
  if(!subscription||subscription.status!=="active"||subscription.planCode!==t.previousPlanCode)return null;
  const [product]=await tx.select({id:productDefinitions.id}).from(productDefinitions).where(and(
    eq(productDefinitions.tenantId,row.tenantId),
    eq(productDefinitions.id,row.productId),eq(productDefinitions.slug,"vendeatendeia"),
    eq(productDefinitions.status,"active"),
  )).limit(1);
  const [binding]=await tx.select({id:billingCustomerBindings.id}).from(billingCustomerBindings).where(and(
    eq(billingCustomerBindings.tenantId,row.tenantId),
    eq(billingCustomerBindings.productId,row.productId),
    eq(billingCustomerBindings.customerId,row.customerId),
    eq(billingCustomerBindings.externalTenantId,row.externalTenantId),
  )).limit(1);
  if(!product||!binding)return null;
  let pair:Awaited<ReturnType<typeof certifiedVendePlanPair>>;
  try{pair=await certifiedVendePlanPair(tx,row.tenantId,row.productId,
    t.previousPlanCode,t.planCode,t.previousPlanRevision,t.planRevision,row.action);}
  catch{return null;}
  if(pair.oldBill.amountMinor!==t.previousAmountMinor||
     pair.newBill.amountMinor!==t.amountMinor||
     pair.newBill.interval!==t.billingInterval)return null;
  const oldValid=fmPaidThroughExclusiveInstant(term.paidThrough).getTime()/1000;
  if(oldValid!==t.previousValidUntil)return null;
  const next=isUpgrade
    ?{paidThrough:term.paidThrough,validUntil:oldValid}
    :nextVendePaidThrough(term.paidThrough,t.billingInterval);
  const nextDue=isUpgrade?term.dueDate
    :nextVendePaidThrough(term.dueDate,t.billingInterval).paidThrough;
  if(t.validUntil!==next.validUntil||t.paidThrough!==next.paidThrough||
     t.nextDueDate!==nextDue||
     row.effectiveDate!==term.paidThrough)return null;
  return {term,subscription,target:t};
}
function exactAck(proof:VendeRemoteCommercialStatus|null,row:Command,t:Target){
  return !!proof&&proof.operation_status==="applied"&&
    proof.applied_action===row.action&&proof.license_status==="active"&&
    proof.plan_code===t.planCode&&proof.plan_revision===t.planRevision&&
    proof.valid_until===t.validUntil;
}
async function finish(id:string,state:"processing"|"unknown",proof:VendeRemoteCommercialStatus|null){
  return db.transaction(async tx=>{
    const [row]=await tx.select().from(vendeLifecycleCommands).where(eq(vendeLifecycleCommands.id,id))
      .for("update").limit(1);
    if(!row||!actionOK(row.action)||row.state!==state)return denied();
    const now=new Date();
    const ready=proof&&row.deliveryTarget&&exactAck(proof,row,row.deliveryTarget)
      ?await eligibility(tx,row,now):null;
    if(ready){
      const after={...ready.term,revision:row.revision,paidThrough:ready.target.paidThrough!,
        dueDate:ready.target.nextDueDate!,sourceRef:row.sourceRef,actorId:row.actorId,updatedAt:now};
      await tx.update(vendeContractTerms).set({
        revision:after.revision,paidThrough:after.paidThrough,dueDate:after.dueDate,
        sourceRef:after.sourceRef,actorId:after.actorId,updatedAt:now,
      }).where(eq(vendeContractTerms.id,ready.term.id));
      await tx.update(billingSubscriptions).set({planCode:ready.target.planCode})
        .where(and(eq(billingSubscriptions.tenantId,row.tenantId),
          eq(billingSubscriptions.id,row.subscriptionId)));
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
      await recordVendeCompensationRisk(tx,row,proof,
        row.action==="APPLY_UPGRADE"?"upgrade_unconfirmed":"downgrade_unconfirmed",now);
    await tx.update(vendeLifecycleCommands).set({state:"unknown"})
      .where(eq(vendeLifecycleCommands.id,id));
    return "unknown" as const;
  });
}
/** Reapproval refreshes ONLY authorization, never the locked commercial
 * target; for a downgrade it is available only after the paid cutoff. */
export async function reapproveVendePlanChange(
  context:TenantContext,proof:StepUpProof,action:VendePlanChangeAction,
  input:{productId:string;commandId:string;expectedApprovedAt:string|null},
  now:Date=new Date(),
){
  requireFMPlanAuthority(context,true);
  if(!actionOK(action)||!UUID.test(input.productId)||!UUID.test(input.commandId)||
     proof.userId!==context.userId||!hasFreshVendeApproval(proof.verifiedAt,now)||
     (input.expectedApprovedAt!==null&&(typeof input.expectedApprovedAt!=="string"||
       !Number.isFinite(Date.parse(input.expectedApprovedAt))||
       new Date(input.expectedApprovedAt).toISOString()!==input.expectedApprovedAt)))return denied();
  return db.transaction(async tx=>{
    const [row]=await tx.select().from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.id,input.commandId),
      eq(vendeLifecycleCommands.tenantId,context.tenantId),
      eq(vendeLifecycleCommands.productId,input.productId),
    )).for("update").limit(1);
    if(!row||row.action!==action||row.state!=="pending"||row.claimedAt||row.deliveredAt||
       (row.approvedAt?.toISOString()??null)!==input.expectedApprovedAt||
       (row.approvedAt&&now.getTime()-row.approvedAt.getTime()<=300_000)||
       !await eligibility(tx,row,now))return denied();
    await tx.insert(auditEvents).values({
      tenantId:context.tenantId,actorId:context.userId,actorType:"user",
      action:"vende.plan_change_intent.reapproved",resourceType:"vende_lifecycle_command",
      resourceId:row.id,result:"success",correlationId:context.correlationId,
      metadata:{action,productId:row.productId,subscriptionId:row.subscriptionId,
        previousApprovedAt:row.approvedAt?.toISOString()??null,
        approvedAt:proof.verifiedAt.toISOString(),previousActorId:row.actorId,
        operationId:row.operationId,revision:row.revision,sourceInvoiceId:row.sourceInvoiceId},
    });
    await tx.update(vendeLifecycleCommands).set({approvedAt:proof.verifiedAt,actorId:context.userId})
      .where(eq(vendeLifecycleCommands.id,row.id));
    return {commandId:row.id,state:"pending" as const,dispatched:false,
      approvedAt:proof.verifiedAt.toISOString()};
  });
}
export async function dispatchVendePlanChangeOnce(
  commandId:string,config:PlanProjectionConfig,http:typeof fetch=fetch,now:Date=new Date(),
):Promise<"delivered"|"unknown">{
  const base=requireVendeCommercialDelivery(config);
  if(!UUID.test(commandId))return denied();
  const row=await db.transaction(async tx=>{
    const [candidate]=await tx.select().from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.id,commandId),
      eq(vendeLifecycleCommands.tenantId,config.organizationId),
    )).for("update").limit(1);
    if(!candidate||!actionOK(candidate.action)||candidate.state!=="pending"||
       candidate.claimedAt||candidate.deliveredAt||
       !hasFreshVendeApproval(candidate.approvedAt,now)||
       !await eligibility(tx,candidate,now))return denied();
    const [claimed]=await tx.update(vendeLifecycleCommands).set({state:"processing",claimedAt:now})
      .where(eq(vendeLifecycleCommands.id,commandId)).returning();
    return claimed;
  });
  try{
    const snapshot=await readVendeCommercialSnapshot(base,row,config,http,now);
    const t=row.deliveryTarget!;
    if(snapshot.operation_status!=="not_applied"||snapshot.license_status!=="active"||
       snapshot.plan_code!==t.previousPlanCode||
       snapshot.plan_revision!==t.previousPlanRevision||
       snapshot.valid_until!==t.previousValidUntil)
      return finish(commandId,"processing",null);
    const stable=await db.transaction(async tx=>{
      const [claimed]=await tx.select().from(vendeLifecycleCommands).where(and(
        eq(vendeLifecycleCommands.tenantId,row.tenantId),
        eq(vendeLifecycleCommands.id,row.id),
      )).for("update").limit(1);
      const at=new Date();
      return !!claimed&&claimed.state==="processing"&&
        claimed.actorId===row.actorId&&
        claimed.approvedAt?.getTime()===row.approvedAt?.getTime()&&
        hasFreshVendeApproval(claimed.approvedAt,at)&&!!await eligibility(tx,claimed,at);
    });
    const mutationAt=new Date();
    if(!stable||!hasFreshVendeApproval(row.approvedAt,mutationAt))
      return finish(commandId,"processing",null);
    const envelope=signAssistantCommercialTransition(config,{
      tenantId:row.externalTenantId,actorId:row.actorId,operationId:row.operationId,
      approvedAt:row.approvedAt!,action:row.action as VendePlanChangeAction,
      expectedStatus:"active",expectedPlanCode:t.previousPlanCode!,
      expectedPlanRevision:t.previousPlanRevision!,
      expectedValidUntil:new Date(t.previousValidUntil!*1000),
      targetPlanCode:t.planCode,targetPlanRevision:t.planRevision,
      targetValidUntil:new Date(t.validUntil*1000),effectiveAt:mutationAt,
      verifiedPaymentRef:t.paymentRef,
    },mutationAt);
    const response=await postVendeCommercialSigned(base,ASSISTANT_COMMERCIAL_TRANSITION_PATH,envelope,http);
    if(!response.ok)return finish(commandId,"processing",null);
    return finish(commandId,"processing",
      await readVendeCommercialSnapshot(base,row,config,http,new Date()));
  }catch{return finish(commandId,"processing",null);}
}
export async function reconcileUnknownVendePlanChange(
  commandId:string,config:PlanProjectionConfig,http:typeof fetch=fetch,now:Date=new Date(),
):Promise<"delivered"|"unknown">{
  const base=requireVendeCommercialDelivery(config);
  if(!UUID.test(commandId))return denied();
  const [row]=await db.select().from(vendeLifecycleCommands).where(and(
    eq(vendeLifecycleCommands.id,commandId),eq(vendeLifecycleCommands.tenantId,config.organizationId),
    eq(vendeLifecycleCommands.state,"unknown"),
  )).limit(1);
  if(!row||!actionOK(row.action)||!row.deliveryTarget)return denied();
  try{return await finish(commandId,"unknown",
    await readVendeCommercialSnapshot(base,row,config,http,now));}
  catch{return "unknown";}
}
