/** FM-only operational reconciliation. Core is authoritative for usage and evidence. */
import type {TenantContext} from "@/domain/security/tenant-context";
import type {StepUpProof} from "@/application/security/password-step-up";
import {signCoreAIRecoveryAuthorization} from "@/application/integration/fm-core-ai-recovery-jwt";
import {checkScope,commandCoreFinopsAlertPolicyConfig}
  from "./vende-core-finops-policy";

const SCOPE=/^[A-Za-z0-9_.-]{1,128}$/;
const MONEY=/^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,18})?$/;
const denied=():never=>{throw Error("vende.finops.provider_export_unavailable");};

export type SourceScope={
  productId:string;externalTenantId:string;unitId:string;requestId:string;
};
export type SourceAttempt={
  event_id:string;attempt_id:string|null;provider:string;model:string;
  outcome:string;fallback:boolean;input_tokens:number|null;
  output_tokens:number|null;cost_known_subtotal_usd:string|null;
  cost_known:boolean;
};
export type ImportSource={
  attemptId:string;provider:string;model:string;
  adapter:"openai_compatible"|"gemini";accountRef:string;
  sourceRef:string;observedAt:string;
  usage:Record<string,number|null>;costUsd:string|null;
};
export type ProviderComparison={
  tenant_id:string;unit_id:string;request_id:string;attempt_id:string;
  status:string;provider:string|null;source_ref:string|null;
  input_tokens_reported:number|null;output_tokens_reported:number|null;
  report_cost_usd:string|null;internal_cost_usd:string|null;
  usage_matches:boolean|null;cost_matches:boolean|null;
  needs_attention:boolean;provider_invoice_verified:false;
  provider_signature_verified:false;quota_recovery_authorized:false;
};
const safe=(x:unknown,max=128):x is string=>
  typeof x==="string"&&x.trim().length>0&&x.length<=max;
function validatedScope(input:SourceScope){
  if(!safe(input.requestId)||!SCOPE.test(input.externalTenantId)||
    !SCOPE.test(input.unitId))return denied();
}
async function readLimited(res:Response,size=16384):Promise<unknown>{
  const announced=res.headers.get("Content-Length");
  if(res.status!==200||!res.ok||!res.body||
    (announced!==null&&(!/^\d+$/.test(announced)||Number(announced)>size)))
    return denied();
  const reader=res.body.getReader(),parts:Uint8Array[]=[];
  let received=0;
  try{
    for(;;){
      const chunk=await reader.read();
      if(chunk.done)break;
      received+=chunk.value.byteLength;
      if(received>size){await reader.cancel();return denied();}
      parts.push(chunk.value);
    }
  }finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
}
export async function readProviderAttempts(context:TenantContext,scope:SourceScope,
  http:typeof fetch=fetch):Promise<SourceAttempt[]>{
  validatedScope(scope);
  await checkScope(context,scope,false);
  const config=commandCoreFinopsAlertPolicyConfig();
  const params=new URLSearchParams({tenant_id:scope.externalTenantId,
    unit_id:scope.unitId,request_id:scope.requestId});
  const res=await http(config.origin+"/v1/admin/ai/usage/attempts?"+params,{
    cache:"no-store",redirect:"error",headers:{"X-Core-Admin-Key":config.readerKey},
    signal:AbortSignal.timeout(5000),
  });
  const raw=await readLimited(res);
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return denied();
  const data=raw as Record<string,unknown>;
  if(data.tenant_id!==scope.externalTenantId||data.unit_id!==scope.unitId||
    data.request_id!==scope.requestId||data.provider_invoice_verified!==false||
    !Array.isArray(data.items)||data.items.length>100)return denied();
  for(const value of data.items){
    if(!value||typeof value!=="object"||Array.isArray(value))return denied();
    const a=value as Record<string,unknown>;
    if(!safe(a.event_id)||!(a.attempt_id===null||safe(a.attempt_id))||
      !safe(a.provider)||!safe(a.model,200)||!safe(a.outcome,40)||
      typeof a.fallback!=="boolean"||typeof a.cost_known!=="boolean"||
      !(a.input_tokens===null||Number.isSafeInteger(a.input_tokens)&&
        (a.input_tokens as number)>=0)||
      !(a.output_tokens===null||Number.isSafeInteger(a.output_tokens)&&
        (a.output_tokens as number)>=0)||
      !(a.cost_known_subtotal_usd===null||
        typeof a.cost_known_subtotal_usd==="string"&&a.cost_known_subtotal_usd.length<=80))
      return denied();
  }
  return data.items as SourceAttempt[];
}
export async function readProviderComparison(context:TenantContext,scope:SourceScope,
  attemptId:string,http:typeof fetch=fetch):Promise<ProviderComparison>{
  validatedScope(scope);
  if(!safe(attemptId))return denied();
  await checkScope(context,scope,false);
  const cfg=commandCoreFinopsAlertPolicyConfig();
  const query=new URLSearchParams({tenant_id:scope.externalTenantId,
    unit_id:scope.unitId,request_id:scope.requestId,attempt_id:attemptId});
  const res=await http(cfg.origin+"/v1/admin/ai/usage/provider-export?"+query,{
    cache:"no-store",redirect:"error",headers:{"X-Core-Admin-Key":cfg.readerKey},
    signal:AbortSignal.timeout(5000),
  });
  const raw=await readLimited(res,4096);
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return denied();
  const d=raw as Record<string,unknown>;
  if(d.tenant_id!==scope.externalTenantId||d.unit_id!==scope.unitId||
    d.request_id!==scope.requestId||d.attempt_id!==attemptId||
    d.provider_invoice_verified!==false||d.provider_signature_verified!==false||
    d.quota_recovery_authorized!==false||typeof d.needs_attention!=="boolean"||
    !safe(d.status,80)||
    !(d.usage_matches===null||typeof d.usage_matches==="boolean")||
    !(d.cost_matches===null||typeof d.cost_matches==="boolean")||
    !(d.provider===null||safe(d.provider))||
    !(d.source_ref===null||safe(d.source_ref))||
    !["input_tokens_reported","output_tokens_reported"].every(k=>
      d[k]===null||Number.isSafeInteger(d[k])&&(d[k] as number)>=0)||
    !["report_cost_usd","internal_cost_usd"].every(k=>
      d[k]===null||typeof d[k]==="string"&&(d[k] as string).length<=80))
    return denied();
  return d as ProviderComparison;
}
export async function importProviderExport(context:TenantContext,proof:StepUpProof,
  sessionId:string,scope:SourceScope,source:ImportSource,
  http:typeof fetch=fetch,now:Date=new Date()):Promise<"created"|"already_recorded">{
  validatedScope(scope);
  await checkScope(context,scope,true);
  if(proof.userId!==context.userId||!SCOPE.test(sessionId)||
    !Number.isFinite(now.getTime())||
    now.getTime()-proof.verifiedAt.getTime()>300000||
    now.getTime()-proof.verifiedAt.getTime() < -15000||
    !safe(source.attemptId)||!safe(source.provider)||
    !safe(source.model,200)||!safe(source.accountRef)||
    !safe(source.sourceRef)||
    !["openai_compatible","gemini"].includes(source.adapter)||
    !safe(source.observedAt,40)||
    !Number.isFinite(Date.parse(source.observedAt))||
    !source.usage||typeof source.usage!=="object"||
    Array.isArray(source.usage)||Object.keys(source.usage).length>12||
    Object.entries(source.usage).some(([k,v])=>!safe(k,64)||
      !(v===null||Number.isSafeInteger(v)&&v>=0))||
    !(source.costUsd===null||typeof source.costUsd==="string"&&MONEY.test(source.costUsd)))
    return denied();
  const cfg=commandCoreFinopsAlertPolicyConfig();
  const authorization=signCoreAIRecoveryAuthorization({
    userId:context.userId,sessionId,organizationId:context.tenantId,
    role:"platform_admin",approved:true,stepUpAt:proof.verifiedAt,
  },{
    privateKeyPem:cfg.privateKeyPem,issuer:cfg.issuer,
    audience:cfg.audience,corporateOrganizationId:cfg.corporateOrganizationId,
  },{now});
  const body=JSON.stringify({
    tenant_id:scope.externalTenantId,unit_id:scope.unitId,
    request_id:scope.requestId,attempt_id:source.attemptId,
    provider:source.provider,model:source.model,adapter:source.adapter,
    account_ref:source.accountRef,source_ref:source.sourceRef,
    observed_at:source.observedAt,usage:source.usage,cost_usd:source.costUsd,
  });
  if(body.length>4096)return denied();
  const res=await http(cfg.origin+"/internal/v1/command/ai/finops/provider-export",{
    method:"POST",headers:{Authorization:"Bearer "+authorization,
      "X-FM-Recovery-Service-Key":cfg.transport,
      "Content-Type":"application/json"},
    cache:"no-store",redirect:"error",body,signal:AbortSignal.timeout(8000),
  });
  const raw=await readLimited(res,2048);
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return denied();
  const data=raw as Record<string,unknown>;
  if(!["created","already_recorded"].includes(data.status as string)||
    data.tenant_id!==scope.externalTenantId||data.unit_id!==scope.unitId||
    data.request_id!==scope.requestId||data.attempt_id!==source.attemptId||
    data.provider_invoice_verified!==false||data.quota_recovery_authorized!==false)
    return denied();
  return data.status as "created"|"already_recorded";
}

export type ProviderFeedSyncRequest={
  provider:string;accountRef:string;startDate:string;endDate:string;
  page:number;limit:number;
};
export type ProviderFeedSyncOutcome={
  created:number;alreadyRecorded:number;unreported:number;scanned:number;
  nextPage:number|null;providerInvoiceVerified:false;quotaRecoveryAuthorized:false;
};
const CALENDAR=/^\d{4}-\d{2}-\d{2}$/;
const FEED_ID=/^[A-Za-z0-9_.:-]{1,128}$/;
export function validateProviderFeedSyncRequest(input:ProviderFeedSyncRequest):void{
  if(!input||typeof input!=="object"||Array.isArray(input)||
    !FEED_ID.test(input.provider)||!FEED_ID.test(input.accountRef)||
    !CALENDAR.test(input.startDate)||!CALENDAR.test(input.endDate)||
    !Number.isSafeInteger(input.page)||input.page<0||input.page>20000||
    !Number.isSafeInteger(input.limit)||input.limit<1||input.limit>50)
    return denied();
  const from=new Date(input.startDate+"T00:00:00.000Z");
  const to=new Date(input.endDate+"T00:00:00.000Z");
  if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||
    from.toISOString().slice(0,10)!==input.startDate||
    to.toISOString().slice(0,10)!==input.endDate||
    to.getTime()<from.getTime()||
    to.getTime()-from.getTime()>92*86_400_000)return denied();
}
/** Operator-triggered supplier feed. Core chooses endpoint and secret exclusively. */
export async function syncProviderExportFeed(
  context:TenantContext,proof:StepUpProof,sessionId:string,
  scope:Pick<SourceScope,"productId"|"externalTenantId"|"unitId">,
  input:ProviderFeedSyncRequest,http:typeof fetch=fetch,now:Date=new Date(),
):Promise<ProviderFeedSyncOutcome>{
  await checkScope(context,scope,true);
  validateProviderFeedSyncRequest(input);
  if(proof.userId!==context.userId||!SCOPE.test(sessionId)||
    !Number.isFinite(now.getTime())||
    now.getTime()-proof.verifiedAt.getTime()>300000||
    now.getTime()-proof.verifiedAt.getTime()< -15000)return denied();
  const cfg=commandCoreFinopsAlertPolicyConfig();
  const authorization=signCoreAIRecoveryAuthorization({
    userId:context.userId,sessionId,organizationId:context.tenantId,
    role:"platform_admin",approved:true,stepUpAt:proof.verifiedAt,
  },{
    privateKeyPem:cfg.privateKeyPem,issuer:cfg.issuer,
    audience:cfg.audience,corporateOrganizationId:cfg.corporateOrganizationId,
  },{now});
  const body=JSON.stringify({
    tenant_id:scope.externalTenantId,unit_id:scope.unitId,
    provider:input.provider,account_ref:input.accountRef,
    start_date:input.startDate,end_date:input.endDate,
    page:input.page,limit:input.limit,
  });
  const res=await http(
    cfg.origin+"/internal/v1/command/ai/finops/provider-export/sync",{
      method:"POST",cache:"no-store",redirect:"error",
      headers:{"Authorization":"Bearer "+authorization,
        "X-FM-Recovery-Service-Key":cfg.transport,
        "Content-Type":"application/json"},
      body,signal:AbortSignal.timeout(15000),
    },
  );
  const raw=await readLimited(res,2048);
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return denied();
  const data=raw as Record<string,unknown>;
  const count=(value:unknown):value is number=>Number.isSafeInteger(value)&&
    typeof value==="number"&&value>=0&&value<=50;
  if(!count(data.created)||!count(data.already_recorded)||
    !count(data.unreported)||!count(data.scanned)||
    data.scanned>input.limit||
    data.created+data.already_recorded+data.unreported!==data.scanned||
    !(data.next_page===null||Number.isSafeInteger(data.next_page)&&
      typeof data.next_page==="number"&&data.next_page===input.page+1&&
      data.next_page<=20000)||
    data.provider_invoice_verified!==false||
    data.quota_recovery_authorized!==false)return denied();
  return {
    created:data.created,alreadyRecorded:data.already_recorded,
    unreported:data.unreported,scanned:data.scanned,
    nextPage:data.next_page as number|null,
    providerInvoiceVerified:false,quotaRecoveryAuthorized:false,
  };
}
