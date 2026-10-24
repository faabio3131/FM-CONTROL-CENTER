/** F9: explicit FM-only closure of a corrected delinquency compensation case.
 * Financial/Assistant evidence is refreshed after both Core unit probes.
 * The audited case closure does NOT assert every unit was checked or that
 * provider costs were refunded. Readback remains live: later reversal reopens.
 */
import {and,eq,sql} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {billingInvoices} from "@/infrastructure/db/billing-schema";
import {vendeContractTerms,vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {currentBoundVendePaymentEvidence} from "./vende-payment-evidence";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import {hasFreshVendeApproval} from "./vende-c06-delivery";
import {fmLocalCivilDate} from "@/domain/billing/vende-commercial-policy-v1";
import {readVendeCorrectionOutcome} from "./vende-compensation-outcome";
import {readVendeCoreQuotaEvidence,type CoreQuotaEvidence}
  from "./vende-core-quota-readback";
import type {PlanProjectionConfig} from "./assistant-plan-outbox-dispatcher";
import type {TenantContext} from "@/domain/security/tenant-context";
import type {StepUpProof} from "@/application/security/password-step-up";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNIT=/^[A-Za-z0-9_.-]{1,128}$/;
const ACTION="vende.compensation_case.commercially_closed";
const SCHEMA="fm.vende.compensation-commercial-closure.v1";
const PREPARED="vende.compensation_correction.prepared";
const REVIEWED="vende.compensation_correction.second_reviewed";
const CAPABILITIES=["atendimento_interpretacao","atendimento_transcricao"] as const;
type Scope={productId:string;intentId:string};
type Input=Scope&{closureId:string;unitId:string;expectedRevision:number};
type Result={closureId:string;status:"recorded"|"previously_recorded";
  commercialCaseClosed:true;caseResolved:true;allUnitsVerified:false;
  futureAiAdmissionGuaranteed:false;providerRefundExecuted:false;
  quotaCoverage:"one_unit_both_capabilities";unitId:string;};
const denied=():never=>{throw Error("vende.compensation_closure_denied");};
const strictScope=(s:Scope)=>UUID.test(s.productId)&&UUID.test(s.intentId);
export function assertVendeCommercialClosureEvidence(
  scope:{intentId:string;unitId:string},
  current:Awaited<ReturnType<typeof readVendeCorrectionOutcome>>,
  quota:readonly CoreQuotaEvidence[],
){
  if(current.intentId!==scope.intentId||
     current.operationId!=="p01.correction."+scope.intentId||
     current.state!=="assistant_active_payment_verified"||
     current.remoteEntitlementConfirmed!==true||
     current.financialSettlementCurrentlyVerified!==true||
     current.caseResolved!==false||current.coreQuotaVerified!==false||
     quota.length!==2)return denied();
  for(let i=0;i<CAPABILITIES.length;i++){
    const q=quota[i];
    if(!q||q.intentId!==scope.intentId||q.unitId!==scope.unitId||
       q.capability!==CAPABILITIES[i]||q.state!=="core_unit_policy_verified"||
       q.licenseFreshlyVerified!==true||q.coreQuotaVerified!==true||
       q.caseResolved!==false||q.providerCalled!==false||
       q.reservationCreated!==false||q.allUnitsVerified!==false||
       q.futureAiAdmissionGuaranteed!==false||
       !Array.isArray(q.quotaMetrics)||
       !["ai.requests","ai.total_tokens"].every(metric=>
         q.quotaMetrics.some(m=>m.metric===metric&&
           m.limitUnits>0&&m.remainingUnits>=0)))
      return denied();
  }
}
/** Closure authority remains bound to the original second reviewer, not
 * any FM operator with a valid password. An old audit entry is not a token. */
export function validVendeClosureReview(input:{
  operatorId:string;preparedBy:string;reviewerId:string;
  productId:string;intentId:string;reviewVersion:unknown;
  observationId:unknown;metadata:Record<string,unknown>;
}):boolean{
  const m=input.metadata;
  return input.operatorId===input.reviewerId&&
    input.reviewerId!==input.preparedBy&&
    m.schema==="fm.vende.compensation-second-review.v1"&&
    m.productId===input.productId&&m.intentId===input.intentId&&
    m.reviewVersion===input.reviewVersion&&
    m.observationId===input.observationId&&
    m.preparerId===input.preparedBy&&m.reviewerId===input.reviewerId&&
    m.caseResolved===false&&m.approvedForDispatch===false&&
    m.remediationDispatched===false&&m.entitlementMutated===false&&
    m.refundExecuted===false;
}
function matchesClosure(metadata:Record<string,unknown>,input:Scope,
  operationId:string,revision:number){
  return metadata.schema===SCHEMA&&metadata.productId===input.productId&&
    metadata.intentId===input.intentId&&metadata.operationId===operationId&&
    metadata.revision===revision&&
    metadata.commercialCaseClosed===true&&metadata.caseResolved===true&&
    metadata.allUnitsVerified===false&&metadata.providerRefundExecuted===false&&
    metadata.quotaCoverage==="one_unit_both_capabilities"&&
    metadata.futureAiAdmissionGuaranteed===false&&
    Array.isArray(metadata.capabilities)&&metadata.capabilities.length===2&&
    metadata.capabilities[0]===CAPABILITIES[0]&&
    metadata.capabilities[1]===CAPABILITIES[1]&&
    typeof metadata.unitId==="string"&&UNIT.test(metadata.unitId);
}
export async function closeVendeCommercialCompensationCase(
  context:TenantContext,proof:StepUpProof,session:Input,
  config:PlanProjectionConfig, now:Date=new Date(),
):Promise<Result>{
  requireFMPlanAuthority(context,true);
  if(!strictScope(session)||!UUID.test(session.closureId)||
     !UNIT.test(session.unitId)||!Number.isSafeInteger(session.expectedRevision)||
     session.expectedRevision<1||proof.userId!==context.userId||
     !hasFreshVendeApproval(proof.verifiedAt,now)||
     config.organizationId!==context.tenantId)return denied();
  const readScope={productId:session.productId,intentId:session.intentId};
  const pre=await readVendeCorrectionOutcome(context,readScope,config);
  if(pre.state!=="assistant_active_payment_verified")return denied();
  const quotas:CoreQuotaEvidence[]=[];
  for(const capability of CAPABILITIES){
    quotas.push(await readVendeCoreQuotaEvidence(context,{
      ...readScope,unitId:session.unitId,capability,
    },config));
  }
  // Read live financial/Assistant state again AFTER the Core probes. The
  // Command DB is checked a third time under locks at the write boundary.
  const fresh=await readVendeCorrectionOutcome(context,readScope,config);
  assertVendeCommercialClosureEvidence(session,fresh,quotas);
  const verifiedAt=new Date();
  if(!hasFreshVendeApproval(proof.verifiedAt,verifiedAt)||
     verifiedAt.getTime()-now.getTime()>120_000||
     verifiedAt.getTime()-now.getTime()< -15_000)return denied();
  return db.transaction(async tx=>{
    const [product]=await tx.select({id:productDefinitions.id}).from(productDefinitions)
      .where(and(eq(productDefinitions.tenantId,context.tenantId),
        eq(productDefinitions.id,session.productId),
        eq(productDefinitions.slug,"vendeatendeia"),
        eq(productDefinitions.status,"active"))).limit(1);
    if(!product)return denied();
    const [prepared]=await tx.select({
      metadata:auditEvents.metadata,actorId:auditEvents.actorId,
    }).from(auditEvents).where(and(
      eq(auditEvents.id,session.intentId),
      eq(auditEvents.tenantId,context.tenantId),
      eq(auditEvents.action,PREPARED),
      eq(auditEvents.resourceType,"vende_lifecycle_command"),
      sql`${auditEvents.metadata} ->> 'productId' = ${session.productId}`,
    )).limit(1);
    if(!prepared||prepared.metadata.schema!=="fm.vende.compensation-intent.v1"||
       prepared.metadata.approvedForDispatch!==false||
       prepared.metadata.remediationDispatched!==false||
       typeof prepared.metadata.commandId!=="string"||
       !UUID.test(prepared.metadata.commandId))return denied();
    const [review]=await tx.select({
      actorId:auditEvents.actorId,metadata:auditEvents.metadata,
      result:auditEvents.result,
    }).from(auditEvents).where(and(
      eq(auditEvents.tenantId,context.tenantId),
      eq(auditEvents.action,REVIEWED),
      eq(auditEvents.resourceType,"vende_lifecycle_command"),
      eq(auditEvents.resourceId,prepared.metadata.commandId),
      sql`${auditEvents.metadata} ->> 'intentId' = ${session.intentId}`,
      sql`${auditEvents.metadata} ->> 'productId' = ${session.productId}`,
    )).limit(1);
    if(!review||review.result!=="reviewed_no_dispatch"||
       !validVendeClosureReview({
         operatorId:context.userId,preparedBy:prepared.actorId,
         reviewerId:review.actorId,productId:session.productId,
         intentId:session.intentId,
         reviewVersion:prepared.metadata.reviewVersion,
         observationId:prepared.metadata.observationId,
         metadata:review.metadata,
       }))return denied();
    const [original]=await tx.select().from(vendeLifecycleCommands)
      .where(and(eq(vendeLifecycleCommands.id,prepared.metadata.commandId),
        eq(vendeLifecycleCommands.tenantId,context.tenantId),
        eq(vendeLifecycleCommands.productId,session.productId))).limit(1);
    const [correction]=await tx.select().from(vendeLifecycleCommands)
      .where(and(eq(vendeLifecycleCommands.tenantId,context.tenantId),
        eq(vendeLifecycleCommands.productId,session.productId),
        eq(vendeLifecycleCommands.operationId,"p01.correction."+session.intentId),
      )).for("update").limit(1);
    if(!original||!correction||
       original.action!=="SUSPEND_DELINQUENCY"||
       correction.action!=="REACTIVATE_VERIFIED"||
       correction.state!=="delivered"||
       correction.revision!==session.expectedRevision||
       correction.revision!==original.revision+1||
       correction.expectedRevision!==original.revision||
       correction.subscriptionId!==original.subscriptionId||
       correction.customerId!==original.customerId||
       correction.externalTenantId!==original.externalTenantId||
       correction.sourceInvoiceId!==original.sourceInvoiceId||
       correction.sourceRef!=="p01.correction."+session.intentId||
       correction.operationId!==fresh.operationId||
       correction.deliveryTarget?.schema!=="fm.vende.reactivation-target.v1"||
       !correction.sourceInvoiceId)return denied();
    const [existingId]=await tx.select({
      actorId:auditEvents.actorId,metadata:auditEvents.metadata,
      action:auditEvents.action,
    }).from(auditEvents).where(and(eq(auditEvents.id,session.closureId),
      eq(auditEvents.tenantId,context.tenantId))).limit(1);
    if(existingId&&!((existingId.action===ACTION)&&
        existingId.actorId===context.userId&&
        matchesClosure(existingId.metadata,session,correction.operationId,
          session.expectedRevision)&&existingId.metadata.unitId===session.unitId))
      return denied();
    const [existingCase]=await tx.select({
      id:auditEvents.id,actorId:auditEvents.actorId,
      metadata:auditEvents.metadata,
    }).from(auditEvents).where(and(
      eq(auditEvents.tenantId,context.tenantId),
      eq(auditEvents.action,ACTION),
      eq(auditEvents.resourceType,"vende_compensation_intent"),
      eq(auditEvents.resourceId,session.intentId),
      sql`${auditEvents.metadata} ->> 'productId' = ${session.productId}`,
    )).limit(1);
    if(existingCase&&(existingCase.id!==session.closureId||
       existingCase.actorId!==context.userId||
       !matchesClosure(existingCase.metadata,session,correction.operationId,
         session.expectedRevision)||
       existingCase.metadata.unitId!==session.unitId))return denied();
    const [invoice]=await tx.select().from(billingInvoices).where(and(
      eq(billingInvoices.id,correction.sourceInvoiceId),
      eq(billingInvoices.tenantId,context.tenantId),
      eq(billingInvoices.productId,session.productId),
      eq(billingInvoices.customerId,correction.customerId),
      eq(billingInvoices.subscriptionId,correction.subscriptionId),
    )).for("update").limit(1);
    if(!invoice||invoice.status!=="paid"||
       (await currentBoundVendePaymentEvidence(tx,invoice,new Date()))?.outcome!=="settled_verified")
      return denied();
    const [terms]=await tx.select().from(vendeContractTerms).where(and(
      eq(vendeContractTerms.tenantId,context.tenantId),
      eq(vendeContractTerms.productId,session.productId),
      eq(vendeContractTerms.subscriptionId,correction.subscriptionId),
      eq(vendeContractTerms.customerId,correction.customerId),
    )).for("update").limit(1);
    if(!terms||terms.revision!==correction.revision||
       terms.lifecycleState!=="active"||
       terms.paidThrough<fmLocalCivilDate(new Date()))return denied();
    if(!existingCase){
      await tx.insert(auditEvents).values({
        id:session.closureId,tenantId:context.tenantId,
        actorId:context.userId,actorType:"user",action:ACTION,
        resourceType:"vende_compensation_intent",resourceId:session.intentId,
        result:"commercial_case_closed_human_authorized",
        correlationId:context.correlationId,
        metadata:{
          schema:SCHEMA,productId:session.productId,intentId:session.intentId,
          operationId:correction.operationId,revision:correction.revision,
          unitId:session.unitId,capabilities:[...CAPABILITIES],
          quotaCoverage:"one_unit_both_capabilities",commercialCaseClosed:true,
          caseResolved:true,allUnitsVerified:false,providerRefundExecuted:false,
          futureAiAdmissionGuaranteed:false,
          assistantActiveAtClosure:true,paymentSettledAtClosure:true,
          coreQuotasObservedAtClosure:true,closedAt:new Date().toISOString(),
          secondReviewerId:review.actorId,
        },
      });
    }
    return {
      closureId:session.closureId,
      status:existingCase?"previously_recorded" as const:"recorded" as const,
      commercialCaseClosed:true as const,caseResolved:true as const,
      allUnitsVerified:false as const,futureAiAdmissionGuaranteed:false as const,
      providerRefundExecuted:false as const,
      quotaCoverage:"one_unit_both_capabilities" as const,unitId:session.unitId,
    };
  });
}
/** Pure projection: a valid previous closure remains visible if a later
 * financial/Assistant check fails, but CURRENT closure is always revoked. */
export function projectVendeCommercialClosureStatus(
  scope:Scope,
  status:Awaited<ReturnType<typeof readVendeCorrectionOutcome>>,
  row:{id:string;metadata:Record<string,unknown>}|undefined,
  revision:number|undefined,
){
  const recorded=!!row&&revision!==undefined&&
    matchesClosure(row.metadata,scope,status.operationId,revision);
  const currentlyClosed=recorded&&
    status.state==="assistant_active_payment_verified"&&
    status.remoteEntitlementConfirmed===true&&
    status.financialSettlementCurrentlyVerified===true;
  return {...status,commercialCaseClosed:currentlyClosed,caseResolved:currentlyClosed,
    closureRecorded:recorded,historicalOnly:recorded&&!currentlyClosed,
    allUnitsVerified:false as const,
    closureId:recorded?row.id:null,
    closureUnitId:recorded?row.metadata.unitId as string:null,
    correctionRevision:revision??null};
}
export async function readVendeCommercialClosureStatus(
  context:TenantContext,scope:Scope,config:PlanProjectionConfig,
){
  if(!strictScope(scope))return denied();
  const status=await readVendeCorrectionOutcome(context,scope,config);
  // Audit is historic even when a later provider reversal or Assistant
  // suspension makes CURRENT financial closure no longer trustworthy.
  // Preserve that record separately; never turn it into a live proof.
  const [row]=await db.select({
    id:auditEvents.id,metadata:auditEvents.metadata,
  }).from(auditEvents).where(and(
    eq(auditEvents.tenantId,context.tenantId),
    eq(auditEvents.action,ACTION),
    eq(auditEvents.resourceType,"vende_compensation_intent"),
    eq(auditEvents.resourceId,scope.intentId),
    sql`${auditEvents.metadata} ->> 'productId' = ${scope.productId}`,
  )).limit(1);
  const [correction]=await db.select({revision:vendeLifecycleCommands.revision})
    .from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.tenantId,context.tenantId),
      eq(vendeLifecycleCommands.productId,scope.productId),
      eq(vendeLifecycleCommands.operationId,status.operationId),
      eq(vendeLifecycleCommands.state,"delivered"),
    )).limit(1);
  return projectVendeCommercialClosureStatus(scope,status,row,correction?.revision);
}
