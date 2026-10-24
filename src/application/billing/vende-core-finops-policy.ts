/** FM-only FinOps threshold editor for Core. No tenant self-service, no billing side effects. */
import {and,eq} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {billingCustomerBindings} from "@/infrastructure/db/billing-schema";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import {signCoreAIRecoveryAuthorization} from "@/application/integration/fm-core-ai-recovery-jwt";
import type {TenantContext} from "@/domain/security/tenant-context";
import type {StepUpProof} from "@/application/security/password-step-up";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE=/^[A-Za-z0-9_.-]{1,128}$/;
const COST=/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,12})?$/;
const MAX=1000000000;
const denied=():never=>{throw Error("vende.finops.alert_policy_unavailable");};
const READ="/v1/admin/ai/finops/alert-policy";
const UPDATE="/internal/v1/command/ai/finops/alert-policy";

export type FMFinopsAlertPolicy={
  tenant_id:string;unit_id:string;configured:boolean;revision:number|null;
  enabled:boolean;currency:string|null;maximum_known_cost:string|null;
};
type Scope={productId:string;externalTenantId:string;unitId:string};
type Change={expectedRevision:number;enabled:boolean;currency:string;maximumKnownCost:string};

export function commandCoreFinopsAlertPolicyConfig(env:Record<string,string|undefined>=process.env){
  if(env.FM_COMMAND_CORE_ALERT_POLICY_ENABLED!=="true")return denied();
  let url:URL;
  try{url=new URL(env.FM_COMMAND_CORE_ALERT_POLICY_ORIGIN??"");}catch{return denied();}
  const readerKey=env.FM_COMMAND_CORE_ALERT_POLICY_READER_KEY??"";
  const transport=env.FM_COMMAND_CORE_ALERT_POLICY_TRANSPORT_KEY??"";
  const privateKeyPem=env.FM_COMMAND_CORE_ALERT_POLICY_PRIVATE_KEY_PEM??"";
  const issuer=env.FM_COMMAND_CORE_ALERT_POLICY_ISSUER??"";
  const audience=env.FM_COMMAND_CORE_ALERT_POLICY_AUDIENCE??"";
  const corporateOrganizationId=env.FM_COMMAND_PLATFORM_ORGANIZATION_ID??"";
  if(url.protocol!=="https:"||!url.hostname||url.username||url.password||
      url.pathname!=="/"||url.search||url.hash||url.port&&url.port!=="443"||
      readerKey.length<32||transport.length<32||readerKey===transport||
      privateKeyPem.length<100||
      !SCOPE.test(issuer)||!SCOPE.test(audience)||!SCOPE.test(corporateOrganizationId))
    return denied();
  return {origin:url.origin,readerKey,transport,privateKeyPem,issuer,
    audience,corporateOrganizationId};
}

export async function checkScope(context:TenantContext,input:Scope,write:boolean){
  requireFMPlanAuthority(context,write);
  if(!UUID.test(input.productId)||!SCOPE.test(input.externalTenantId)||!SCOPE.test(input.unitId))
    return denied();
  const [binding]=await db.select({id:billingCustomerBindings.id})
    .from(billingCustomerBindings).innerJoin(productDefinitions,and(
      eq(productDefinitions.id,billingCustomerBindings.productId),
      eq(productDefinitions.tenantId,billingCustomerBindings.tenantId),
    )).where(and(
      eq(billingCustomerBindings.tenantId,context.tenantId),
      eq(billingCustomerBindings.productId,input.productId),
      eq(billingCustomerBindings.externalTenantId,input.externalTenantId),
      eq(productDefinitions.slug,"vendeatendeia"),
      eq(productDefinitions.status,"active"),
    )).limit(1);
  if(!binding)return denied();
}

export async function readFMFinopsAlertPolicy(
  context:TenantContext,scope:Scope,http:typeof fetch=fetch,
):Promise<FMFinopsAlertPolicy>{
  await checkScope(context,scope,false);
  const config=commandCoreFinopsAlertPolicyConfig();
  try{
    const query=new URLSearchParams({tenant_id:scope.externalTenantId,unit_id:scope.unitId});
    const res=await http(config.origin+READ+"?"+query,{
      headers:{"X-Core-Admin-Key":config.readerKey},
      redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000),
    });
    if(res.status!==200||!res.ok||Number(res.headers.get("Content-Length")??0)>2048)
      return denied();
    const raw=await res.text();
    if(raw.length>2048)return denied();
    const data=JSON.parse(raw) as FMFinopsAlertPolicy;
    if(!data||data.tenant_id!==scope.externalTenantId||data.unit_id!==scope.unitId||
      typeof data.configured!=="boolean"||typeof data.enabled!=="boolean"||
      (data.configured&&(typeof data.revision!=="number"||!Number.isSafeInteger(data.revision)||data.revision<1||
      typeof data.maximum_known_cost!=="string"||!COST.test(data.maximum_known_cost)||
      typeof data.currency!=="string"||!/^[A-Z]{3}$/.test(data.currency)))||
      (!data.configured&&(data.revision!==null||data.maximum_known_cost!==null||
      data.currency!==null||data.enabled!==false)))return denied();
    return {
      tenant_id:scope.externalTenantId,unit_id:scope.unitId,
      configured:data.configured,revision:data.revision,enabled:data.enabled,
      currency:data.currency,maximum_known_cost:data.maximum_known_cost,
    };
  }catch{return denied();}
}

export async function updateFMFinopsAlertPolicy(
  context:TenantContext,proof:StepUpProof,sessionId:string,
  scope:Scope,change:Change,http:typeof fetch=fetch,now:Date=new Date(),
):Promise<{status:"accepted";expectedNextRevision:number}>{
  await checkScope(context,scope,true);
  const config=commandCoreFinopsAlertPolicyConfig();
  if(proof.userId!==context.userId||!SCOPE.test(sessionId)||!Number.isFinite(now.getTime())||
    now.getTime()-proof.verifiedAt.getTime()>300000||
    now.getTime()-proof.verifiedAt.getTime() < -15000||
    !Number.isSafeInteger(change.expectedRevision)||change.expectedRevision<0||
    typeof change.enabled!=="boolean"||change.currency!=="USD"||
    !COST.test(change.maximumKnownCost)||Number(change.maximumKnownCost)<=0||
    Number(change.maximumKnownCost)>MAX)return denied();
  const authorization=signCoreAIRecoveryAuthorization({
    userId:context.userId,sessionId,organizationId:context.tenantId,
    role:"platform_admin",approved:true,stepUpAt:proof.verifiedAt,
  },{
    privateKeyPem:config.privateKeyPem,issuer:config.issuer,
    audience:config.audience,corporateOrganizationId:config.corporateOrganizationId,
  },{now});
  const body=JSON.stringify({
    tenant_id:scope.externalTenantId,unit_id:scope.unitId,
    expected_revision:change.expectedRevision,enabled:change.enabled,
    currency:change.currency,maximum_known_cost:change.maximumKnownCost,
  });
  try{
    const res=await http(config.origin+UPDATE,{
      method:"POST",headers:{
        Authorization:"Bearer "+authorization,
        "Content-Type":"application/json",
        "X-FM-Recovery-Service-Key":config.transport,
      },
      body,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(5000),
    });
    if(res.status!==204)return denied();
    return {status:"accepted",expectedNextRevision:change.expectedRevision+1};
  }catch{return denied();}
}


/** FM corporate readback of Core's paginated per-request FinOps alerts.
 * Financial numbers remain observed/estimated; vendor invoice is NOT verified.
 */
export type FMFinopsAlertInbox={
  tenant_id:string;unit_id:string;policy_revision:number|null;
  policy_enabled:boolean;has_more:boolean;next_cursor:string|null;
  provider_invoice_verified:false;
  items:Array<{
    request_id:string;status:"needs_attention"|"reconciled";
    reasons:string[];known_cost_subtotal:string;currency:string|null;
    unknown_attempts:number;observed_attempts:number;
    all_recorded_costs_known:boolean;provider_invoice_verified:false;
  }>;
};
type AlertFilter=Scope&{
  startDate:string;endDate:string;afterRequestId?:string;
};
function checkedDate(v:string):number{
  if(typeof v!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v))return denied();
  const ms=Date.parse(v+"T00:00:00.000Z");
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==v)return denied();
  return ms;
}
export async function readFMFinopsAlertInbox(
  context:TenantContext,scope:AlertFilter,http:typeof fetch=fetch,
):Promise<FMFinopsAlertInbox>{
  await checkScope(context,scope,false);
  const start=checkedDate(scope.startDate);
  const end=checkedDate(scope.endDate);
  if(end<start||end-start>=31*86400_000||
     (scope.afterRequestId!==undefined&&!SCOPE.test(scope.afterRequestId)))return denied();
  const config=commandCoreFinopsAlertPolicyConfig();
  const query=new URLSearchParams({
    tenant_id:scope.externalTenantId,unit_id:scope.unitId,
    start_date:scope.startDate,end_date:scope.endDate,limit:"50",
  });
  if(scope.afterRequestId)query.set("after_request_id",scope.afterRequestId);
  try{
    const res=await http(config.origin+"/v1/admin/ai/usage/alerts?"+query,{
      headers:{"X-Core-Admin-Key":config.readerKey},
      redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000),
    });
    if(res.status!==200||!res.ok||Number(res.headers.get("Content-Length")??0)>65536||
       !res.body)return denied();
    const reader=res.body.getReader();
    const parts:Uint8Array[]=[];let size=0;
    try{
      for(;;){
        const next=await reader.read();if(next.done)break;
        size+=next.value.byteLength;
        if(size>65536){await reader.cancel();return denied();}
        parts.push(next.value);
      }
    }finally{reader.releaseLock();}
    const data=JSON.parse(Buffer.concat(parts).toString("utf8")) as FMFinopsAlertInbox;
    const number=(x:unknown)=>typeof x==="number"&&Number.isSafeInteger(x)&&x>=0;
    const reasons=["usage_evidence_unavailable","provider_cost_unverified",
      "known_subtotal_above_limit"];
    if(!data||data.tenant_id!==scope.externalTenantId||
       data.unit_id!==scope.unitId||
       data.provider_invoice_verified!==false||
       typeof data.policy_enabled!=="boolean"||
       !(data.policy_revision===null||(typeof data.policy_revision==="number"&&Number.isSafeInteger(data.policy_revision)&&data.policy_revision>0))||
       typeof data.has_more!=="boolean"||
       !(data.next_cursor===null||typeof data.next_cursor==="string"&&SCOPE.test(data.next_cursor))||
       data.has_more!==(data.next_cursor!==null)||
       !Array.isArray(data.items)||data.items.length>50||
       data.has_more&&data.items.length!==50||
       data.has_more&&data.items.at(-1)?.request_id!==data.next_cursor||
       data.items.some(item=>!item||!SCOPE.test(item.request_id)||
         !["needs_attention","reconciled"].includes(item.status)||
         !Array.isArray(item.reasons)||item.reasons.some(r=>!reasons.includes(r))||
         typeof item.known_cost_subtotal!=="string"||
         !COST.test(item.known_cost_subtotal)||
         !(item.currency===null||typeof item.currency==="string"&&/^[A-Z]{3}$/.test(item.currency))||
         !number(item.unknown_attempts)||!number(item.observed_attempts)||
         item.unknown_attempts>item.observed_attempts||
         typeof item.all_recorded_costs_known!=="boolean"||
         item.provider_invoice_verified!==false))return denied();
    // The Core response is untrusted JSON even across authenticated transport.
    // Only project the documented fields; never expose arbitrary metadata.
    return {
      tenant_id:scope.externalTenantId,unit_id:scope.unitId,
      policy_revision:data.policy_revision,policy_enabled:data.policy_enabled,
      has_more:data.has_more,next_cursor:data.next_cursor,
      provider_invoice_verified:false,
      items:data.items.map(item=>({
        request_id:item.request_id,status:item.status,reasons:[...item.reasons],
        known_cost_subtotal:item.known_cost_subtotal,currency:item.currency,
        unknown_attempts:item.unknown_attempts,
        observed_attempts:item.observed_attempts,
        all_recorded_costs_known:item.all_recorded_costs_known,
        provider_invoice_verified:false as const,
      })),
    };
  }catch{return denied();}
}


/** FM operational alerts persist in Core; Command only authenticates and presents.
 * These actions must never settle a provider invoice or change customer quotas.
 */
export type FMFinopsOperationalOutbox={
  tenant_id:string;unit_id:string;
  status:"pending_review"|"no_queued_alerts";
  provider_invoice_verified:false;automated_dispatch_enabled:false;
  next_cursor:string|null;
  items:Array<{
    event_id:string;request_id:string;policy_revision:number;reasons:string[];
    known_cost_subtotal:string;currency:string|null;
    unknown_attempts:number;observed_attempts:number;created_at:string;
  }>;
};
export type FMFinopsAlertOperation=
  |{kind:"scan";startDate:string;endDate:string;afterRequestId?:string}
  |{kind:"review";eventId:string};
export type FMFinopsOperationResult=
  |{status:"accepted";kind:"review"}
  |{status:"accepted";kind:"scan";created:number;scanned:number;nextCursor:string|null};

const FINGERPRINT=/^[0-9a-f]{64}$/;
const VALID_REASONS=new Set([
  "usage_evidence_unavailable","provider_cost_unverified","known_subtotal_above_limit",
]);
const integer=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
async function readCoreBounded(res:Response,max:number):Promise<unknown>{
  if(Number(res.headers.get("Content-Length")??0)>max||!res.body)return denied();
  const reader=res.body.getReader();let bytes=0;const parts:Uint8Array[]=[];
  try{
    for(;;){
      const next=await reader.read();
      if(next.done)break;
      bytes+=next.value.byteLength;
      if(bytes>max){await reader.cancel();return denied();}
      parts.push(next.value);
    }
  }finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
}
export async function readFMFinopsOperationalOutbox(
  context:TenantContext,scope:Scope,http:typeof fetch=fetch,
  afterEventId?:string,
):Promise<FMFinopsOperationalOutbox>{
  await checkScope(context,scope,false);
  if(afterEventId!==undefined&&!FINGERPRINT.test(afterEventId))return denied();
  const config=commandCoreFinopsAlertPolicyConfig();
  try{
    const query=new URLSearchParams({
      tenant_id:scope.externalTenantId,unit_id:scope.unitId,limit:"50",
      ...(afterEventId?{after_event_id:afterEventId}:{}),
    });
    const res=await http(config.origin+"/v1/admin/ai/usage/alerts/outbox?"+query,{
      headers:{"X-Core-Admin-Key":config.readerKey},cache:"no-store",
      redirect:"error",signal:AbortSignal.timeout(5000),
    });
    if(res.status!==200||!res.ok)return denied();
    const raw=await readCoreBounded(res,32768);
    if(!raw||typeof raw!=="object"||Array.isArray(raw))return denied();
    const data=raw as FMFinopsOperationalOutbox;
    if(data.tenant_id!==scope.externalTenantId||data.unit_id!==scope.unitId||
      !["pending_review","no_queued_alerts"].includes(data.status)||
      data.provider_invoice_verified!==false||
      data.automated_dispatch_enabled!==false||
      !(data.next_cursor===null||
        typeof data.next_cursor==="string"&&FINGERPRINT.test(data.next_cursor))||
      (data.next_cursor!==null&&(
        !Array.isArray(data.items)||data.items.length!==50||
        data.next_cursor!==data.items.at(-1)?.event_id
      ))||
      !Array.isArray(data.items)||data.items.length>50||
      (data.status==="no_queued_alerts")!==(data.items.length===0)||
      data.items.some(item=>!item||!FINGERPRINT.test(item.event_id)||
        !SCOPE.test(item.request_id)||!integer(item.policy_revision)||item.policy_revision<1||
        !Array.isArray(item.reasons)||item.reasons.length>3||
        item.reasons.some(r=>!VALID_REASONS.has(r))||
        typeof item.known_cost_subtotal!=="string"||!COST.test(item.known_cost_subtotal)||
        !(item.currency===null||typeof item.currency==="string"&&/^[A-Z]{3}$/.test(item.currency))||
        !integer(item.unknown_attempts)||!integer(item.observed_attempts)||
        item.unknown_attempts>item.observed_attempts||
        typeof item.created_at!=="string"||item.created_at.length>48||
        !Number.isFinite(Date.parse(item.created_at))))return denied();
    return {
      tenant_id:scope.externalTenantId,unit_id:scope.unitId,status:data.status,
      provider_invoice_verified:false,automated_dispatch_enabled:false,
      next_cursor:data.next_cursor,
      items:data.items.map(item=>({
        event_id:item.event_id,request_id:item.request_id,
        policy_revision:item.policy_revision,reasons:item.reasons,
        known_cost_subtotal:item.known_cost_subtotal,currency:item.currency,
        unknown_attempts:item.unknown_attempts,observed_attempts:item.observed_attempts,
        created_at:item.created_at,
      })),
    };
  }catch{return denied();}
}
export async function operateFMFinopsAlertOutbox(
  context:TenantContext,proof:StepUpProof,sessionId:string,scope:Scope,
  operation:FMFinopsAlertOperation,http:typeof fetch=fetch,now:Date=new Date(),
):Promise<FMFinopsOperationResult>{
  await checkScope(context,scope,true);
  const config=commandCoreFinopsAlertPolicyConfig();
  if(proof.userId!==context.userId||!SCOPE.test(sessionId)||
    !Number.isFinite(now.getTime())||
    now.getTime()-proof.verifiedAt.getTime()>300000||
    now.getTime()-proof.verifiedAt.getTime()< -15000)return denied();
  let url:string,body:string;
  if(operation.kind==="scan"){
    const start=checkedDate(operation.startDate),end=checkedDate(operation.endDate);
    if(end<start||end-start>=31*86400_000||
      end>Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())||
      (operation.afterRequestId!==undefined&&!SCOPE.test(operation.afterRequestId)))
      return denied();
    url="/internal/v1/command/ai/finops/alert-scan";
    body=JSON.stringify({
      tenant_id:scope.externalTenantId,unit_id:scope.unitId,
      start_date:operation.startDate,end_date:operation.endDate,limit:50,
      ...(operation.afterRequestId?{after_request_id:operation.afterRequestId}:{}),
    });
  }else{
    if(!FINGERPRINT.test(operation.eventId))return denied();
    // Core now enforces the canonical tenant/unit scope on the mutation.
    // Do not pre-read only page one: older alerts must remain reviewable.
    url="/internal/v1/command/ai/finops/alert-review";
    body=JSON.stringify({
      event_id:operation.eventId,
      tenant_id:scope.externalTenantId,unit_id:scope.unitId,
    });
  }
  const token=signCoreAIRecoveryAuthorization({
    userId:context.userId,sessionId,organizationId:context.tenantId,
    role:"platform_admin",approved:true,stepUpAt:proof.verifiedAt,
  },{
    privateKeyPem:config.privateKeyPem,issuer:config.issuer,
    audience:config.audience,corporateOrganizationId:config.corporateOrganizationId,
  },{now});
  try{
    const res=await http(config.origin+url,{
      method:"POST",headers:{
        Authorization:"Bearer "+token,
        "X-FM-Recovery-Service-Key":config.transport,
        "Content-Type":"application/json",
      },body,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(5000),
    });
    if(operation.kind==="review"){
      if(res.status!==204)return denied();
      return {status:"accepted",kind:"review"};
    }
    if(res.status!==200||!res.ok)return denied();
    const raw=await readCoreBounded(res,2048);
    if(!raw||typeof raw!=="object"||Array.isArray(raw))return denied();
    const result=raw as Record<string,unknown>;
    if(!integer(result.created)||!integer(result.scanned)||
      (result.created as number)>(result.scanned as number)||
      (result.scanned as number)>50||
      result.provider_invoice_verified!==false||
      result.automated_dispatch_enabled!==false||
      !(result.next_cursor===null||
        typeof result.next_cursor==="string"&&SCOPE.test(result.next_cursor)))return denied();
    return {
      status:"accepted",kind:"scan",created:result.created as number,
      scanned:result.scanned as number,nextCursor:result.next_cursor as string|null,
    };
  }catch{
    // A timeout can mean Core persisted an alert/review: no blind retries.
    return denied();
  }
}
