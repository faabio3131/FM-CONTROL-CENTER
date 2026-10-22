/** Human-authorized READ ONLY confirmation of an existing FM compensation case.
 * Separate from remediation. This cannot write to Assistant/PSP or change
 * a contract, and cannot resolve/escalate a case by inference.
 */
import {and,eq} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {billingInvoices} from "@/infrastructure/db/billing-schema";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {currentBoundVendePaymentEvidence} from "./vende-payment-evidence";
import {VENDE_COMPENSATION_REVIEW_ACTION} from "./vende-compensation-risk";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import {hasFreshVendeApproval,requireVendeCommercialDelivery,
  readVendeCommercialSnapshot} from "./vende-c06-delivery";
import type {TenantContext} from "@/domain/security/tenant-context";
import type {StepUpProof} from "@/application/security/password-step-up";
import type {PlanProjectionConfig} from "./assistant-plan-outbox-dispatcher";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRIAGE="vende.compensation_review.triaged";
const ACTION="vende.compensation_review.remote_observed";
const denied=():never=>{throw new Error("vende.compensation_observation_denied");};
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function currentCase(tx:Tx,context:TenantContext,productId:string,commandId:string){
  const [p]=await tx.select({id:productDefinitions.id}).from(productDefinitions).where(and(
    eq(productDefinitions.tenantId,context.tenantId),eq(productDefinitions.id,productId),
    eq(productDefinitions.slug,"vendeatendeia"),eq(productDefinitions.status,"active"),
  )).limit(1);
  if(!p)return denied();
  const [row]=await tx.select().from(vendeLifecycleCommands).where(and(
    eq(vendeLifecycleCommands.id,commandId),
    eq(vendeLifecycleCommands.productId,productId),
    eq(vendeLifecycleCommands.tenantId,context.tenantId),
  )).limit(1);
  if(!row)return denied();
  const [risk]=await tx.select({id:auditEvents.id}).from(auditEvents).where(and(
    eq(auditEvents.tenantId,context.tenantId),
    eq(auditEvents.action,VENDE_COMPENSATION_REVIEW_ACTION),
    eq(auditEvents.resourceType,"vende_lifecycle_command"),
    eq(auditEvents.resourceId,commandId),
  )).limit(1);
  if(!risk)return denied();
  const reviewRows=await tx.select({metadata:auditEvents.metadata})
    .from(auditEvents).where(and(
      eq(auditEvents.tenantId,context.tenantId),
      eq(auditEvents.action,TRIAGE),
      eq(auditEvents.resourceType,"vende_lifecycle_command"),
      eq(auditEvents.resourceId,commandId),
    ));
  let latest:typeof reviewRows[number]|undefined;
  for(const audit of reviewRows){
    const version=audit.metadata.reviewVersion;
    if(typeof version!=="number"||!Number.isSafeInteger(version)||version<1)
      return denied();
    if(!latest||version>(latest.metadata.reviewVersion as number))latest=audit;
  }
  return {row,risk,latest};
}
/** Evidence reading must happen outside a database lock, but after a
 * corporate-authenticated preflight. Recheck the command and the exact human
 * review version before committing an observation so stale I/O cannot write. */
export async function observeVendeCompensationEvidence(
  context:TenantContext,proof:StepUpProof,
  input:{productId:string;commandId:string;expectedReviewVersion:number},
  config:PlanProjectionConfig,http:typeof fetch=fetch,now:Date=new Date(),
){
  requireFMPlanAuthority(context,true);
  if(!UUID.test(input.productId)||!UUID.test(input.commandId)||
     !Number.isSafeInteger(input.expectedReviewVersion)||input.expectedReviewVersion<1||
     proof.userId!==context.userId||!hasFreshVendeApproval(proof.verifiedAt,now))
    return denied();
  const base=requireVendeCommercialDelivery(config);
  if(config.organizationId!==context.tenantId)return denied();
  const original=await db.transaction(async tx=>{
    const {row,latest}=await currentCase(tx,context,input.productId,input.commandId);
    if(latest?.metadata.reviewVersion!==input.expectedReviewVersion||
       !["investigating","escalated"].includes(String(latest.metadata.decision)))return denied();
    return row;
  });
  // The authenticated remote status is operation-scoped, but an Assistant
  // status report alone is NOT proof of payment nor successful remediation.
  const remote=await readVendeCommercialSnapshot(base,original,config,http,now);
  const after=new Date();
  if(!hasFreshVendeApproval(proof.verifiedAt,after))return denied();
  return db.transaction(async tx=>{
    const [locked]=await tx.select().from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.tenantId,context.tenantId),
      eq(vendeLifecycleCommands.productId,input.productId),
      eq(vendeLifecycleCommands.id,input.commandId),
    )).for("update").limit(1);
    if(!locked||locked.operationId!==original.operationId||
       locked.action!==original.action||locked.revision!==original.revision||
       locked.state!==original.state||locked.sourceInvoiceId!==original.sourceInvoiceId)
      return denied();
    const {latest}=await currentCase(tx,context,input.productId,input.commandId);
    if(latest?.metadata.reviewVersion!==input.expectedReviewVersion)return denied();
    let financeState:"settled_verified"|"reversed_verified"|"unpaid_verified"|"unavailable"="unavailable";
    let invoiceState:"paid"|"pending"|"other"|"not_applicable"="not_applicable";
    if(locked.sourceInvoiceId){
      const [invoice]=await tx.select().from(billingInvoices).where(and(
        eq(billingInvoices.id,locked.sourceInvoiceId),
        eq(billingInvoices.tenantId,context.tenantId),
        eq(billingInvoices.productId,input.productId),
        eq(billingInvoices.customerId,locked.customerId),
        eq(billingInvoices.subscriptionId,locked.subscriptionId),
      )).for("update").limit(1);
      if(!invoice)return denied();
      invoiceState=invoice.status==="paid"?"paid":
        invoice.status==="pending"?"pending":"other";
      const finance=await currentBoundVendePaymentEvidence(tx,invoice,after);
      if(finance&&(finance.outcome==="settled_verified"||
         finance.outcome==="reversed_verified"||finance.outcome==="unpaid_verified"))
        financeState=finance.outcome;
    }
    const sameAppliedAction=remote.operation_status==="applied"&&
      remote.applied_action===locked.action;
    // A verified settlement after a delivered delinquency suspension is a
    // financial/entitlement divergence, not a healthy settled operation.
    // Classification is evidence only: never mutate a license or payment here.
    const result=sameAppliedAction&&locked.action==="SUSPEND_DELINQUENCY"&&
      remote.license_status==="suspended"&&financeState==="settled_verified"
      ?"remote_suspended_after_finance_settled"
      :sameAppliedAction&&financeState==="reversed_verified"
        ?"remote_applied_finance_reversed"
        :sameAppliedAction&&financeState==="settled_verified"
          ?"remote_applied_finance_settled"
          :remote.operation_status==="not_applied"
            ?"remote_operation_not_applied"
            :"human_reconciliation_required";
    await tx.insert(auditEvents).values({
      tenantId:context.tenantId,actorId:context.userId,actorType:"user",
      action:ACTION,resourceType:"vende_lifecycle_command",
      resourceId:locked.id,result,correlationId:context.correlationId,
      metadata:{schema:"fm.vende.compensation-observation.v1",
        productId:input.productId,reviewVersion:input.expectedReviewVersion,
        operationId:locked.operationId,action:locked.action,
        sourceStatus:locked.state,observedAt:after.toISOString(),
        remoteOperationStatus:remote.operation_status,
        remoteAppliedAction:remote.applied_action,
        remoteLicenseStatus:remote.license_status,
        remotePlanCode:remote.plan_code,
        remotePlanRevision:remote.plan_revision,
        remoteValidUntil:remote.valid_until,
        verifiedFinanceOutcome:financeState,invoiceState,
        remediated:false,refundExecuted:false,entitlementMutated:false,
      },
    });
    return {state:result,remoteObserved:true as const,
      financeState,invoiceState,remediationDispatched:false as const,
      automaticCompensationAuthorized:false as const,
      caseResolved:false as const};
  });
}
