import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { billingCustomerBindings, billingInvoices, billingProviderPayments, billingSubscriptions } from "@/infrastructure/db/billing-schema";
import {
  vendeBusinessCalendars, vendeContractTermAudit, vendeContractTerms,
  vendeLifecycleCommands, vendePaymentAttestations,
} from "@/infrastructure/db/vende-commercial-schema";
import { productDefinitions } from "@/infrastructure/db/platform-schema";
import { requireFMPlanAuthority } from "@/application/billing/assistant-plan-catalog-service";
import type { StepUpProof } from "@/application/security/password-step-up";
import type { TenantContext } from "@/domain/security/tenant-context";
import {
  assessVendeDelinquency, fmLocalCivilDate, validateVendeBusinessCalendar,
  type FmApprovedBusinessCalendar,
} from "@/domain/billing/vende-commercial-policy-v1";

/** Internal Command transaction coordinator. Never calls external HTTP.
 * Successful commit means QUEUED, not a license change/remote ACK.
 */
export class VendeC06Denied extends Error {
  constructor(code="vende.c06_authority_or_evidence_denied") {super(code);}
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{3,127}$/;
const REGION=/^[A-Z]{2}(?:-[A-Z]{2})?$/;
function verifiedActor(context:TenantContext,proof:StepUpProof,now:Date):void {
  requireFMPlanAuthority(context,true);
  const delta=now.getTime()-proof.verifiedAt.getTime();
  if(proof.userId!==context.userId || !Number.isFinite(delta) || delta<0 || delta>300_000)
    throw new VendeC06Denied("vende.c06_step_up_required");
}
function evidence(ref:string):string {
  if(typeof ref!=="string" || !SAFE.test(ref))
    throw new VendeC06Denied("vende.c06_source_invalid");
  return ref;
}
function uuid(v:string):string {
  if(typeof v!=="string" || !UUID.test(v))throw new VendeC06Denied("vende.c06_id_invalid");
  return v;
}
async function lock(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], key:string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}
async function requireVende(tx:Parameters<Parameters<typeof db.transaction>[0]>[0],
  tenantId:string, productId:string) {
  const [product]=await tx.select({slug:productDefinitions.slug})
    .from(productDefinitions).where(and(
      eq(productDefinitions.tenantId,tenantId),
      eq(productDefinitions.id,productId),
      eq(productDefinitions.status,"active"),
    )).limit(1);
  if(product?.slug!=="vendeatendeia")throw new VendeC06Denied("vende.c06_product_denied");
}
export type ApprovedCalendarDraft = Readonly<{
  productId:string;region:string;revision:number;validFrom:string;
  validThrough:string;holidays:readonly string[];sourceRef:string;
}>;
export type ApprovedTermDraft = Readonly<{
  productId:string;subscriptionId:string;invoiceId:string;
  effectiveFrom:string;paidThrough:string;dueDate:string;
  calendarRegion:string;sourceRef:string;operationId:string;
  autoRenew:boolean;
}>;

export class GovernedVendeC06Service {
  /** Signed-in FM operator must provide the approved holiday source. No
   * outside municipal calendar is assumed or auto-fetched.
   */
  async publishCalendar(context:TenantContext,proof:StepUpProof,
    draft:ApprovedCalendarDraft,now:Date=new Date()) {
    verifiedActor(context,proof,now);
    uuid(draft.productId);evidence(draft.sourceRef);
    if(!REGION.test(draft.region) || !Number.isSafeInteger(draft.revision) || draft.revision<1)
      throw new VendeC06Denied("vende.calendar_region_or_revision_invalid");
    validateVendeBusinessCalendar({
      authority:"fm_governed_business_calendar",
      revision:`approved-v${draft.revision}`,
      timezone:"America/Sao_Paulo",
      validFrom:draft.validFrom,validThrough:draft.validThrough,
      holidays:[...draft.holidays],
    });
    return db.transaction(async tx=>{
      await lock(tx,`c06.calendar:${context.tenantId}:${draft.productId}:${draft.region}`);
      await requireVende(tx,context.tenantId,draft.productId);
      const [last]=await tx.select({revision:vendeBusinessCalendars.revision})
        .from(vendeBusinessCalendars).where(and(
          eq(vendeBusinessCalendars.tenantId,context.tenantId),
          eq(vendeBusinessCalendars.productId,draft.productId),
          eq(vendeBusinessCalendars.region,draft.region),
        )).orderBy(desc(vendeBusinessCalendars.revision)).limit(1);
      if(draft.revision!==(last?.revision??0)+1)
        throw new VendeC06Denied("vende.calendar_revision_conflict");
      const [added]=await tx.insert(vendeBusinessCalendars).values({
        tenantId:context.tenantId,productId:draft.productId,
        region:draft.region,revision:draft.revision,
        validFrom:draft.validFrom,validThrough:draft.validThrough,
        holidays:[...draft.holidays],sourceRef:draft.sourceRef,
        actorId:context.userId,approvedAt:now,
      }).returning({id:vendeBusinessCalendars.id,revision:vendeBusinessCalendars.revision});
      return added;
    });
  }
  /** First contractual term requires existing reconciled paid invoice.
   * Reviewed due/period dates are NOT invented from invoice creation time.
   */
  async enrollPaidTerm(context:TenantContext,proof:StepUpProof,
    draft:ApprovedTermDraft,now:Date=new Date()) {
    verifiedActor(context,proof,now);
    uuid(draft.productId);uuid(draft.subscriptionId);uuid(draft.invoiceId);
    evidence(draft.sourceRef);evidence(draft.operationId);
    if(!REGION.test(draft.calendarRegion) ||
       typeof draft.autoRenew!=="boolean")
      throw new VendeC06Denied();
    // Date validation reuses the human-approved V1 business rules without
    // fabricating any actual public holiday or currency amount.
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(draft.dueDate) ||
       !/^20\d{2}-\d{2}-\d{2}$/.test(draft.paidThrough) ||
       !/^20\d{2}-\d{2}-\d{2}$/.test(draft.effectiveFrom) ||
       [draft.dueDate,draft.paidThrough,draft.effectiveFrom].some(day=>{
         const date=new Date(day+"T00:00:00Z");
         return !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==day;
       }) || draft.effectiveFrom>draft.paidThrough)
      throw new VendeC06Denied("vende.c06_contract_dates_invalid");
    return db.transaction(async tx=>{
      await lock(tx,`c06.term:${context.tenantId}:${draft.subscriptionId}`);
      await requireVende(tx,context.tenantId,draft.productId);
      const [sub]=await tx.select().from(billingSubscriptions).where(and(
        eq(billingSubscriptions.tenantId,context.tenantId),
        eq(billingSubscriptions.id,draft.subscriptionId),
        eq(billingSubscriptions.productId,draft.productId),
      )).for("update").limit(1);
      if(!sub||sub.status!=="active")throw new VendeC06Denied("vende.c06_subscription_unverified");
      const [invoice]=await tx.select().from(billingInvoices).where(and(
        eq(billingInvoices.tenantId,context.tenantId),
        eq(billingInvoices.id,draft.invoiceId),
        eq(billingInvoices.subscriptionId,draft.subscriptionId),
        eq(billingInvoices.productId,draft.productId),
        eq(billingInvoices.customerId,sub.customerId),
        eq(billingInvoices.status,"paid"),
      )).for("update").limit(1);
      if(!invoice)throw new VendeC06Denied("vende.c06_payment_unverified");
      const [payment]=await tx.select({status:billingProviderPayments.status})
        .from(billingProviderPayments).where(and(
          eq(billingProviderPayments.tenantId,context.tenantId),
          eq(billingProviderPayments.invoiceId,invoice.id),
          eq(billingProviderPayments.gatewayAccountId,invoice.gatewayAccountId),
          eq(billingProviderPayments.status,"received"),
        )).limit(1);
      if(!payment)throw new VendeC06Denied("vende.c06_payment_unverified");
      const [previous]=await tx.select({id:vendeContractTerms.id})
        .from(vendeContractTerms).where(and(
          eq(vendeContractTerms.tenantId,context.tenantId),
          eq(vendeContractTerms.subscriptionId,draft.subscriptionId),
        )).limit(1);
      if(previous)throw new VendeC06Denied("vende.c06_contract_already_exists");
      const [term]=await tx.insert(vendeContractTerms).values({
        tenantId:context.tenantId,productId:draft.productId,
        subscriptionId:draft.subscriptionId,customerId:sub.customerId,
        revision:1,effectiveFrom:draft.effectiveFrom,paidThrough:draft.paidThrough,
        dueDate:draft.dueDate,autoRenew:draft.autoRenew,
        calendarRegion:draft.calendarRegion,lifecycleState:"active",
        sourceRef:draft.sourceRef,actorId:context.userId,
      }).returning({id:vendeContractTerms.id,revision:vendeContractTerms.revision});
      await tx.insert(vendeContractTermAudit).values({
        tenantId:context.tenantId,subscriptionId:draft.subscriptionId,
        revision:1,operationId:draft.operationId,action:"ENROLL_PAID_TERM",
        actorId:context.userId,previousState:null,newState:"active",
        effectiveDate:draft.effectiveFrom,sourceRef:draft.sourceRef,
      });
      return term;
    });
  }
  /** FM-authorized non-renewal scheduling. This changes the Command's
   * auto-renew flag now while preserving paid entitlement until its period end.
   * Never sends an immediate suspend/cancel instruction to the Assistant.
   * The sourceRef must identify a verified customer consent record reviewed
   * by FM; real consent verification remains a separate admission dependency.
   */
  async scheduleCancellation(context:TenantContext,proof:StepUpProof,input:{
    productId:string;subscriptionId:string;expectedRevision:number;
    operationId:string;customerConsentRef:string;
  },now:Date=new Date()) {
    verifiedActor(context,proof,now);
    uuid(input.productId);uuid(input.subscriptionId);
    evidence(input.operationId);evidence(input.customerConsentRef);
    if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)
      throw new VendeC06Denied("vende.c06_revision_invalid");
    const today=fmLocalCivilDate(now);
    return db.transaction(async tx=>{
      await lock(tx,`c06.term:${context.tenantId}:${input.subscriptionId}`);
      await requireVende(tx,context.tenantId,input.productId);
      const [term]=await tx.select().from(vendeContractTerms).where(and(
        eq(vendeContractTerms.tenantId,context.tenantId),
        eq(vendeContractTerms.subscriptionId,input.subscriptionId),
        eq(vendeContractTerms.productId,input.productId),
      )).for("update").limit(1);
      if(!term || term.revision!==input.expectedRevision ||
          !["active","past_due","suspended"].includes(term.lifecycleState) ||
          term.paidThrough<today || !term.autoRenew)
        throw new VendeC06Denied("vende.c06_cancel_contract_unavailable");
      const [subscription]=await tx.select().from(billingSubscriptions).where(and(
        eq(billingSubscriptions.tenantId,context.tenantId),
        eq(billingSubscriptions.id,term.subscriptionId),
        eq(billingSubscriptions.productId,term.productId),
        eq(billingSubscriptions.customerId,term.customerId),
      )).for("update").limit(1);
      if(!subscription || subscription.status==="cancelled")
        throw new VendeC06Denied("vende.c06_subscription_unavailable");
      const [binding]=await tx.select({
        externalTenantId:billingCustomerBindings.externalTenantId,
      }).from(billingCustomerBindings).where(and(
        eq(billingCustomerBindings.tenantId,context.tenantId),
        eq(billingCustomerBindings.customerId,term.customerId),
        eq(billingCustomerBindings.productId,term.productId),
      )).limit(1);
      if(!binding?.externalTenantId)
        throw new VendeC06Denied("vende.c06_vertical_binding_missing");
      const nextRevision=term.revision+1;
      const [updated]=await tx.update(vendeContractTerms).set({
        revision:nextRevision,lifecycleState:"cancel_at_period_end",
        autoRenew:false,actorId:context.userId,updatedAt:now,
      }).where(and(eq(vendeContractTerms.id,term.id),
        eq(vendeContractTerms.revision,term.revision),
        eq(vendeContractTerms.tenantId,context.tenantId),
      )).returning({revision:vendeContractTerms.revision});
      if(!updated)throw new VendeC06Denied("vende.c06_revision_conflict");
      await tx.insert(vendeContractTermAudit).values({
        tenantId:context.tenantId,subscriptionId:term.subscriptionId,
        revision:nextRevision,operationId:input.operationId,
        action:"SCHEDULE_CANCEL",actorId:context.userId,
        previousState:term.lifecycleState,newState:"cancel_at_period_end",
        effectiveDate:term.paidThrough,sourceRef:input.customerConsentRef,
      });
      await tx.insert(vendeLifecycleCommands).values({
        tenantId:context.tenantId,productId:term.productId,
        subscriptionId:term.subscriptionId,customerId:term.customerId,
        operationId:input.operationId,
        expectedRevision:term.revision,revision:nextRevision,
        action:"SCHEDULE_CANCEL",state:"pending",
        externalTenantId:binding.externalTenantId,
        effectiveDate:term.paidThrough,sourceRef:input.customerConsentRef,
        actorId:context.userId,
      });
      return {operationId:input.operationId,revision:nextRevision,
        state:"cancel_at_period_end" as const,paidAccessUntil:term.paidThrough,
        autoRenew:false,remoteEntitlementConfirmed:false};
    });
  }

  /** Reactivation for the SAME customer/tenant/subscription after a new
   * verified payment. A remote Assistant ACK is still required: the term
   * becomes reactivation_pending and NOT active after this transaction.
   */
  async requestRegularization(context:TenantContext,proof:StepUpProof,input:{
    productId:string;subscriptionId:string;paidInvoiceId:string;
    expectedRevision:number;operationId:string;sourceRef:string;
  },now:Date=new Date()) {
    verifiedActor(context,proof,now);
    uuid(input.productId);uuid(input.subscriptionId);uuid(input.paidInvoiceId);
    evidence(input.operationId);evidence(input.sourceRef);
    if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)
      throw new VendeC06Denied("vende.c06_revision_invalid");
    const today=fmLocalCivilDate(now);
    return db.transaction(async tx=>{
      await lock(tx,`c06.term:${context.tenantId}:${input.subscriptionId}`);
      await requireVende(tx,context.tenantId,input.productId);
      const [term]=await tx.select().from(vendeContractTerms).where(and(
        eq(vendeContractTerms.tenantId,context.tenantId),
        eq(vendeContractTerms.subscriptionId,input.subscriptionId),
        eq(vendeContractTerms.productId,input.productId),
      )).for("update").limit(1);
      if(!term || term.revision!==input.expectedRevision ||
         term.lifecycleState!=="suspended" ||
         term.paidThrough<today)
        throw new VendeC06Denied("vende.c06_regularization_not_eligible");
      const [invoice]=await tx.select().from(billingInvoices).where(and(
        eq(billingInvoices.tenantId,context.tenantId),
        eq(billingInvoices.id,input.paidInvoiceId),
        eq(billingInvoices.subscriptionId,term.subscriptionId),
        eq(billingInvoices.productId,term.productId),
        eq(billingInvoices.customerId,term.customerId),
      )).for("update").limit(1);
      if(!invoice || invoice.status!=="paid" || invoice.currency!=="BRL")
        throw new VendeC06Denied("vende.c06_regularization_payment_invalid");
      const [payment]=await tx.select().from(billingProviderPayments).where(and(
        eq(billingProviderPayments.tenantId,context.tenantId),
        eq(billingProviderPayments.invoiceId,invoice.id),
        eq(billingProviderPayments.gatewayAccountId,invoice.gatewayAccountId),
        eq(billingProviderPayments.status,"received"),
      )).limit(1);
      if(!payment)throw new VendeC06Denied("vende.c06_regularization_payment_invalid");
      const [attestation]=await tx.select().from(vendePaymentAttestations).where(and(
        eq(vendePaymentAttestations.tenantId,context.tenantId),
        eq(vendePaymentAttestations.invoiceId,invoice.id),
      )).orderBy(desc(vendePaymentAttestations.verifiedAt),
        desc(vendePaymentAttestations.createdAt),
    desc(vendePaymentAttestations.observationSequence)).limit(1);
      if(!attestation || attestation.outcome!=="settled_verified" ||
         attestation.verifiedAt.getTime()>now.getTime()+15_000 ||
         now.getTime()-attestation.verifiedAt.getTime()>15*60_000)
        throw new VendeC06Denied("vende.c06_settlement_attestation_stale");
      const [subscription]=await tx.select().from(billingSubscriptions).where(and(
        eq(billingSubscriptions.tenantId,context.tenantId),
        eq(billingSubscriptions.id,term.subscriptionId),
        eq(billingSubscriptions.customerId,term.customerId),
        eq(billingSubscriptions.productId,term.productId),
      )).for("update").limit(1);
      if(!subscription || subscription.status==="cancelled")
        throw new VendeC06Denied("vende.c06_cancelled_must_recontract");
      const [binding]=await tx.select({
        externalTenantId:billingCustomerBindings.externalTenantId,
      }).from(billingCustomerBindings).where(and(
        eq(billingCustomerBindings.tenantId,context.tenantId),
        eq(billingCustomerBindings.customerId,term.customerId),
        eq(billingCustomerBindings.productId,term.productId),
      )).limit(1);
      if(!binding?.externalTenantId)
        throw new VendeC06Denied("vende.c06_vertical_binding_missing");
      const nextRevision=term.revision+1;
      const [updated]=await tx.update(vendeContractTerms).set({
        revision:nextRevision,lifecycleState:"reactivation_pending",
        updatedAt:now,actorId:context.userId,
      }).where(and(eq(vendeContractTerms.id,term.id),
        eq(vendeContractTerms.tenantId,context.tenantId),
        eq(vendeContractTerms.revision,term.revision),
      )).returning({revision:vendeContractTerms.revision});
      if(!updated)throw new VendeC06Denied("vende.c06_revision_conflict");
      await tx.insert(vendeContractTermAudit).values({
        tenantId:context.tenantId,subscriptionId:term.subscriptionId,
        revision:nextRevision,operationId:input.operationId,
        action:"REACTIVATE_VERIFIED",actorId:context.userId,
        previousState:term.lifecycleState,newState:"reactivation_pending",
        effectiveDate:today,sourceRef:input.sourceRef,
      });
      await tx.insert(vendeLifecycleCommands).values({
        tenantId:context.tenantId,productId:term.productId,
        subscriptionId:term.subscriptionId,customerId:term.customerId,
        operationId:input.operationId,expectedRevision:term.revision,
        sourceInvoiceId:input.paidInvoiceId,
        revision:nextRevision,action:"REACTIVATE_VERIFIED",state:"pending",
        externalTenantId:binding.externalTenantId,
        effectiveDate:today,sourceRef:input.sourceRef,actorId:context.userId,
      });
      return {state:"reactivation_pending" as const,
        revision:nextRevision,operationId:input.operationId,
        preservedIds:{customerId:term.customerId,subscriptionId:term.subscriptionId,
          externalTenantId:binding.externalTenantId},
        remoteEntitlementConfirmed:false};
    });
  }

  /** Transactional admission for overdue suspension: NEVER a gateway request
   * or a delivered license. Fresh 'unpaid' proof must come from trusted
   * provider reconciliation ledger. All changes rollback atomically.
   */
  async requestSuspension(context:TenantContext,proof:StepUpProof,input:{
    productId:string;subscriptionId:string;invoiceId:string;
    expectedRevision:number;operationId:string;sourceRef:string;
  },now:Date=new Date()) {
    verifiedActor(context,proof,now);
    uuid(input.productId);uuid(input.subscriptionId);uuid(input.invoiceId);
    evidence(input.operationId);evidence(input.sourceRef);
    if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)
      throw new VendeC06Denied("vende.c06_revision_invalid");
    const today=fmLocalCivilDate(now);
    return db.transaction(async tx=>{
      await lock(tx,`c06.term:${context.tenantId}:${input.subscriptionId}`);
      await requireVende(tx,context.tenantId,input.productId);
      const [term]=await tx.select().from(vendeContractTerms).where(and(
        eq(vendeContractTerms.tenantId,context.tenantId),
        eq(vendeContractTerms.subscriptionId,input.subscriptionId),
        eq(vendeContractTerms.productId,input.productId),
      )).for("update").limit(1);
      if(!term||term.revision!==input.expectedRevision ||
         !["active","past_due"].includes(term.lifecycleState))
        throw new VendeC06Denied("vende.c06_state_or_revision_changed");
      const [invoice]=await tx.select().from(billingInvoices).where(and(
        eq(billingInvoices.tenantId,context.tenantId),
        eq(billingInvoices.id,input.invoiceId),
        eq(billingInvoices.subscriptionId,term.subscriptionId),
        eq(billingInvoices.customerId,term.customerId),
        eq(billingInvoices.productId,input.productId),
      )).for("update").limit(1);
      if(!invoice||invoice.status!=="pending")
        throw new VendeC06Denied("vende.c06_invoice_no_longer_overdue");
      // The last independent provider observation takes precedence.
      const [attestation]=await tx.select().from(vendePaymentAttestations).where(and(
        eq(vendePaymentAttestations.tenantId,context.tenantId),
        eq(vendePaymentAttestations.invoiceId,input.invoiceId),
      )).orderBy(desc(vendePaymentAttestations.verifiedAt),
        desc(vendePaymentAttestations.createdAt),
    desc(vendePaymentAttestations.observationSequence)).limit(1);
      if(!attestation || attestation.outcome!=="unpaid_verified" ||
         attestation.verifiedAt.getTime()>now.getTime()+15_000 ||
         now.getTime()-attestation.verifiedAt.getTime()>15*60_000)
        throw new VendeC06Denied("vende.c06_unpaid_evidence_missing_or_stale");
      const [calendar]=await tx.select().from(vendeBusinessCalendars).where(and(
        eq(vendeBusinessCalendars.tenantId,context.tenantId),
        eq(vendeBusinessCalendars.productId,input.productId),
        eq(vendeBusinessCalendars.region,term.calendarRegion),
      )).orderBy(desc(vendeBusinessCalendars.revision)).limit(1);
      const proofCalendar: FmApprovedBusinessCalendar|null=calendar?{
        authority:"fm_governed_business_calendar",
        revision:`approved-v${calendar.revision}`,
        timezone:"America/Sao_Paulo",
        validFrom:calendar.validFrom,validThrough:calendar.validThrough,
        holidays:calendar.holidays,
      }:null;
      const decision=assessVendeDelinquency({
        dueDate:term.dueDate,asOfDate:today,
        contractState:term.lifecycleState as "active"|"past_due",
        paymentState:"unpaid_verified_by_authorized_gateway",
        calendar:proofCalendar,
      });
      if(decision.decision!=="candidate_for_governed_suspension")
        throw new VendeC06Denied("vende.c06_grace_period_not_completed");
      const [binding]=await tx.select({externalTenantId:billingCustomerBindings.externalTenantId})
        .from(billingCustomerBindings).where(and(
          eq(billingCustomerBindings.tenantId,context.tenantId),
          eq(billingCustomerBindings.productId,input.productId),
          eq(billingCustomerBindings.customerId,term.customerId),
        )).limit(1);
      if(!binding || !binding.externalTenantId)
        throw new VendeC06Denied("vende.c06_vertical_binding_missing");
      const newRevision=term.revision+1;
      const [updated]=await tx.update(vendeContractTerms).set({
        revision:newRevision,lifecycleState:"suspension_pending",
        actorId:context.userId,updatedAt:now,
      }).where(and(
        eq(vendeContractTerms.id,term.id),
        eq(vendeContractTerms.tenantId,context.tenantId),
        eq(vendeContractTerms.revision,term.revision),
      )).returning({revision:vendeContractTerms.revision});
      if(!updated)throw new VendeC06Denied("vende.c06_revision_conflict");
      await tx.insert(vendeContractTermAudit).values({
        tenantId:context.tenantId,subscriptionId:term.subscriptionId,
        revision:newRevision,operationId:input.operationId,
        action:"SUSPEND_DELINQUENCY",actorId:context.userId,
        previousState:term.lifecycleState,newState:"suspension_pending",
        effectiveDate:today,sourceRef:input.sourceRef,
      });
      const [command]=await tx.insert(vendeLifecycleCommands).values({
        tenantId:context.tenantId,productId:input.productId,
        subscriptionId:term.subscriptionId,customerId:term.customerId,
        operationId:input.operationId,sourceInvoiceId:input.invoiceId,
        expectedRevision:term.revision,revision:newRevision,
        action:"SUSPEND_DELINQUENCY",state:"pending",
        externalTenantId:binding.externalTenantId,effectiveDate:today,
        sourceRef:input.sourceRef,actorId:context.userId,
      }).returning({id:vendeLifecycleCommands.id,state:vendeLifecycleCommands.state});
      return {operationId:input.operationId,revision:newRevision,
        state:command.state,remoteEntitlementConfirmed:false,
        scheduledFrom:decision.earliestSuspensionDate};
    });
  }
}
