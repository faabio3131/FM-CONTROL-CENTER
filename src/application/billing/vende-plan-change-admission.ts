/** B1.16 — FM-governed paid upgrade / deferred paid downgrade intent.
 * Admission never modifies the customer plan, paid days, quotas or invoices.
 */
import {and,eq} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {billingCustomerBindings,billingInvoices,billingProductPlans,
  billingProviderPayments,billingSubscriptions} from "@/infrastructure/db/billing-schema";
import {assistantPlanRevisions} from "@/infrastructure/db/assistant-plan-schema";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import {vendeContractTerms,vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {currentBoundVendePaymentEvidence} from "./vende-payment-evidence";
import {fmPaidThroughExclusiveInstant} from "@/domain/billing/vende-commercial-policy-v1";
import {nextVendePaidThrough} from "@/domain/billing/vende-renewal-period";
import {requireVendePlanChange,type VendePlanChangeAction} from "@/domain/billing/vende-plan-change-policy";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import type {TenantContext} from "@/domain/security/tenant-context";
import type {StepUpProof} from "@/application/security/password-step-up";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REF=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{3,127}$/;
const CODE=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
export class VendePlanChangeAdmissionDenied extends Error{
  constructor(){super("vende.plan_change_admission_denied");}
}
const denied=():never=>{throw new VendePlanChangeAdmissionDenied();};
export type VendeChangeInput={
  productId:string;subscriptionId:string;paidInvoiceId:string;
  expectedRevision:number;oldPlanRevision:number;targetPlanRevision:number;
  targetPlanCode:string;operationId:string;sourceRef:string;customerConsentRef:string;
};
export async function certifiedVendePlanPair(
  tx:Tx,tenantId:string,productId:string,oldPlanCode:string,newPlanCode:string,
  oldPlanRevision:number,targetPlanRevision:number,action:VendePlanChangeAction,
){
  const [oldPlan]=await tx.select().from(assistantPlanRevisions).where(and(
    eq(assistantPlanRevisions.tenantId,tenantId),eq(assistantPlanRevisions.productId,productId),
    eq(assistantPlanRevisions.planCode,oldPlanCode),
    eq(assistantPlanRevisions.revision,oldPlanRevision),
    eq(assistantPlanRevisions.status,"published"),
  )).limit(1);
  const [newPlan]=await tx.select().from(assistantPlanRevisions).where(and(
    eq(assistantPlanRevisions.tenantId,tenantId),eq(assistantPlanRevisions.productId,productId),
    eq(assistantPlanRevisions.planCode,newPlanCode),
    eq(assistantPlanRevisions.revision,targetPlanRevision),
    eq(assistantPlanRevisions.status,"published"),
  )).limit(1);
  const [oldBill]=await tx.select().from(billingProductPlans).where(and(
    eq(billingProductPlans.tenantId,tenantId),eq(billingProductPlans.productId,productId),
    eq(billingProductPlans.planCode,oldPlanCode),eq(billingProductPlans.status,"active"),
  )).limit(1);
  const [newBill]=await tx.select().from(billingProductPlans).where(and(
    eq(billingProductPlans.tenantId,tenantId),eq(billingProductPlans.productId,productId),
    eq(billingProductPlans.planCode,newPlanCode),eq(billingProductPlans.status,"active"),
  )).limit(1);
  if(!oldPlan||!newPlan||!oldBill||!newBill||oldPlan.currency!=="BRL"||
     newPlan.currency!=="BRL"||oldBill.currency!=="BRL"||newBill.currency!=="BRL"||
     oldPlan.billingInterval!==oldBill.interval||
     newPlan.billingInterval!==newBill.interval||
     oldPlan.amountMinor!==oldBill.amountMinor||newPlan.amountMinor!==newBill.amountMinor)
    return denied();
  requireVendePlanChange(action,{
    oldPlanCode,newPlanCode,oldPriceMinor:oldBill.amountMinor,newPriceMinor:newBill.amountMinor,
    oldInterval:oldBill.interval,newInterval:newBill.interval,
    oldAllowances:oldPlan.allowances,newAllowances:newPlan.allowances,
  });
  return {oldPlan,newPlan,oldBill,newBill};
}
/** Audited only after receipt of exact PSP attestation; price/expiry/quotas are
 * never taken from arbitrary client JSON. No commercial change applied yet. */
export async function requestVerifiedVendePlanChange(
  context:TenantContext,proof:StepUpProof,action:VendePlanChangeAction,
  input:VendeChangeInput,now:Date=new Date(),
){
  requireFMPlanAuthority(context,true);
  const age=now.getTime()-proof.verifiedAt.getTime();
  if(!["APPLY_UPGRADE","APPLY_DOWNGRADE"].includes(action)||
     ![input.productId,input.subscriptionId,input.paidInvoiceId].every(x=>typeof x==="string"&&UUID.test(x))||
     ![input.operationId,input.sourceRef,input.customerConsentRef].every(x=>typeof x==="string"&&REF.test(x))||
     typeof input.targetPlanCode!=="string"||!CODE.test(input.targetPlanCode)||
     ![input.expectedRevision,input.oldPlanRevision,input.targetPlanRevision].every(x=>Number.isSafeInteger(x)&&x>=1)||
     proof.userId!==context.userId||!Number.isFinite(age)||age<0||age>300_000)return denied();
  return db.transaction(async tx=>{
    const [product]=await tx.select({id:productDefinitions.id}).from(productDefinitions).where(and(
      eq(productDefinitions.tenantId,context.tenantId),
      eq(productDefinitions.id,input.productId),eq(productDefinitions.slug,"vendeatendeia"),
      eq(productDefinitions.status,"active"),
    )).limit(1);
    if(!product)return denied();
    const [term]=await tx.select().from(vendeContractTerms).where(and(
      eq(vendeContractTerms.tenantId,context.tenantId),
      eq(vendeContractTerms.productId,input.productId),
      eq(vendeContractTerms.subscriptionId,input.subscriptionId),
    )).for("update").limit(1);
    if(!term||term.revision!==input.expectedRevision||
       term.lifecycleState!=="active"||!term.autoRenew)return denied();
    const [invoice]=await tx.select().from(billingInvoices).where(and(
      eq(billingInvoices.tenantId,context.tenantId),eq(billingInvoices.id,input.paidInvoiceId),
      eq(billingInvoices.productId,input.productId),
      eq(billingInvoices.subscriptionId,term.subscriptionId),
      eq(billingInvoices.customerId,term.customerId),
    )).for("update").limit(1);
    if(!invoice||invoice.status!=="paid"||invoice.currency!=="BRL"||
       invoice.createdAt<=term.createdAt)return denied();
    const [payment]=await tx.select().from(billingProviderPayments).where(and(
      eq(billingProviderPayments.tenantId,context.tenantId),
      eq(billingProviderPayments.invoiceId,invoice.id),
      eq(billingProviderPayments.gatewayAccountId,invoice.gatewayAccountId),
    )).limit(1);
    if(!payment||payment.status!=="received")return denied();
    const evidence=await currentBoundVendePaymentEvidence(tx,invoice,now);
    if(!evidence||evidence.outcome!=="settled_verified")return denied();
    const [used]=await tx.select({id:vendeLifecycleCommands.id}).from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.tenantId,context.tenantId),
      eq(vendeLifecycleCommands.sourceInvoiceId,invoice.id),
    )).limit(1);
    if(used)return denied();
    const [subscription]=await tx.select().from(billingSubscriptions).where(and(
      eq(billingSubscriptions.tenantId,context.tenantId),
      eq(billingSubscriptions.id,term.subscriptionId),
      eq(billingSubscriptions.productId,input.productId),
      eq(billingSubscriptions.customerId,term.customerId),
    )).for("update").limit(1);
    if(!subscription||subscription.status!=="active"||
       subscription.planCode===input.targetPlanCode)return denied();
    const [binding]=await tx.select({externalTenantId:billingCustomerBindings.externalTenantId})
      .from(billingCustomerBindings).where(and(
        eq(billingCustomerBindings.tenantId,context.tenantId),
        eq(billingCustomerBindings.productId,input.productId),
        eq(billingCustomerBindings.customerId,term.customerId),
      )).limit(1);
    if(!binding?.externalTenantId)return denied();
    const pair=await certifiedVendePlanPair(tx,context.tenantId,input.productId,
      subscription.planCode,input.targetPlanCode,input.oldPlanRevision,input.targetPlanRevision,action);
    if(invoice.amountMinor!==pair.newBill.amountMinor)return denied();
    const previousValidUntil=fmPaidThroughExclusiveInstant(term.paidThrough).getTime()/1000;
    if(previousValidUntil<=now.getTime()/1000)return denied();
    const downgrade=action==="APPLY_DOWNGRADE";
    const next=downgrade
      ?nextVendePaidThrough(term.paidThrough,pair.newBill.interval as "monthly"|"yearly")
      :{paidThrough:term.paidThrough,validUntil:previousValidUntil};
    const dueDate=downgrade
      ?nextVendePaidThrough(term.dueDate,pair.newBill.interval as "monthly"|"yearly").paidThrough
      :term.dueDate;
    const target={
      schema:"fm.vende.plan-change-target.v1" as const,
      previousPlanCode:subscription.planCode,previousPlanRevision:input.oldPlanRevision,
      previousAmountMinor:pair.oldBill.amountMinor,previousValidUntil,
      planCode:input.targetPlanCode,planRevision:input.targetPlanRevision,
      validUntil:next.validUntil,paymentRef:evidence.externalPaymentRef,
      termsRevision:term.revision+1,paidThrough:next.paidThrough,nextDueDate:dueDate,
      amountMinor:invoice.amountMinor,billingInterval:pair.newBill.interval as "monthly"|"yearly",
    };
    await tx.insert(vendeLifecycleCommands).values({
      tenantId:context.tenantId,productId:input.productId,
      subscriptionId:term.subscriptionId,customerId:term.customerId,
      sourceInvoiceId:invoice.id,operationId:input.operationId,
      expectedRevision:term.revision,revision:term.revision+1,
      action,state:"pending",externalTenantId:binding.externalTenantId,
      effectiveDate:downgrade?term.paidThrough:next.paidThrough,
      sourceRef:input.sourceRef,actorId:context.userId,
      approvedAt:proof.verifiedAt,deliveryTarget:target,
    });
    await tx.insert(auditEvents).values({
      tenantId:context.tenantId,actorId:context.userId,actorType:"user",
      action:"vende.plan_change_intent.accepted",resourceType:"vende_lifecycle_command",
      resourceId:input.operationId,result:"pending_remote_ack",
      correlationId:context.correlationId,metadata:{
        action,productId:input.productId,subscriptionId:term.subscriptionId,
        invoiceId:invoice.id,customerConsentRef:input.customerConsentRef,
        previousPlanCode:subscription.planCode,previousPlanRevision:input.oldPlanRevision,
        targetPlanCode:input.targetPlanCode,targetPlanRevision:input.targetPlanRevision,
        billingInterval:pair.newBill.interval,amountMinor:invoice.amountMinor,
        previousPaidThrough:term.paidThrough,targetPaidThrough:next.paidThrough,
        sourceRef:input.sourceRef},
    });
    return {state:"pending" as const,action,operationId:input.operationId,
      revision:term.revision+1,targetPlanCode:input.targetPlanCode,
      effectiveDate:downgrade?term.paidThrough:next.paidThrough,
      remoteEntitlementConfirmed:false};
  });
}
