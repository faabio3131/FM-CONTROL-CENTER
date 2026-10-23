/** F9: durable FM-only observation that a specific correction's Core quota
 * was verified. Historical evidence; never closes the case or modifies billing.
 */
import {and,desc,eq,sql} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import {readVendeCoreQuotaEvidence} from "./vende-core-quota-readback";
import type {TenantContext} from "@/domain/security/tenant-context";
import type {StepUpProof} from "@/application/security/password-step-up";
import type {PlanProjectionConfig} from "./assistant-plan-outbox-dispatcher";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9_.-]{1,128}$/;
const ACTION="vende.compensation_unit_quota.observed";
const PREPARED="vende.compensation_correction.prepared";
const SCHEMA="fm.vende.compensation-unit-quota-observation.v1";
type Capability="atendimento_interpretacao"|"atendimento_transcricao";
type Scope={productId:string;intentId:string};
type VerifyInput=Scope&{observationId:string;unitId:string;capability:Capability};
type Evidence=Awaited<ReturnType<typeof readVendeCoreQuotaEvidence>>;
const denied=():never=>{throw Error("vende.compensation_quota_observation_denied");};

function validate(scope:Scope){
  if(!UUID.test(scope.productId)||!UUID.test(scope.intentId))return denied();
}

async function requireBoundIntent(tx:Parameters<Parameters<typeof db.transaction>[0]>[0],
  context:TenantContext,scope:Scope,forUpdate:boolean){
  const [product]=await tx.select({id:productDefinitions.id})
    .from(productDefinitions).where(and(
      eq(productDefinitions.id,scope.productId),
      eq(productDefinitions.tenantId,context.tenantId),
      eq(productDefinitions.slug,"vendeatendeia"),
      eq(productDefinitions.status,"active"),
    )).limit(1);
  if(!product)return denied();
  const [prepared]=await tx.select({metadata:auditEvents.metadata})
    .from(auditEvents).where(and(
      eq(auditEvents.id,scope.intentId),
      eq(auditEvents.tenantId,context.tenantId),
      eq(auditEvents.action,PREPARED),
      eq(auditEvents.resourceType,"vende_lifecycle_command"),
      sql`${auditEvents.metadata} ->> 'productId' = ${scope.productId}`,
    )).limit(1);
  if(!prepared||prepared.metadata.schema!=="fm.vende.compensation-intent.v1"||
     prepared.metadata.approvedForDispatch!==false||
     typeof prepared.metadata.commandId!=="string"||
     !UUID.test(prepared.metadata.commandId))return denied();
  const query=tx.select({
    id:vendeLifecycleCommands.id,state:vendeLifecycleCommands.state,
    revision:vendeLifecycleCommands.revision,
    deliveryTarget:vendeLifecycleCommands.deliveryTarget,
  }).from(vendeLifecycleCommands).where(and(
    eq(vendeLifecycleCommands.productId,scope.productId),
    eq(vendeLifecycleCommands.tenantId,context.tenantId),
    eq(vendeLifecycleCommands.operationId,"p01.correction."+scope.intentId),
  ));
  const [correction]=forUpdate
    ?await query.for("update").limit(1)
    :await query.limit(1);
  if(!correction)return denied();
  return correction;
}

export function projectQuotaObservation(
  evidence:Evidence,input:VerifyInput,observedAt:Date,
){
  if(evidence.intentId!==input.intentId||evidence.unitId!==input.unitId||
     evidence.capability!==input.capability||
     evidence.state!=="core_unit_policy_verified"||
     evidence.coreQuotaVerified!==true||evidence.licenseFreshlyVerified!==true||
     evidence.caseResolved!==false||evidence.providerCalled!==false||
     evidence.reservationCreated!==false||evidence.allUnitsVerified!==false||
     evidence.futureAiAdmissionGuaranteed!==false||
     !Array.isArray(evidence.quotaMetrics)||
     !evidence.quotaMetrics.some(m=>m.metric==="ai.requests")||
     !evidence.quotaMetrics.some(m=>m.metric==="ai.total_tokens"))return denied();
  const metrics=evidence.quotaMetrics.map(metric=>({
    metric:metric.metric,scope:metric.scope,
    limitUnits:metric.limitUnits,reservedUnits:metric.reservedUnits,
    consumedUnits:metric.consumedUnits,remainingUnits:metric.remainingUnits,
  }));
  return {
    schema:SCHEMA,productId:input.productId,intentId:input.intentId,
    unitId:input.unitId,capability:input.capability,
    observedAt:observedAt.toISOString(),quotaMetrics:metrics,
    licenseVerifiedAtObservation:true as const,
    paymentVerifiedAtObservation:true as const,
    coreQuotaVerifiedAtObservation:true as const,
    historicalOnly:true as const,caseResolved:false as const,
    providerRefundExecuted:false as const,allUnitsVerified:false as const,
    noQuotaReservation:true as const,
  };
}

export async function recordVendeCorrectionQuotaObservation(
  context:TenantContext,proof:StepUpProof,input:VerifyInput,
  assistantConfig:PlanProjectionConfig,
  now:Date=new Date(),
){
  requireFMPlanAuthority(context,true);
  validate(input);
  if(!UUID.test(input.observationId)||!ID.test(input.unitId)||
     !["atendimento_interpretacao","atendimento_transcricao"].includes(input.capability)||
     proof.userId!==context.userId||!Number.isFinite(now.getTime())||
     now.getTime()-proof.verifiedAt.getTime()>300000||
     now.getTime()-proof.verifiedAt.getTime()< -15000||
     assistantConfig.organizationId!==context.tenantId)return denied();
  // All authoritative sources are re-read server-side; browser proofs are ignored.
  const evidence=await readVendeCoreQuotaEvidence(
    context,{productId:input.productId,intentId:input.intentId,
      unitId:input.unitId,capability:input.capability},assistantConfig,
  );
  const metadata=projectQuotaObservation(evidence,input,new Date());
  return db.transaction(async tx=>{
    const current=await requireBoundIntent(tx,context,input,true);
    if(current.state!=="delivered"||
       current.deliveryTarget?.schema!=="fm.vende.reactivation-target.v1")
      return denied();
    const [created]=await tx.insert(auditEvents).values({
      id:input.observationId,tenantId:context.tenantId,
      actorId:context.userId,actorType:"user",action:ACTION,
      resourceType:"vende_compensation_intent",resourceId:input.intentId,
      result:"unit_quota_observed_historical",
      correlationId:context.correlationId,
      metadata:{...metadata,contractRevision:current.revision},
    }).onConflictDoNothing({target:auditEvents.id})
      .returning({id:auditEvents.id});
    if(!created){
      const [previous]=await tx.select({
        action:auditEvents.action,tenantId:auditEvents.tenantId,
        actorId:auditEvents.actorId,resourceId:auditEvents.resourceId,
        metadata:auditEvents.metadata,
      }).from(auditEvents).where(eq(auditEvents.id,input.observationId)).limit(1);
      if(!previous||previous.action!==ACTION||
         previous.tenantId!==context.tenantId||
         previous.actorId!==context.userId||
         previous.resourceId!==input.intentId||
         previous.metadata.schema!==SCHEMA||
         previous.metadata.productId!==input.productId||
         previous.metadata.unitId!==input.unitId||
         previous.metadata.capability!==input.capability)return denied();
    }
    return {
      observationId:input.observationId,
      status:created?"recorded" as const:"previously_recorded" as const,
      unitId:input.unitId,capability:input.capability,
      historicalOnly:true as const,caseResolved:false as const,
      allUnitsVerified:false as const,providerRefundExecuted:false as const,
    };
  });
}

export async function readVendeCorrectionQuotaObservations(
  context:TenantContext,scope:Scope,
){
  requireFMPlanAuthority(context,false);
  validate(scope);
  return db.transaction(async tx=>{
    await requireBoundIntent(tx,context,scope,false);
    const rows=await tx.select({
      id:auditEvents.id,actorId:auditEvents.actorId,
      occurredAt:auditEvents.occurredAt,metadata:auditEvents.metadata,
    }).from(auditEvents).where(and(
      eq(auditEvents.tenantId,context.tenantId),
      eq(auditEvents.action,ACTION),
      eq(auditEvents.resourceId,scope.intentId),
      eq(auditEvents.resourceType,"vende_compensation_intent"),
      sql`${auditEvents.metadata} ->> 'productId' = ${scope.productId}`,
    )).orderBy(desc(auditEvents.occurredAt),desc(auditEvents.id)).limit(21);
    return {
      intentId:scope.intentId,historicalOnly:true as const,
      currentCoreQuotaVerified:false as const,
      caseResolved:false as const,allUnitsVerified:false as const,
      truncated:rows.length>20,
      items:rows.slice(0,20).filter(r=>
        r.metadata.schema===SCHEMA&&
        typeof r.metadata.unitId==="string"&&ID.test(r.metadata.unitId)&&
        ["atendimento_interpretacao","atendimento_transcricao"].includes(
          String(r.metadata.capability),
        ),
      ).map(r=>({
        observationId:r.id,recordedBy:r.actorId,
        recordedAt:r.occurredAt.toISOString(),
        unitId:r.metadata.unitId as string,
        capability:r.metadata.capability as Capability,
        contractRevision:r.metadata.contractRevision as number,
        historicalOnly:true as const,caseResolved:false as const,
      })),
    };
  });
}
