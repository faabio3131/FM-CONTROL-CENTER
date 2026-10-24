/** FM-only request-level reconciliation across every Core provider fallback.
 * Observational amounts are NOT provider invoices, refunds or quota release.
 */
import type {TenantContext} from "@/domain/security/tenant-context";
import type {StepUpProof} from "@/application/security/password-step-up";
import {signCoreAIRecoveryAuthorization} from
  "@/application/integration/fm-core-ai-recovery-jwt";
import {checkScope,commandCoreFinopsAlertPolicyConfig} from
  "./vende-core-finops-policy";

const MONEY=/^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,18})?$/;
const SCOPE=/^[A-Za-z0-9_.-]{1,128}$/;
const ID=/^[A-Za-z0-9_.:-]{1,128}$/;
const denied=():never=>{throw Error("vende.finops.request_reconciliation_unavailable");};
export type ProviderAttemptReconciliation={
  attempt_id:string;provider:string;model:string;outcome:string;
  fallback:boolean;source_ref:string|null;export_status:string;
  usage_matches:boolean|null;cost_matches:boolean|null;needs_attention:boolean;
};
export type ProviderRequestReconciliation={
  tenant_id:string;unit_id:string;request_id:string;
  attempts_observed:number;fallback_attempts:number;needs_attention:boolean;
  all_observational_matches:boolean;provider_invoice_verified:false;
  quota_recovery_authorized:false;real_provider_charges_certified:false;
  per_provider:{
    provider:string;attempts:number;fallback_attempts:number;
    missing_exports:number;uncertain_attempts:number;
    cost_disagreements:number;internal_unknown_costs:number;
    reported_unknown_costs:number;internal_known_cost_usd:string;
    reported_known_cost_usd:string;
  }[];attempts:ProviderAttemptReconciliation[];
};
const counter=(v:unknown):v is number=>
  typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=100;
const safe=(v:unknown,n=128):v is string=>
  typeof v==="string"&&v.length>0&&v.length<=n;
const resultFlag=(v:unknown):v is boolean|null=>
  v===null||typeof v==="boolean";

/** Strict projection prevents forwarding future internal credential fields. */
export function parseRequestReconciliation(
  value:unknown,tenantId:string,unitId:string,requestId:string,
):ProviderRequestReconciliation{
  if(!value||typeof value!=="object"||Array.isArray(value))return denied();
  const d=value as Record<string,unknown>;
  if(d.tenant_id!==tenantId||d.unit_id!==unitId||d.request_id!==requestId||
    !counter(d.attempts_observed)||d.attempts_observed<1||
    !counter(d.fallback_attempts)||d.fallback_attempts>d.attempts_observed||
    typeof d.needs_attention!=="boolean"||
    d.all_observational_matches!==!d.needs_attention||
    d.provider_invoice_verified!==false||d.quota_recovery_authorized!==false||
    d.real_provider_charges_certified!==false||
    !Array.isArray(d.attempts)||d.attempts.length!==d.attempts_observed||
    !Array.isArray(d.per_provider)||d.per_provider.length>100)return denied();
  const attempts:ProviderAttemptReconciliation[]=d.attempts.map(x=>{
    if(!x||typeof x!=="object"||Array.isArray(x))return denied();
    const a=x as Record<string,unknown>;
    if(!safe(a.attempt_id)||!safe(a.provider)||!safe(a.model,200)||
      !safe(a.outcome,40)||!safe(a.export_status,80)||
      !(a.source_ref===null||typeof a.source_ref==="string"&&ID.test(a.source_ref))||
      typeof a.fallback!=="boolean"||typeof a.needs_attention!=="boolean"||
      !resultFlag(a.usage_matches)||!resultFlag(a.cost_matches))
      return denied();
    return {attempt_id:a.attempt_id as string,provider:a.provider as string,
      model:a.model as string,outcome:a.outcome as string,
      fallback:a.fallback as boolean,source_ref:a.source_ref as string|null,
      export_status:a.export_status as string,
      usage_matches:a.usage_matches as boolean|null,
      cost_matches:a.cost_matches as boolean|null,
      needs_attention:a.needs_attention as boolean};
  });
  const ids=new Set(attempts.map(x=>x.attempt_id));
  if(ids.size!==attempts.length||
    attempts.filter(x=>x.fallback).length!==d.fallback_attempts||
    attempts.some(x=>x.needs_attention)!==d.needs_attention)return denied();
  const providers=d.per_provider.map(x=>{
    if(!x||typeof x!=="object"||Array.isArray(x))return denied();
    const p=x as Record<string,unknown>;
    if(!safe(p.provider)||![
      "attempts","fallback_attempts","missing_exports","uncertain_attempts",
      "cost_disagreements","internal_unknown_costs","reported_unknown_costs",
    ].every(key=>counter(p[key]))||
      ![p.internal_known_cost_usd,p.reported_known_cost_usd].every(v=>
        typeof v==="string"&&MONEY.test(v)))
      return denied();
    const subset=attempts.filter(a=>a.provider===p.provider);
    if(subset.length!==p.attempts||subset.filter(a=>a.fallback).length!==
      p.fallback_attempts||subset.filter(a=>a.needs_attention).length!==
      p.uncertain_attempts)return denied();
    return {
      provider:p.provider as string,attempts:p.attempts as number,
      fallback_attempts:p.fallback_attempts as number,
      missing_exports:p.missing_exports as number,
      uncertain_attempts:p.uncertain_attempts as number,
      cost_disagreements:p.cost_disagreements as number,
      internal_unknown_costs:p.internal_unknown_costs as number,
      reported_unknown_costs:p.reported_unknown_costs as number,
      internal_known_cost_usd:p.internal_known_cost_usd as string,
      reported_known_cost_usd:p.reported_known_cost_usd as string,
    };
  });
  if(new Set(providers.map(p=>p.provider)).size!==providers.length||
    providers.reduce((n,p)=>n+p.attempts,0)!==attempts.length)return denied();
  return {
    tenant_id:tenantId,unit_id:unitId,request_id:requestId,
    attempts_observed:d.attempts_observed as number,
    fallback_attempts:d.fallback_attempts as number,
    needs_attention:d.needs_attention as boolean,
    all_observational_matches:d.all_observational_matches as boolean,
    provider_invoice_verified:false,quota_recovery_authorized:false,
    real_provider_charges_certified:false,per_provider:providers,attempts,
  };
}

export async function readVendeRequestReconciliation(
  context:TenantContext,proof:StepUpProof,sessionId:string,
  scope:{productId:string;externalTenantId:string;unitId:string;requestId:string},
  http:typeof fetch=fetch,now:Date=new Date(),
):Promise<ProviderRequestReconciliation>{
  await checkScope(context,scope,true);
  if(proof.userId!==context.userId||!SCOPE.test(sessionId)||
    !SCOPE.test(scope.externalTenantId)||!SCOPE.test(scope.unitId)||
    !ID.test(scope.requestId)||!Number.isFinite(now.getTime())||
    now.getTime()-proof.verifiedAt.getTime()>300000||
    now.getTime()-proof.verifiedAt.getTime()< -15000)return denied();
  const cfg=commandCoreFinopsAlertPolicyConfig();
  const token=signCoreAIRecoveryAuthorization({
    userId:context.userId,sessionId,organizationId:context.tenantId,
    role:"platform_admin",approved:true,stepUpAt:proof.verifiedAt,
  },{
    privateKeyPem:cfg.privateKeyPem,issuer:cfg.issuer,
    audience:cfg.audience,corporateOrganizationId:cfg.corporateOrganizationId,
  },{now});
  const body=JSON.stringify({
    tenant_id:scope.externalTenantId,unit_id:scope.unitId,request_id:scope.requestId,
  });
  const response=await http(
    cfg.origin+"/internal/v1/command/ai/finops/provider-export/request-reconciliation",{
      method:"POST",headers:{
        Authorization:"Bearer "+token,
        "X-FM-Recovery-Service-Key":cfg.transport,
        "Content-Type":"application/json",
      },
      cache:"no-store",redirect:"error",body,signal:AbortSignal.timeout(8000),
    },
  );
  if(!response.ok||response.status!==200||!response.body)return denied();
  const announced=response.headers.get("content-length");
  if(announced!==null&&(!/^\d+$/.test(announced)||Number(announced)>32768))
    return denied();
  const reader=response.body.getReader();const parts:Uint8Array[]=[];
  let size=0;
  try{
    for(;;){
      const next=await reader.read();if(next.done)break;
      size+=next.value.byteLength;
      if(size>32768){await reader.cancel();return denied();}
      parts.push(next.value);
    }
  }finally{reader.releaseLock();}
  const raw:unknown=JSON.parse(Buffer.concat(parts).toString("utf8"));
  return parseRequestReconciliation(
    raw,scope.externalTenantId,scope.unitId,scope.requestId,
  );
}
