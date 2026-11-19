import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/application/audit/record-audit-event";
import { ProductRegistryService, ProductNotFoundError } from "@/application/products/product-registry-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { verifyPasswordStepUp, StepUpRequiredError } from "@/application/security/password-step-up";
import { FMCC_IRON_PRODUCT_SLUG } from "@/domain/billing/iron-product-identity";
import { requirePermission, AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { IronCommercialConnector, IRON_COMMERCIAL_SECRET_REF, IRON_COMMERCIAL_SOURCE_TYPE, environmentIronControlTenantId } from "@/infrastructure/integration/iron-commercial-connector";
import { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";

export const dynamic = "force-dynamic";
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FEATURE = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const integer = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 2147483647;
const json = (body: unknown, status=200) => NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});

async function authority(context: Awaited<ReturnType<typeof resolveTenantContext>>, productId: string) {
  const product = await new ProductRegistryService(new PostgresProductRepository()).get(context,productId);
  if (product.slug !== FMCC_IRON_PRODUCT_SLUG || context.tenantId !== environmentIronControlTenantId())
    throw new Error("billing.iron_legacy_scope_denied");
  const sources = (await new PostgresSourceRepository().list(context.tenantId)).filter(s =>
    s.tenantId===context.tenantId && s.productId===productId &&
    s.name==="IRON FIT CORE Commercial" && s.sourceType===IRON_COMMERCIAL_SOURCE_TYPE &&
    s.secretRef===IRON_COMMERCIAL_SECRET_REF && s.authoritativeDomain==="commercial");
  if(sources.length!==1) throw new Error("billing.iron_legacy_source_unavailable");
  const connector = new IronCommercialConnector();
  const connection={tenantId:context.tenantId,correlationId:context.correlationId,timeoutMs:8000};
  const customers=(await connector.snapshot(connection,sources[0])).customers
    .filter(c=>c.active===true && typeof c.tenant_id==="string" && ID.test(c.tenant_id) && typeof c.name==="string")
    .map(c=>({id:c.tenant_id as string,name:c.name as string}));
  if(new Set(customers.map(c=>c.id)).size!==customers.length) throw new Error("billing.iron_legacy_ambiguous_customers");
  return {connector,connection,source:sources[0],customers};
}
function failure(error:unknown) {
  if(error instanceof AuthenticationRequiredError) return json({error:"auth.required"},401);
  if(error instanceof PermissionDeniedError || error instanceof TenantScopeRequiredError || error instanceof StepUpRequiredError) return json({error:"billing.iron_legacy_forbidden"},403);
  if(error instanceof ProductNotFoundError) return json({error:"not_found"},404);
  return json({error:"billing.iron_legacy_unavailable"},503);
}

export async function GET(request:Request,{params}:{params:Promise<{productId:string}>}) {
  try {
    const context=await resolveTenantContext(await headers());
    requirePermission(context,"billing:read");
    if(context.role!=="owner" && context.role!=="admin") return json({error:"billing.admin_required"},403);
    const {productId}=await params;
    const gymId=new URL(request.url).searchParams.get("gymId");
    if(gymId!==null && !ID.test(gymId)) return json({error:"billing.iron_legacy_input_invalid"},400);
    const a=await authority(context,productId);
    if(gymId===null) return json({customers:a.customers});
    if(!a.customers.some(c=>c.id===gymId)) return json({error:"not_found"},404);
    return json({gymId,limits:await a.connector.legacyLimits(a.connection,a.source,gymId)});
  } catch(error) {return failure(error);}
}

export async function POST(request:Request,{params}:{params:Promise<{productId:string}>}) {
  let context:Awaited<ReturnType<typeof resolveTenantContext>>|undefined;
  try {
    const h=await headers();context=await resolveTenantContext(h);
    requirePermission(context,"billing:write");
    if(context.role!=="owner" && context.role!=="admin") return json({error:"billing.admin_required"},403);
    const raw:unknown=await request.json();
    if(!raw || typeof raw!=="object" || Array.isArray(raw)) return json({error:"billing.iron_legacy_input_invalid"},400);
    const d=raw as Record<string,unknown>;
    const fields=["gymId","featureKey","configurationId","subscriptionId","planCode","planVersion","legacyLimit","planLimit","confirm","reason","password"];
    if(Object.keys(d).some(k=>!fields.includes(k)) ||
      typeof d.gymId!=="string" || !ID.test(d.gymId) ||
      typeof d.featureKey!=="string" || !FEATURE.test(d.featureKey) ||
      typeof d.configurationId!=="string" || !ID.test(d.configurationId) ||
      typeof d.subscriptionId!=="string" || !ID.test(d.subscriptionId) ||
      typeof d.planCode!=="string" || !/^[A-Z][A-Z0-9_]{1,63}$/.test(d.planCode) ||
      !integer(d.planVersion) || d.planVersion===0 || !integer(d.legacyLimit) || !integer(d.planLimit) ||
      (d.legacyLimit as number)>(d.planLimit as number) ||
      d.confirm!=="ALINHAR_AO_LIMITE_DO_PLANO" || typeof d.reason!=="string" ||
      d.reason.trim().length<10 || d.reason.length>300 || typeof d.password!=="string" || !d.password.trim())
      return json({error:"billing.iron_legacy_input_invalid"},400);
    const proof=await verifyPasswordStepUp(h,d.password);
    if(proof.userId!==context.userId) throw new StepUpRequiredError();
    const {productId}=await params;
    const a=await authority(context,productId);
    if(!a.customers.some(c=>c.id===d.gymId)) return json({error:"not_found"},404);
    const before=await a.connector.legacyLimits(a.connection,a.source,d.gymId);
    const row=before.find(item=>item.featureKey===d.featureKey);
    if(!row || row.status!=="REVIEW_REQUIRED" || row.configurationId!==d.configurationId ||
       row.subscriptionId!==d.subscriptionId || row.planCode!==d.planCode || row.planVersion!==d.planVersion ||
       row.legacyLimit!==d.legacyLimit || row.planLimit!==d.planLimit) return json({error:"billing.iron_legacy_review_stale"},409);
    await a.connector.alignLegacyLimit(a.connection,a.source,d.gymId,d.featureKey,{
      configurationId:d.configurationId,subscriptionId:d.subscriptionId,planCode:d.planCode,planVersion:d.planVersion as number,
      legacyLimit:d.legacyLimit as number,planLimit:d.planLimit as number,confirm:"ALINHAR_AO_LIMITE_DO_PLANO",reason:d.reason.trim(),
    });
    const after=await a.connector.legacyLimits(a.connection,a.source,d.gymId);
    if(after.some(item=>item.featureKey===d.featureKey)) throw new Error("billing.iron_legacy_readback_unconfirmed");
    await recordAuditEvent(context,{action:"billing.iron_legacy_limit.align",resourceType:"iron_legacy_limit",resourceId:d.configurationId,
      result:"success",metadata:{productId,gymId:d.gymId,featureKey:d.featureKey,planCode:d.planCode,planVersion:d.planVersion,
        previousLimit:d.legacyLimit,nextLimit:d.planLimit,reason:d.reason.trim()}});
    return json({ok:true,gymId:d.gymId,limits:after});
  } catch(error) {
    if(context) await recordAuditEvent(context,{action:"billing.iron_legacy_limit.align",resourceType:"iron_legacy_limit",result:"failure",
      metadata:{errorType:error instanceof Error?error.name:"unknown"}}).catch(()=>undefined);
    return failure(error);
  }
}
