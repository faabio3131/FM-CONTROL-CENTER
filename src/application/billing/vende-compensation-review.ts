/** PROMPT 01 — human-governed investigation of C06 financial divergence.
 * Does not pretend the Assistant entitlement, provider settlement or refund is
 * certified. Existing append-only risk events are the source of truth.
 *
 * Each human step is CAS serialized on the lifecycle command row, recorded in
 * the audit ledger and cannot trigger any external provider mutation.
 */
import {and,desc,eq,inArray,sql} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import {vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {VENDE_COMPENSATION_REVIEW_ACTION} from "./vende-compensation-risk";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import {hasFreshVendeApproval} from "./vende-c06-delivery";
import type {TenantContext} from "@/domain/security/tenant-context";
import type {StepUpProof} from "@/application/security/password-step-up";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION="vende.compensation_review.triaged" as const;
const KNOWN_RISK_REASONS:ReadonlySet<string>=new Set([
  "reactivation_unconfirmed","suspension_unconfirmed",
  "renewal_unconfirmed","upgrade_unconfirmed","downgrade_unconfirmed",
  "reactivation_payment_reversed_after_delivery",
  "delinquency_paid_after_delivery",
  "renewal_payment_reversed_after_delivery",
  "plan_change_payment_reversed_after_delivery",
]);
/** Strictly present documented codes, never a gateway payload or audit
 * metadata claimed to be a readable risk category. */
export function knownVendeRiskReason(raw:unknown):string{
  return typeof raw==="string"&&KNOWN_RISK_REASONS.has(raw)?raw:"unspecified";
}
export type VendeReviewStep="investigating"|"escalated";
export class VendeCompensationReviewDenied extends Error{
  constructor(){super("vende.compensation_review_unavailable");}
}
const denied=():never=>{throw new VendeCompensationReviewDenied();};
async function verifyProduct(
  tx:Parameters<Parameters<typeof db.transaction>[0]>[0],
  context:TenantContext,productId:string,
){
  if(!UUID.test(productId))return denied();
  const [product]=await tx.select({id:productDefinitions.id}).from(productDefinitions).where(and(
    eq(productDefinitions.tenantId,context.tenantId),eq(productDefinitions.id,productId),
    eq(productDefinitions.slug,"vendeatendeia"),eq(productDefinitions.status,"active"),
  )).limit(1);
  if(!product)return denied();
}
function normalizedReview(meta:Record<string,unknown>){
  const version=meta.reviewVersion;
  const decision=meta.decision;
  if(!Number.isSafeInteger(version)||typeof version!=="number"||version<1||
     (decision!=="investigating"&&decision!=="escalated"))return null;
  return {version,decision:decision as VendeReviewStep};
}
type FollowupStatus=
  "initial_review_required"|"refresh_current_evidence"|
  "correction_preparation_required"|"independent_review_required"|
  "queue_authorization_required"|"correction_queued"|
  "correction_processing"|"manual_reconciliation_required"|
  "remote_readback_required"|"other_risk_investigation";
export function projectVendeCompensationFollowup(input:{
  action:string;reason:string;reviewStep:string;
  intentId:string|null;independentReviewComplete:boolean;
  correctionState:string|null;
}):{
  nextAction:FollowupStatus;intentId:string|null;
  currentEntitlementVerified:false;financialRepairExecuted:false;
  caseResolved:false;automaticRemediationAuthorized:false;
}{
  let nextAction:FollowupStatus;
  if(input.intentId&&input.correctionState){
    if(input.correctionState==="pending")nextAction="correction_queued";
    else if(input.correctionState==="processing")nextAction="correction_processing";
    else if(input.correctionState==="delivered")nextAction="remote_readback_required";
    else nextAction="manual_reconciliation_required";
  }else if(input.intentId){
    nextAction=input.independentReviewComplete
      ?"queue_authorization_required":"independent_review_required";
  }else if(input.reviewStep==="unreviewed"){
    nextAction="initial_review_required";
  }else if(input.reviewStep==="investigating"){
    nextAction="refresh_current_evidence";
  }else if(input.reviewStep==="escalated"&&
           input.action==="SUSPEND_DELINQUENCY"&&
           input.reason==="delinquency_paid_after_delivery"){
    nextAction="correction_preparation_required";
  }else{
    nextAction="other_risk_investigation";
  }
  return {
    nextAction,intentId:input.intentId,
    currentEntitlementVerified:false,financialRepairExecuted:false,
    caseResolved:false,automaticRemediationAuthorized:false,
  };
}
/** Read-only, historical case list. Result is intentionally NOT an assertion
 * of remote license validity, an open-incidents total or completed repair. */
export async function readVendeCompensationReviews(
  context:TenantContext,productId:string,
){
  requireFMPlanAuthority(context,false);
  return db.transaction(async tx=>{
    await verifyProduct(tx,context,productId);
    const scope=and(
      eq(auditEvents.tenantId,context.tenantId),
      eq(auditEvents.action,VENDE_COMPENSATION_REVIEW_ACTION),
      eq(auditEvents.resourceType,"vende_lifecycle_command"),
      sql`${auditEvents.metadata} ->> 'productId' = ${productId}`,
    );
    const [count]=await tx.select({total:sql<number>`count(*)::int`})
      .from(auditEvents).where(scope);
    const riskRows=await tx.select({
      id:auditEvents.id,resourceId:auditEvents.resourceId,
      occurredAt:auditEvents.occurredAt,metadata:auditEvents.metadata,
    }).from(auditEvents).where(scope)
      .orderBy(desc(auditEvents.occurredAt),desc(auditEvents.id)).limit(51);
    const ids=riskRows.map(row=>row.resourceId)
      .filter((id):id is string=>typeof id==="string"&&UUID.test(id));
    const commands=ids.length?await tx.select({
      id:vendeLifecycleCommands.id,action:vendeLifecycleCommands.action,
      state:vendeLifecycleCommands.state,operationId:vendeLifecycleCommands.operationId,
    }).from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.tenantId,context.tenantId),
      eq(vendeLifecycleCommands.productId,productId),
      inArray(vendeLifecycleCommands.id,ids),
    )):[];
    const byCommand=new Map(commands.map(row=>[row.id,row]));
    const reviewRows=ids.length?await tx.select({
      id:auditEvents.id,resourceId:auditEvents.resourceId,
      actorId:auditEvents.actorId,occurredAt:auditEvents.occurredAt,
      metadata:auditEvents.metadata,
    }).from(auditEvents).where(and(
      eq(auditEvents.tenantId,context.tenantId),
      eq(auditEvents.action,ACTION),
      eq(auditEvents.resourceType,"vende_lifecycle_command"),
      inArray(auditEvents.resourceId,ids),
    )).orderBy(desc(auditEvents.occurredAt),desc(auditEvents.id)):[];
    const reviews=new Map<string,{version:number;decision:VendeReviewStep;actorId:string;occurredAt:Date}>();
    for(const row of reviewRows){
      if(!row.resourceId)continue;
      const review=normalizedReview(row.metadata);
      const previous=reviews.get(row.resourceId);
      if(review&&(!previous||review.version>previous.version))
        reviews.set(row.resourceId,{...review,actorId:row.actorId,occurredAt:row.occurredAt});
    }
    // One latest preparation/review per command, never an unbounded
    // audit scan. The original risk and exact FM product are always scoped.
    const preparedRows=ids.length?await tx.selectDistinctOn(
      [auditEvents.resourceId],{
        id:auditEvents.id,resourceId:auditEvents.resourceId,
        metadata:auditEvents.metadata,
      },
    ).from(auditEvents).where(and(
      eq(auditEvents.tenantId,context.tenantId),
      eq(auditEvents.action,"vende.compensation_correction.prepared"),
      eq(auditEvents.resourceType,"vende_lifecycle_command"),
      inArray(auditEvents.resourceId,ids),
      sql`${auditEvents.metadata} ->> 'productId' = ${productId}`,
    )).orderBy(
      auditEvents.resourceId,desc(auditEvents.occurredAt),desc(auditEvents.id),
    ).limit(50):[];
    const prepared=new Map(preparedRows.filter(row=>
      row.resourceId&&UUID.test(row.id)&&
      row.metadata.schema==="fm.vende.compensation-intent.v1"&&
      row.metadata.commandId===row.resourceId&&
      row.metadata.approvedForDispatch===false,
    ).map(row=>[row.resourceId as string,row.id]));
    const reviewOfIntentRows=ids.length?await tx.selectDistinctOn(
      [auditEvents.resourceId],{
        resourceId:auditEvents.resourceId,metadata:auditEvents.metadata,
      },
    ).from(auditEvents).where(and(
      eq(auditEvents.tenantId,context.tenantId),
      eq(auditEvents.action,"vende.compensation_correction.second_reviewed"),
      eq(auditEvents.resourceType,"vende_lifecycle_command"),
      inArray(auditEvents.resourceId,ids),
      sql`${auditEvents.metadata} ->> 'productId' = ${productId}`,
    )).orderBy(
      auditEvents.resourceId,desc(auditEvents.occurredAt),desc(auditEvents.id),
    ).limit(50):[];
    const reviewed=new Map(reviewOfIntentRows.filter(row=>
      row.resourceId&&
      row.metadata.schema==="fm.vende.compensation-second-review.v1"&&
      row.metadata.approvedForDispatch===false&&
      row.metadata.caseResolved===false&&
      typeof row.metadata.intentId==="string"&&UUID.test(row.metadata.intentId),
    ).map(row=>[row.resourceId as string,row.metadata.intentId as string]));
    const intentIds=[...prepared.values()];
    const correctionRows=intentIds.length?await tx.select({
      operationId:vendeLifecycleCommands.operationId,
      state:vendeLifecycleCommands.state,
    }).from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.tenantId,context.tenantId),
      eq(vendeLifecycleCommands.productId,productId),
      eq(vendeLifecycleCommands.action,"REACTIVATE_VERIFIED"),
      inArray(vendeLifecycleCommands.operationId,
        intentIds.map(id=>"p01.correction."+id)),
    )).limit(50):[];
    const corrections=new Map(correctionRows.map(row=>[row.operationId,row.state]));
    return {
      historicalTotal:Number(count?.total??0),
      truncated:riskRows.length>50,
      items:riskRows.slice(0,50).flatMap(risk=>{
        const command=risk.resourceId?byCommand.get(risk.resourceId):null;
        if(!command)return [];
        const latest=reviews.get(command.id);
        // Metadata is untrusted for presentation: display only fixed known
        // codes and identifiers, never arbitrary logs / payment details.
        return [{
          riskId:risk.id,commandId:command.id,
          action:command.action,state:command.state,
          reason:knownVendeRiskReason(risk.metadata.reason),
          occurredAt:risk.occurredAt,reviewVersion:latest?.version??0,
          reviewStep:latest?.decision??"unreviewed",
          reviewer:latest?.actorId??null,
          reviewedAt:latest?.occurredAt??null,
          followup:projectVendeCompensationFollowup({
            action:command.action,
            reason:knownVendeRiskReason(risk.metadata.reason),
            reviewStep:latest?.decision??"unreviewed",
            intentId:prepared.get(command.id)??null,
            independentReviewComplete:
              !!prepared.get(command.id)&&
              reviewed.get(command.id)===prepared.get(command.id),
            correctionState:corrections.get(
              "p01.correction."+(prepared.get(command.id)??""),
            )??null,
          }),
        }];
      }),
      entitlementVerified:false as const,
      automaticCompensationAuthorized:false as const,
      remoteRemediationCompleted:false as const,
    };
  });
}
/** Step-up and compare-and-swap on exact review version; only operator state
 * advances. No amount, tenant, refund, license, retry or "resolved" option. */
export async function triageVendeCompensationRisk(
  context:TenantContext,proof:StepUpProof,
  input:{productId:string;commandId:string;expectedVersion:number;decision:VendeReviewStep;reasonCode:string},
  now:Date=new Date(),
){
  requireFMPlanAuthority(context,true);
  if(!UUID.test(input.productId)||!UUID.test(input.commandId)||
     !Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0||
     !["investigating","escalated"].includes(input.decision)||
     !/^[a-z][a-z0-9_]{3,47}$/.test(input.reasonCode)||
     proof.userId!==context.userId||!hasFreshVendeApproval(proof.verifiedAt,now))
    return denied();
  return db.transaction(async tx=>{
    await verifyProduct(tx,context,input.productId);
    const [command]=await tx.select().from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.tenantId,context.tenantId),
      eq(vendeLifecycleCommands.productId,input.productId),
      eq(vendeLifecycleCommands.id,input.commandId),
    )).for("update").limit(1);
    if(!command)return denied();
    const [risk]=await tx.select({id:auditEvents.id})
      .from(auditEvents).where(and(
        eq(auditEvents.tenantId,context.tenantId),
        eq(auditEvents.resourceType,"vende_lifecycle_command"),
        eq(auditEvents.resourceId,command.id),
        eq(auditEvents.action,VENDE_COMPENSATION_REVIEW_ACTION),
        sql`${auditEvents.metadata} ->> 'productId' = ${input.productId}`,
      )).limit(1);
    if(!risk)return denied();
    const reviews=await tx.select({metadata:auditEvents.metadata})
      .from(auditEvents).where(and(
        eq(auditEvents.tenantId,context.tenantId),eq(auditEvents.action,ACTION),
        eq(auditEvents.resourceType,"vende_lifecycle_command"),
        eq(auditEvents.resourceId,command.id),
      ));
    let version=0;
    for(const item of reviews){
      const existing=normalizedReview(item.metadata);
      if(!existing)return denied();
      version=Math.max(version,existing.version);
    }
    if(version!==input.expectedVersion)return denied();
    // Append-only. A failed audit writes NO new case state. Lock on command
    // ensures concurrent operators cannot both approve expectedVersion.
    await tx.insert(auditEvents).values({
      tenantId:context.tenantId,actorId:context.userId,actorType:"user",
      action:ACTION,resourceType:"vende_lifecycle_command",
      resourceId:command.id,result:input.decision,
      correlationId:context.correlationId,
      metadata:{schema:"fm.vende.compensation-review.v1",
        productId:input.productId,operationId:command.operationId,
        reviewVersion:version+1,decision:input.decision,
        reasonCode:input.reasonCode,
        approvedAt:proof.verifiedAt.toISOString(),
        currentAssistantLicenseVerified:false,
        automaticCompensationAuthorized:false,repairConfirmed:false,
      },
    });
    return {commandId:command.id,reviewVersion:version+1,
      reviewStep:input.decision,remediationDispatched:false,
      currentAssistantLicenseVerified:false};
  });
}
