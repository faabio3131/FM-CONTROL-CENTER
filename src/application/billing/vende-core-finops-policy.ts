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

export function commandCoreFinopsAlertPolicyConfig(env:NodeJS.ProcessEnv=process.env){
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
      !privateKeyPem.startsWith("-----BEGIN PRIVATE KEY-----")||
      !SCOPE.test(issuer)||!SCOPE.test(audience)||!SCOPE.test(corporateOrganizationId))
    return denied();
  return {origin:url.origin,readerKey,transport,privateKeyPem,issuer,
    audience,corporateOrganizationId};
}

async function checkScope(context:TenantContext,input:Scope,write:boolean){
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
  const config=configuration();
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
