/** F9: corporate-only signed Core FinOps reader.
 * Command owns client/product bindings and commercial prices; Core is the
 * authoritative source of AI attempt costs. No billing/PSP side effects.
 * Disabled until the FM operator configures trusted Core S2S transport.
 */
import {createHmac,randomBytes} from "node:crypto";
import {and,asc,eq} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {billingCustomerBindings} from "@/infrastructure/db/billing-schema";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import type {TenantContext} from "@/domain/security/tenant-context";

export const CORE_FINOPS_REPORT_PATH="/internal/v1/command/ai/finops/report";
export const CORE_FINOPS_REPORT_SCHEMA="fm.core.finops.read.v1";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE=/^[A-Za-z0-9_.-]{1,128}$/;
const DECIMAL=/^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const METADATA_LIMIT=125_000;
const MAX_BUCKETS=500;
export class VendeFinopsReadDenied extends Error{
  constructor(){super("vende.finops.unavailable");}
}
const denied=():never=>{throw new VendeFinopsReadDenied();};
export type CoreFinopsBucket={
  day:string;provider:string;model:string;capability:string;outcome:string;
  currency:string;attempts:number;fallback_attempts:number;
  input_tokens_observed:number;output_tokens_observed:number;
  cached_tokens_observed:number;token_counters_complete:false;
  latency_ms_total:number;latency_ms_max:number;known_cost_events:number;
  unknown_cost_events:number;known_cost_subtotal:string;
  actual_provider_spend_verified:false;
};
export type CoreFinopsReport={
  schema:typeof CORE_FINOPS_REPORT_SCHEMA;
  tenant_id:string;unit_id:string;start_date:string;end_date:string;
  buckets:CoreFinopsBucket[];known_attempts:number;unknown_attempts:number;
  coverage:"no_observations"|"partial_unknown_costs"|"priced_internal_observations";
  internal_fm_cost_only:true;actual_provider_spend_verified:false;
  commercial_revenue_included:false;
};
type Scope={productId:string;externalTenantId:string;unitId:string;startDate:string;endDate:string};
type Config={origin:string;secret:string};
const ISODATE=/^\d{4}-\d{2}-\d{2}$/;
function dateValue(value:string):number{
  if(!ISODATE.test(value))return NaN;
  const t=Date.parse(value+"T00:00:00.000Z");
  return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===value?t:NaN;
}
export function validateFinopsPeriod(start:string,end:string,now:Date):void{
  const from=dateValue(start),to=dateValue(end);
  if(!Number.isFinite(from)||!Number.isFinite(to)||!Number.isFinite(now.getTime())||
      to<from||(to-from)/86400_000>=31||to>Date.UTC(
        now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()))denied();
}
export function commandCoreFinopsConfig(
  env:Record<string,string|undefined>=process.env,
):Config{
  if(env.FM_COMMAND_CORE_FINOPS_ENABLED!=="true")return denied();
  const secret=env.FM_COMMAND_CORE_FINOPS_SECRET??"";
  let origin:URL;
  try{origin=new URL(env.FM_COMMAND_CORE_FINOPS_ORIGIN??"");}catch{return denied();}
  if(origin.protocol!=="https:"||!origin.hostname||origin.username||origin.password||
     origin.search||origin.hash||origin.pathname!=="/"||
     (origin.port&&origin.port!=="443")||secret.length<32||
     Buffer.byteLength(secret,"utf8")>256)return denied();
  return {origin:origin.origin,secret};
}
export function signCommandCoreFinops(
  secret:string,body:string,
):string{
  if(typeof secret!=="string"||Buffer.byteLength(secret,"utf8")<32) return denied();
  return createHmac("sha256",Buffer.from(secret,"utf8"))
    .update("POST\n"+CORE_FINOPS_REPORT_PATH+"\n"+body).digest("hex");
}
const number=(value:unknown)=>typeof value==="number"&&
  Number.isSafeInteger(value)&&value>=0;
const text=(value:unknown,max:number)=>typeof value==="string"&&
  value.length>0&&value.length<=max;
export function parseCoreFinopsReport(
  raw:unknown,expected:{tenantId:string;unitId:string;from:string;to:string},
):CoreFinopsReport{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return denied();
  const r=raw as Record<string,unknown>;
  if(r.schema!==CORE_FINOPS_REPORT_SCHEMA||
     r.tenant_id!==expected.tenantId||r.unit_id!==expected.unitId||
     r.start_date!==expected.from||r.end_date!==expected.to||
     r.internal_fm_cost_only!==true||
     r.actual_provider_spend_verified!==false||
     r.commercial_revenue_included!==false||
     !number(r.known_attempts)||!number(r.unknown_attempts)||
     !Array.isArray(r.buckets)||r.buckets.length>MAX_BUCKETS)return denied();
  let known=0,unknown=0;
  const buckets:CoreFinopsBucket[]=[];
  for(const entry of r.buckets as unknown[]){
    if(!entry||typeof entry!=="object"||Array.isArray(entry))return denied();
    const b=entry as Record<string,unknown>;
    if(!text(b.day,10)||!ISODATE.test(b.day as string)||
       (b.day as string)<expected.from||(b.day as string)>expected.to||
       !text(b.provider,128)||!text(b.model,200)||!text(b.capability,80)||
       !text(b.outcome,40)||!text(b.currency,3)||!(/^[A-Z]{3}$/).test(b.currency as string)||
       b.token_counters_complete!==false||b.actual_provider_spend_verified!==false||
       !text(b.known_cost_subtotal,80)||!DECIMAL.test(b.known_cost_subtotal as string)||
       ![
         "attempts","fallback_attempts","input_tokens_observed","output_tokens_observed",
         "cached_tokens_observed","latency_ms_total","latency_ms_max",
         "known_cost_events","unknown_cost_events",
       ].every(key=>number(b[key]))||
       (b.known_cost_events as number)+(b.unknown_cost_events as number)!==b.attempts||
       (b.fallback_attempts as number)> (b.attempts as number)||
       (b.cached_tokens_observed as number)>(b.input_tokens_observed as number))
      return denied();
    known+=b.known_cost_events as number;
    unknown+=b.unknown_cost_events as number;
    if(!Number.isSafeInteger(known)||!Number.isSafeInteger(unknown))return denied();
    // Project an exact safe allowlist, never expose arbitrary Core/provider
    // response fields through a corporate UI, even with valid S2S transport.
    buckets.push({
      day:b.day as string,provider:b.provider as string,
      model:b.model as string,capability:b.capability as string,
      outcome:b.outcome as string,currency:b.currency as string,
      attempts:b.attempts as number,fallback_attempts:b.fallback_attempts as number,
      input_tokens_observed:b.input_tokens_observed as number,
      output_tokens_observed:b.output_tokens_observed as number,
      cached_tokens_observed:b.cached_tokens_observed as number,
      token_counters_complete:false,latency_ms_total:b.latency_ms_total as number,
      latency_ms_max:b.latency_ms_max as number,
      known_cost_events:b.known_cost_events as number,
      unknown_cost_events:b.unknown_cost_events as number,
      known_cost_subtotal:b.known_cost_subtotal as string,
      actual_provider_spend_verified:false,
    });
  }
  const coverage=buckets.length===0?"no_observations":
    unknown>0?"partial_unknown_costs":"priced_internal_observations";
  if(known!==r.known_attempts||unknown!==r.unknown_attempts||r.coverage!==coverage)
    return denied();
  return {
    schema:CORE_FINOPS_REPORT_SCHEMA,tenant_id:expected.tenantId,
    unit_id:expected.unitId,start_date:expected.from,end_date:expected.to,
    buckets,known_attempts:known,unknown_attempts:unknown,
    coverage,internal_fm_cost_only:true,actual_provider_spend_verified:false,
    commercial_revenue_included:false,
  };
}
export async function readVendeCoreFinops(
  context:TenantContext,input:Scope,
  config:Config=commandCoreFinopsConfig(),
  http:typeof fetch=fetch,now:Date=new Date(),
):Promise<CoreFinopsReport>{
  requireFMPlanAuthority(context,false);
  if(!UUID.test(input.productId)||!SCOPE.test(input.externalTenantId)||
     !SCOPE.test(input.unitId))return denied();
  validateFinopsPeriod(input.startDate,input.endDate,now);
  // Authority: proof of commercial ownership of external tenant by this
  // specific FM product. An arbitrary browser tenant ID cannot be signed.
  const [binding]=await db.select({id:billingCustomerBindings.id})
    .from(billingCustomerBindings)
    .innerJoin(productDefinitions,and(
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
  const body=JSON.stringify({
    schema:CORE_FINOPS_REPORT_SCHEMA,
    tenant_id:input.externalTenantId,unit_id:input.unitId,
    start_date:input.startDate,end_date:input.endDate,
    issued_at:Math.floor(now.getTime()/1000),
    nonce:randomBytes(24).toString("base64url"),
  });
  try{
    const response=await http(config.origin+CORE_FINOPS_REPORT_PATH,{
      method:"POST",headers:{
        "Content-Type":"application/json",
        "X-FM-Command-FinOps-Signature":signCommandCoreFinops(config.secret,body),
      },
      body,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(5000),
    });
    if(response.status!==200||!response.ok)return denied();
    if(Number(response.headers.get("Content-Length")??0)>METADATA_LIMIT)return denied();
    if(!response.body)return denied();
    const reader=response.body.getReader();
    const chunks:Uint8Array[]=[];
    let bytes=0;
    try{
      for(;;){
        const next=await reader.read();
        if(next.done)break;
        bytes+=next.value.byteLength;
        if(bytes>METADATA_LIMIT){await reader.cancel();return denied();}
        chunks.push(next.value);
      }
    }finally{reader.releaseLock();}
    const data=Buffer.concat(chunks).toString("utf8");
    return parseCoreFinopsReport(JSON.parse(data) as unknown,{
      tenantId:input.externalTenantId,unitId:input.unitId,
      from:input.startDate,to:input.endDate,
    });
  }catch{return denied();}
}


/** Bounded selector for FM corporate operators, not a tenant discovery API.
 * Unit identifiers still come from the Assistant's licensed runtime; this
 * list only supplies FM-owned product/customer external-tenant bindings.
 */
export async function listVendeFinopsBoundTenants(
  context:TenantContext,productId:string,
):Promise<{items:string[];truncated:boolean}>{
  requireFMPlanAuthority(context,false);
  if(!UUID.test(productId))return denied();
  const [product]=await db.select({id:productDefinitions.id})
    .from(productDefinitions).where(and(
      eq(productDefinitions.tenantId,context.tenantId),
      eq(productDefinitions.id,productId),
      eq(productDefinitions.slug,"vendeatendeia"),
      eq(productDefinitions.status,"active"),
    )).limit(1);
  if(!product)return denied();
  const records=await db.select({externalTenantId:billingCustomerBindings.externalTenantId})
    .from(billingCustomerBindings).where(and(
      eq(billingCustomerBindings.tenantId,context.tenantId),
      eq(billingCustomerBindings.productId,productId),
    )).orderBy(asc(billingCustomerBindings.externalTenantId)).limit(51);
  return {items:records.slice(0,50).map(x=>x.externalTenantId),truncated:records.length>50};
}
