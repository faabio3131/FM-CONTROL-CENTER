/** P01 read-only Command → Core proof for one licensed unit + AI capability.
 * A signed Assistant ACK or local 'delivered' flag cannot verify Core quotas.
 * Disabled by default and does not issue or reserve a single token.
 */
import {createHmac,randomBytes} from "node:crypto";
import {and,eq} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import {readVendeCorrectionOutcome} from "./vende-compensation-outcome";
import type {PlanProjectionConfig} from "./assistant-plan-outbox-dispatcher";
import type {TenantContext} from "@/domain/security/tenant-context";

export const CORE_QUOTA_READBACK_PATH="/internal/v1/command/ai/quota-readback";
export const CORE_QUOTA_READBACK_SCHEMA="fm.core.ai.quota-readback.v1";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9_.-]{1,128}$/;
const MAX_BYTES=24_576;
type Capability="atendimento_interpretacao"|"atendimento_transcricao";
export type CoreQuotaEvidence={
  intentId:string;unitId:string;capability:Capability;
  state:"core_unit_policy_verified";
  licenseFreshlyVerified:true;coreQuotaVerified:true;
  quotaMetrics:{metric:string;scope:"tenant"|"unit";limitUnits:number;
    windowSeconds:number;reservedUnits:number;consumedUnits:number;remainingUnits:number}[];
  caseResolved:false;providerCalled:false;reservationCreated:false;
  allUnitsVerified:false;futureAiAdmissionGuaranteed:false;
};
const deny=():never=>{throw new Error("vende.core_quota_readback_unavailable");};
const uint=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
type Config={origin:string;secret:string};
export function coreQuotaReadbackConfig(env:Record<string,string|undefined>=process.env):Config{
  if(env.FM_COMMAND_CORE_QUOTA_READBACK_ENABLED!=="true")return deny();
  const key=env.FM_COMMAND_CORE_QUOTA_READBACK_SECRET??"";
  let url:URL;try{url=new URL(env.FM_COMMAND_CORE_QUOTA_READBACK_ORIGIN??"");}catch{return deny();}
  if(url.protocol!=="https:"||url.username||url.password||
     url.pathname!=="/"||url.search||url.hash||
     url.hostname==="localhost"||url.hostname==="127.0.0.1"||
     url.hostname.endsWith(".local")||
     (url.port&&url.port!=="443")||
     Buffer.byteLength(key,"utf8")<32||Buffer.byteLength(key,"utf8")>256)return deny();
  return {origin:url.origin,secret:key};
}
export function signCoreQuotaReadback(secret:string,body:string):string{
  if(Buffer.byteLength(secret,"utf8")<32)return deny();
  return createHmac("sha256",Buffer.from(secret,"utf8"))
    .update("POST\n"+CORE_QUOTA_READBACK_PATH+"\n"+body).digest("hex");
}
export function parseCoreQuotaReadback(raw:unknown,scope:{
  tenantId:string;unitId:string;capability:Capability;
  planCode:string;planRevision:number;
},now:Date):CoreQuotaEvidence["quotaMetrics"]{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return deny();
  const r=raw as Record<string,unknown>;
  if(r.schema!==CORE_QUOTA_READBACK_SCHEMA||
     r.tenant_id!==scope.tenantId||r.unit_id!==scope.unitId||
     r.capability!==scope.capability||r.plan_code!==scope.planCode||
     r.plan_revision!==scope.planRevision||
     r.license_freshly_verified!==true||
     r.core_policy_matches_signed_grant!==true||
     r.reservation_created!==false||r.provider_called!==false||
     r.case_resolved!==false||
     !uint(r.grant_expires_at)||
     (r.grant_expires_at as number)*1000<=now.getTime()||
     (r.grant_expires_at as number)*1000>now.getTime()+65_000||
     !Array.isArray(r.quota_metrics)||
     r.quota_metrics.length<2||r.quota_metrics.length>5)return deny();
  const used=new Set<string>();
  const mapped:CoreQuotaEvidence["quotaMetrics"]=[];
  for(const item of r.quota_metrics as unknown[]){
    if(!item||typeof item!=="object"||Array.isArray(item))return deny();
    const m=item as Record<string,unknown>;
    if(typeof m.metric!=="string"||
       !["ai.requests","ai.total_tokens","ai.input_tokens",
         "ai.output_tokens","ai.cached_tokens"].includes(m.metric)||
       used.has(m.metric)||!["tenant","unit"].includes(String(m.scope))||
       !["limit_units","window_seconds","reserved_units","consumed_units",
         "remaining_units","policy_revision"].every(k=>uint(m[k]))||
       (m.policy_revision as number)!==scope.planRevision||
       (m.limit_units as number)<1||(m.limit_units as number)>2_000_000_000||
       (m.window_seconds as number)<1||(m.window_seconds as number)>31_536_000||
       (m.reserved_units as number)+(m.consumed_units as number)+
         (m.remaining_units as number)!==(m.limit_units as number))return deny();
    used.add(m.metric);
    mapped.push({
      metric:m.metric,scope:m.scope as "tenant"|"unit",
      limitUnits:m.limit_units as number,windowSeconds:m.window_seconds as number,
      reservedUnits:m.reserved_units as number,
      consumedUnits:m.consumed_units as number,
      remainingUnits:m.remaining_units as number,
    });
  }
  if(!used.has("ai.requests")||!used.has("ai.total_tokens"))return deny();
  return mapped;
}
export async function readVendeCoreQuotaEvidence(
  context:TenantContext,input:{productId:string;intentId:string;
    unitId:string;capability:Capability},
  assistantConfig:PlanProjectionConfig,
  transportConfig:Config=coreQuotaReadbackConfig(),
  assistantHttp:typeof fetch=fetch,coreHttp:typeof fetch=fetch,
  now:Date=new Date(),
):Promise<CoreQuotaEvidence>{
  requireFMPlanAuthority(context,false);
  if(!UUID.test(input.productId)||!UUID.test(input.intentId)||
     !ID.test(input.unitId)||
     !["atendimento_interpretacao","atendimento_transcricao"].includes(input.capability)||
     assistantConfig.organizationId!==context.tenantId)return deny();

  // No trusted Core proof without a separately verified FM commercial status.
  const initial=await readVendeCorrectionOutcome(context,{
    productId:input.productId,intentId:input.intentId,
  },assistantConfig,assistantHttp,now);
  if(initial.state!=="assistant_active_payment_verified"||
     initial.financialSettlementCurrentlyVerified!==true||
     initial.remoteEntitlementConfirmed!==true)return deny();

  const operationId="p01.correction."+input.intentId;
  const [correction]=await db.select({
    externalTenantId:vendeLifecycleCommands.externalTenantId,
    deliveryTarget:vendeLifecycleCommands.deliveryTarget,
    state:vendeLifecycleCommands.state,
  }).from(vendeLifecycleCommands).where(and(
    eq(vendeLifecycleCommands.tenantId,context.tenantId),
    eq(vendeLifecycleCommands.productId,input.productId),
    eq(vendeLifecycleCommands.operationId,operationId),
  )).limit(1);
  if(!correction||correction.state!=="delivered"||
     !ID.test(correction.externalTenantId)||
     correction.deliveryTarget?.schema!=="fm.vende.reactivation-target.v1")return deny();
  const target=correction.deliveryTarget;
  const rawBody=JSON.stringify({
    schema:CORE_QUOTA_READBACK_SCHEMA,
    tenant_id:correction.externalTenantId,unit_id:input.unitId,
    capability:input.capability,issued_at:Math.floor(now.getTime()/1000),
    nonce:randomBytes(24).toString("base64url"),
  });
  let result:unknown;
  try{
    const response=await coreHttp(transportConfig.origin+CORE_QUOTA_READBACK_PATH,{
      method:"POST",cache:"no-store",redirect:"error",
      headers:{"Content-Type":"application/json",
        "X-FM-Command-Quota-Signature":signCoreQuotaReadback(transportConfig.secret,rawBody)},
      body:rawBody,signal:AbortSignal.timeout(5000),
    });
    if(!response.ok||response.status!==200)return deny();
    if(Number(response.headers.get("content-length")??0)>MAX_BYTES||
       !response.body)return deny();
    const reader=response.body.getReader();
    const parts:Uint8Array[]=[];let bytes=0;
    try{
      for(;;){
        const next=await reader.read();if(next.done)break;
        bytes+=next.value.byteLength;
        if(bytes>MAX_BYTES){await reader.cancel();return deny();}
        parts.push(next.value);
      }
    }finally{reader.releaseLock();}
    result=JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
  }catch{return deny();}
  const metrics=parseCoreQuotaReadback(result,{
    tenantId:correction.externalTenantId,unitId:input.unitId,
    capability:input.capability,planCode:target.planCode,
    planRevision:target.planRevision,
  },new Date());
  // A second freshly authenticated Assistant+PSP read prevents using an old
  // Core observation to paper over a concurrent suspension/refund.
  const again=await readVendeCorrectionOutcome(context,{
    productId:input.productId,intentId:input.intentId,
  },assistantConfig,assistantHttp);
  if(again.state!=="assistant_active_payment_verified"||
     again.financialSettlementCurrentlyVerified!==true||
     again.remoteEntitlementConfirmed!==true||
     again.operationId!==operationId)return deny();

  return {
    intentId:input.intentId,unitId:input.unitId,capability:input.capability,
    state:"core_unit_policy_verified",
    licenseFreshlyVerified:true,coreQuotaVerified:true,quotaMetrics:metrics,
    caseResolved:false,providerCalled:false,reservationCreated:false,
    allUnitsVerified:false,futureAiAdmissionGuaranteed:false,
  };
}
