/** P01 — two-person, evidence-fenced corrective intent.
 * Records a candidate human review, never executes financial/provider/license
 * mutations. It cannot be used as an authorization token by a dispatcher.
 */
import {and,desc,eq,sql} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {billingInvoices} from "@/infrastructure/db/billing-schema";
import {vendeContractTerms,vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {currentBoundVendePaymentEvidence} from "./vende-payment-evidence";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import {hasFreshVendeApproval} from "./vende-c06-delivery";
import {VENDE_COMPENSATION_REVIEW_ACTION} from "./vende-compensation-risk";
import type {TenantContext} from "@/domain/security/tenant-context";
import type {StepUpProof} from "@/application/security/password-step-up";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRIAGE="vende.compensation_review.triaged";
const OBSERVED="vende.compensation_review.remote_observed";
const PREPARED="vende.compensation_correction.prepared";
const REVIEWED="vende.compensation_correction.second_reviewed";
const WINDOW_MS=120_000;
const denied=():never=>{throw new Error("vende.compensation_correction_denied");};
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Input={productId:string;commandId:string;expectedReviewVersion:number};
type Candidate={
  observationId:string;reviewVersion:number;termsRevision:number;
  invoiceId:string;commandId:string;operationId:string;
  proposedAction:"REACTIVATE_VIA_EXISTING_REGULARIZATION";
};
function stringField(meta:Record<string,unknown>,key:string){
  return typeof meta[key]==="string"?meta[key]:null;
}
function currentNow(now:Date){
  if(!Number.isFinite(now.getTime()))denied();
}
function timeRecent(value:Date,now:Date){
  const age=now.getTime()-value.getTime();
  return Number.isFinite(age)&&age>=0&&age<=WINDOW_MS;
}
async function lockCase(tx:Tx,context:TenantContext,input:Input,now:Date):Promise<Candidate>{
  const [product]=await tx.select({id:productDefinitions.id}).from(productDefinitions)
    .where(and(eq(productDefinitions.tenantId,context.tenantId),
      eq(productDefinitions.id,input.productId),eq(productDefinitions.slug,"vendeatendeia"),
      eq(productDefinitions.status,"active"))).limit(1);
  if(!product)return denied();
  const [command]=await tx.select().from(vendeLifecycleCommands).where(and(
    eq(vendeLifecycleCommands.tenantId,context.tenantId),
    eq(vendeLifecycleCommands.productId,input.productId),
    eq(vendeLifecycleCommands.id,input.commandId),
  )).for("update").limit(1);
  if(!command||command.action!=="SUSPEND_DELINQUENCY"||
     command.state!=="delivered"||!command.sourceInvoiceId)return denied();
  const [risk]=await tx.select({id:auditEvents.id}).from(auditEvents).where(and(
    eq(auditEvents.tenantId,context.tenantId),
    eq(auditEvents.resourceId,command.id),
    eq(auditEvents.resourceType,"vende_lifecycle_command"),
    eq(auditEvents.action,VENDE_COMPENSATION_REVIEW_ACTION),
    sql`${auditEvents.metadata} ->> 'productId' = ${input.productId}`,
  )).limit(1);
  if(!risk)return denied();
  const [review]=await tx.select({metadata:auditEvents.metadata}).from(auditEvents)
    .where(and(eq(auditEvents.tenantId,context.tenantId),
      eq(auditEvents.resourceId,command.id),eq(auditEvents.action,TRIAGE),
      eq(auditEvents.resourceType,"vende_lifecycle_command"),
      sql`${auditEvents.metadata} ->> 'productId' = ${input.productId}`,
    )).orderBy(desc(auditEvents.occurredAt),desc(auditEvents.id)).limit(1);
  if(!review||review.metadata.schema!=="fm.vende.compensation-review.v1"||
    review.metadata.reviewVersion!==input.expectedReviewVersion||
    review.metadata.decision!=="escalated")return denied();
  const [observed]=await tx.select({
    id:auditEvents.id,metadata:auditEvents.metadata,occurredAt:auditEvents.occurredAt,
  }).from(auditEvents).where(and(
    eq(auditEvents.tenantId,context.tenantId),
    eq(auditEvents.resourceId,command.id),eq(auditEvents.action,OBSERVED),
    eq(auditEvents.resourceType,"vende_lifecycle_command"),
    sql`${auditEvents.metadata} ->> 'productId' = ${input.productId}`,
  )).orderBy(desc(auditEvents.occurredAt),desc(auditEvents.id)).limit(1);
  if(!observed||!timeRecent(observed.occurredAt,now)||
     observed.metadata.schema!=="fm.vende.compensation-observation.v1"||
     observed.metadata.reviewVersion!==input.expectedReviewVersion||
     observed.metadata.operationId!==command.operationId||
     observed.metadata.action!==command.action||
     observed.metadata.remoteOperationStatus!=="applied"||
     observed.metadata.remoteAppliedAction!==command.action||
     observed.metadata.remoteLicenseStatus!=="suspended"||
     observed.metadata.verifiedFinanceOutcome!=="settled_verified"||
     observed.metadata.invoiceState!=="paid"||
     observed.metadata.remediated!==false||
     observed.metadata.refundExecuted!==false||
     observed.metadata.entitlementMutated!==false)return denied();
  const [invoice]=await tx.select().from(billingInvoices).where(and(
    eq(billingInvoices.id,command.sourceInvoiceId),
    eq(billingInvoices.tenantId,context.tenantId),
    eq(billingInvoices.productId,input.productId),
    eq(billingInvoices.customerId,command.customerId),
    eq(billingInvoices.subscriptionId,command.subscriptionId),
  )).for("update").limit(1);
  if(!invoice||invoice.status!=="paid"||invoice.currency!=="BRL")return denied();
  const payment=await currentBoundVendePaymentEvidence(tx,invoice,now);
  if(!payment||payment.outcome!=="settled_verified")return denied();
  const [terms]=await tx.select().from(vendeContractTerms).where(and(
    eq(vendeContractTerms.tenantId,context.tenantId),
    eq(vendeContractTerms.productId,input.productId),
    eq(vendeContractTerms.subscriptionId,command.subscriptionId),
    eq(vendeContractTerms.customerId,command.customerId),
  )).for("update").limit(1);
  const today=new Date(now).toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
  if(!terms||terms.lifecycleState!=="suspended"||
    terms.revision!==command.revision||terms.paidThrough<today)return denied();
  return {
    observationId:observed.id,reviewVersion:input.expectedReviewVersion,
    termsRevision:terms.revision,invoiceId:invoice.id,
    commandId:command.id,operationId:command.operationId,
    proposedAction:"REACTIVATE_VIA_EXISTING_REGULARIZATION",
  };
}
function check(context:TenantContext,proof:StepUpProof,input:Input,now:Date){
  requireFMPlanAuthority(context,true);
  currentNow(now);
  if(!UUID.test(input.productId)||!UUID.test(input.commandId)||
     !Number.isSafeInteger(input.expectedReviewVersion)||
     input.expectedReviewVersion<1||proof.userId!==context.userId||
     !hasFreshVendeApproval(proof.verifiedAt,now))return denied();
}
async function lastPrepared(tx:Tx,context:TenantContext,input:Input){
  const [row]=await tx.select({
    id:auditEvents.id,metadata:auditEvents.metadata,
    occurredAt:auditEvents.occurredAt,actorId:auditEvents.actorId,
  }).from(auditEvents).where(and(eq(auditEvents.tenantId,context.tenantId),
    eq(auditEvents.action,PREPARED),eq(auditEvents.resourceId,input.commandId),
    eq(auditEvents.resourceType,"vende_lifecycle_command"),
    sql`${auditEvents.metadata} ->> 'productId' = ${input.productId}`,
  )).orderBy(desc(auditEvents.occurredAt),desc(auditEvents.id)).limit(1);
  return row;
}
export async function prepareVendeCorrectionIntent(
  context:TenantContext,proof:StepUpProof,input:Input,now:Date=new Date(),
){
  check(context,proof,input,now);
  return db.transaction(async tx=>{
    const evidence=await lockCase(tx,context,input,now);
    const existing=await lastPrepared(tx,context,input);
    if(existing&&timeRecent(existing.occurredAt,now))return denied();
    const [created]=await tx.insert(auditEvents).values({
      tenantId:context.tenantId,actorId:context.userId,actorType:"user",
      action:PREPARED,resourceType:"vende_lifecycle_command",
      resourceId:input.commandId,result:"awaiting_independent_human_review",
      correlationId:context.correlationId,
      metadata:{schema:"fm.vende.compensation-intent.v1",
        productId:input.productId,...evidence,
        preparedAt:now.toISOString(),preparedBy:context.userId,
        approvedForDispatch:false,remediationDispatched:false,
        entitlementMutated:false,refundExecuted:false,
      },
    }).returning({id:auditEvents.id});
    return {intentId:created.id,review:"awaiting_independent_human_review" as const,
      proposedAction:evidence.proposedAction,remediationDispatched:false as const,
      approvedForDispatch:false as const,caseResolved:false as const};
  });
}
export async function secondReviewVendeCorrectionIntent(
  context:TenantContext,proof:StepUpProof,
  input:Input&{intentId:string},now:Date=new Date(),
){
  check(context,proof,input,now);
  if(!UUID.test(input.intentId))return denied();
  return db.transaction(async tx=>{
    const current=await lockCase(tx,context,input,now);
    const prepared=await lastPrepared(tx,context,input);
    if(!prepared||prepared.id!==input.intentId||
       !timeRecent(prepared.occurredAt,now)||prepared.actorId===context.userId||
       prepared.metadata.schema!=="fm.vende.compensation-intent.v1"||
       prepared.metadata.approvedForDispatch!==false||
       prepared.metadata.remediationDispatched!==false)return denied();
    for(const [key,value] of Object.entries(current)){
      if(prepared.metadata[key]!==value)return denied();
    }
    const [already]=await tx.select({id:auditEvents.id}).from(auditEvents)
      .where(and(eq(auditEvents.tenantId,context.tenantId),
        eq(auditEvents.action,REVIEWED),
        eq(auditEvents.resourceType,"vende_lifecycle_command"),
        eq(auditEvents.resourceId,input.commandId),
        sql`${auditEvents.metadata} ->> 'intentId' = ${input.intentId}`,
      )).limit(1);
    if(already)return denied();
    await tx.insert(auditEvents).values({
      tenantId:context.tenantId,actorId:context.userId,actorType:"user",
      action:REVIEWED,resourceType:"vende_lifecycle_command",
      resourceId:input.commandId,result:"reviewed_no_dispatch",
      correlationId:context.correlationId,
      metadata:{schema:"fm.vende.compensation-second-review.v1",
        productId:input.productId,intentId:input.intentId,
        observationId:current.observationId,
        reviewVersion:current.reviewVersion,
        preparerId:prepared.actorId,reviewerId:context.userId,
        reviewedAt:now.toISOString(),
        approvedForDispatch:false,remediationDispatched:false,
        entitlementMutated:false,refundExecuted:false,caseResolved:false,
      },
    });
    return {intentId:input.intentId,review:"reviewed_no_dispatch" as const,
      approvedForDispatch:false as const,remediationDispatched:false as const,
      caseResolved:false as const};
  });
}
