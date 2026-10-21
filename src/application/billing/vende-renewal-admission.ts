/** B1.14 — governed renewal INTENT, not remote entitlement.
 * Existing contract remains active at its previous paid boundary until a
 * separately certified signed Assistant ACK. Prices come from FM catalog.
 */
import {and,eq} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {billingCustomerBindings,billingInvoices,billingProductPlans,
  billingProviderPayments,billingSubscriptions} from "@/infrastructure/db/billing-schema";
import {assistantPlanRevisions} from "@/infrastructure/db/assistant-plan-schema";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import {vendeContractTerms,vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {fmPaidThroughExclusiveInstant} from "@/domain/billing/vende-commercial-policy-v1";
import {nextVendePaidThrough} from "@/domain/billing/vende-renewal-period";
import {currentBoundVendePaymentEvidence} from "./vende-payment-evidence";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import type {TenantContext} from "@/domain/security/tenant-context";
import type {StepUpProof} from "@/application/security/password-step-up";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REF=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{3,127}$/;
export class VendeRenewalAdmissionDenied extends Error{
  constructor(){super("vende.renewal_admission_denied");}
}
const denied=():never=>{throw new VendeRenewalAdmissionDenied();};

export async function requestVerifiedVendeRenewal(
  context:TenantContext,proof:StepUpProof,
  input:{
    productId:string;subscriptionId:string;paidInvoiceId:string;
    expectedRevision:number;planRevision:number;operationId:string;
    sourceRef:string;customerConsentRef:string;
  },
  now:Date=new Date(),
){
  requireFMPlanAuthority(context,true);
  const age=now.getTime()-proof.verifiedAt.getTime();
  if(![input.productId,input.subscriptionId,input.paidInvoiceId].every(x=>typeof x==="string"&&UUID.test(x))||
     ![input.operationId,input.sourceRef,input.customerConsentRef].every(x=>typeof x==="string"&&REF.test(x))||
     !Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||
     !Number.isSafeInteger(input.planRevision)||input.planRevision<1||
     proof.userId!==context.userId||!Number.isFinite(age)||age<0||age>300_000)return denied();
  return db.transaction(async tx=>{
    const [product]=await tx.select({id:productDefinitions.id}).from(productDefinitions).where(and(
      eq(productDefinitions.tenantId,context.tenantId),
      eq(productDefinitions.id,input.productId),
      eq(productDefinitions.slug,"vendeatendeia"),
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
    // The original enrollment invoice predates contract creation and cannot
    // be reused to buy the first renewal. An invoice must be a later cycle.
    if(!invoice||invoice.currency!=="BRL"||invoice.status!=="paid"||
       invoice.createdAt<=term.createdAt)return denied();
    const [payment]=await tx.select().from(billingProviderPayments).where(and(
      eq(billingProviderPayments.tenantId,context.tenantId),
      eq(billingProviderPayments.invoiceId,invoice.id),
      eq(billingProviderPayments.gatewayAccountId,invoice.gatewayAccountId),
    )).limit(1);
    if(!payment||payment.status!=="received")return denied();
    const settled=await currentBoundVendePaymentEvidence(tx,invoice,now);
    if(!settled||settled.outcome!=="settled_verified")return denied();
    // One provider settlement cannot buy multiple vertical license periods.
    const [spent]=await tx.select({id:vendeLifecycleCommands.id}).from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.tenantId,context.tenantId),
      eq(vendeLifecycleCommands.sourceInvoiceId,invoice.id),
    )).limit(1);
    if(spent)return denied();
    const [subscription]=await tx.select().from(billingSubscriptions).where(and(
      eq(billingSubscriptions.tenantId,context.tenantId),
      eq(billingSubscriptions.id,input.subscriptionId),
      eq(billingSubscriptions.productId,input.productId),
      eq(billingSubscriptions.customerId,term.customerId),
    )).for("update").limit(1);
    if(!subscription||subscription.status!=="active")return denied();
    const [binding]=await tx.select({externalTenantId:billingCustomerBindings.externalTenantId})
      .from(billingCustomerBindings).where(and(
        eq(billingCustomerBindings.tenantId,context.tenantId),
        eq(billingCustomerBindings.productId,input.productId),
        eq(billingCustomerBindings.customerId,term.customerId),
      )).limit(1);
    if(!binding?.externalTenantId)return denied();
    // Both FM catalogs must agree on active price and interval. No price,
    // cycle or expiry supplied by a frontend can override this authority.
    const [billingPlan]=await tx.select().from(billingProductPlans).where(and(
      eq(billingProductPlans.tenantId,context.tenantId),
      eq(billingProductPlans.productId,input.productId),
      eq(billingProductPlans.planCode,subscription.planCode),
      eq(billingProductPlans.status,"active"),
    )).limit(1);
    const [aiPlan]=await tx.select().from(assistantPlanRevisions).where(and(
      eq(assistantPlanRevisions.tenantId,context.tenantId),
      eq(assistantPlanRevisions.productId,input.productId),
      eq(assistantPlanRevisions.planCode,subscription.planCode),
      eq(assistantPlanRevisions.revision,input.planRevision),
      eq(assistantPlanRevisions.status,"published"),
    )).limit(1);
    if(!billingPlan||!aiPlan||billingPlan.currency!=="BRL"||aiPlan.currency!=="BRL"||
       billingPlan.interval!==aiPlan.billingInterval||
       !["monthly","yearly"].includes(aiPlan.billingInterval)||
       billingPlan.amountMinor!==aiPlan.amountMinor||invoice.amountMinor!==aiPlan.amountMinor)
      return denied();
    const interval=aiPlan.billingInterval as "monthly"|"yearly";
    const period=nextVendePaidThrough(term.paidThrough,interval);
    if(period.validUntil<=now.getTime()/1000)return denied();
    const nextDueDate=nextVendePaidThrough(term.dueDate,interval).paidThrough;
    const previousValidUntil=fmPaidThroughExclusiveInstant(term.paidThrough).getTime()/1000;
    const nextRevision=term.revision+1;
    const target={
      schema:"fm.vende.renewal-target.v1" as const,
      planCode:subscription.planCode,planRevision:aiPlan.revision,
      validUntil:period.validUntil,paymentRef:settled.externalPaymentRef,
      termsRevision:nextRevision,previousValidUntil,
      paidThrough:period.paidThrough,nextDueDate,
      amountMinor:invoice.amountMinor,billingInterval:interval,
    };
    await tx.insert(vendeLifecycleCommands).values({
      tenantId:context.tenantId,productId:term.productId,
      subscriptionId:term.subscriptionId,customerId:term.customerId,
      sourceInvoiceId:invoice.id,
      operationId:input.operationId,expectedRevision:term.revision,revision:nextRevision,
      action:"RENEW_VERIFIED",state:"pending",externalTenantId:binding.externalTenantId,
      effectiveDate:period.paidThrough,sourceRef:input.sourceRef,actorId:context.userId,
      approvedAt:proof.verifiedAt,deliveryTarget:target,
    });
    await tx.insert(auditEvents).values({
      tenantId:context.tenantId,actorId:context.userId,actorType:"user",
      action:"vende.renewal_intent.accepted",resourceType:"vende_lifecycle_command",
      resourceId:input.operationId,result:"pending_remote_ack",
      correlationId:context.correlationId,
      metadata:{schema:"fm.vende.renewal-intent.v1",subscriptionId:term.subscriptionId,
        productId:term.productId,customerConsentRef:input.customerConsentRef,
        invoiceId:invoice.id,priceMinor:invoice.amountMinor,priceRevision:aiPlan.revision,
        planCode:subscription.planCode,billingInterval:interval,
        oldPaidThrough:term.paidThrough,newPaidThrough:period.paidThrough,
        sourceRef:input.sourceRef},
    });
    return {state:"pending" as const,operationId:input.operationId,revision:nextRevision,
      paidThrough:period.paidThrough,amountMinor:invoice.amountMinor,
      currency:"BRL" as const,remoteEntitlementConfirmed:false};
  });
}
