import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { verifyPasswordStepUp, StepUpRequiredError } from "@/application/security/password-step-up";
import { requirePermission, AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { BodyTooLargeError, readLimitedBody } from "@/infrastructure/http/read-limited-body";
import { IRON_FOUR_TIER_APPROVAL, IRON_FOUR_TIER_REVIEW_VERSION } from "@/domain/billing/iron-four-tier-offers";
import { PostgresIronPlanMappingRepository } from "@/infrastructure/billing/postgres-iron-plan-mapping-repository";
import { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import { IronCommercialConnector, environmentIronControlTenantId } from "@/infrastructure/integration/iron-commercial-connector";
import { CaktoPaymentProvider } from "@/infrastructure/subscription/cakto-payment-provider";

export const dynamic="force-dynamic";

export async function POST(request:Request,{params}:{params:Promise<{productId:string}>}){
  try{
    const requestHeaders=await headers();
    const context=await resolveTenantContext(requestHeaders);
    requirePermission(context,"billing:write");
    if((context.role!=="owner"&&context.role!=="admin")||
       context.tenantId!==environmentIronControlTenantId()||
       context.tenantId!==process.env.FMCC_IRON_BILLING_TENANT_ID)
      return NextResponse.json({error:"billing.iron_rollout_scope_denied"},{status:403});
    const {productId}=await params;
    if(productId!==process.env.FMCC_IRON_PRODUCT_ID)
      return NextResponse.json({error:"billing.iron_rollout_scope_denied"},{status:403});
    let raw:unknown;
    try{raw=JSON.parse(await readLimitedBody(request,4096));}
    catch(error){return NextResponse.json({error:"billing.iron_rollout_input_invalid"},{status:error instanceof BodyTooLargeError?413:400});}
    if(!raw||typeof raw!=="object"||Array.isArray(raw))
      return NextResponse.json({error:"billing.iron_rollout_input_invalid"},{status:400});
    const body=raw as Record<string,unknown>;
    if(Object.keys(body).length!==3||body.approval!==IRON_FOUR_TIER_APPROVAL||
       body.reviewVersion!==IRON_FOUR_TIER_REVIEW_VERSION||typeof body.password!=="string"||!body.password.trim())
      return NextResponse.json({error:"billing.iron_rollout_approval_required"},{status:400});
    const proof=await verifyPasswordStepUp(requestHeaders,body.password);
    if(proof.userId!==context.userId)
      return NextResponse.json({error:"security.step_up_required"},{status:403});
    const sources=(await new PostgresSourceRepository().list(context.tenantId)).filter(s=>
      s.productId===productId&&s.sourceType==="iron-commercial-v1"&&s.name==="IRON FIT CORE Commercial"&&s.authoritativeDomain==="commercial");
    if(sources.length!==1)
      return NextResponse.json({error:"billing.iron_rollout_source_ambiguous"},{status:409});
    const source=sources[0];
    const cakto=new CaktoPaymentProvider();
    const outcome=await new PostgresIronPlanMappingRepository().publishFourTiers(context,productId,source.id,
      async()=>{
        const catalog=await new IronCommercialConnector().publishedPlanVersions({
          tenantId:context.tenantId,correlationId:context.correlationId,timeoutMs:8000,
        },source);
        const asOf=Date.parse(catalog.asOf);
        if(catalog.truncated||!Number.isFinite(asOf)||asOf<Date.now()-300_000||asOf>Date.now()+30_000)
          throw new Error("billing.iron_rollout_catalog_unverifiable");
        return catalog.plans;
      },(amount,interval,code)=>cakto.hasExactlyOneOffer(amount,interval,code));
    return NextResponse.json(outcome,{headers:{"cache-control":"no-store"}});
  }catch(error){
    if(error instanceof AuthenticationRequiredError)
      return NextResponse.json({error:"security.authentication_required"},{status:401});
    if(error instanceof PermissionDeniedError||error instanceof TenantScopeRequiredError||error instanceof StepUpRequiredError)
      return NextResponse.json({error:"security.step_up_required"},{status:403});
    // Never echo credentials, provider payload, or SQL diagnostics.
    const code=error instanceof Error?error.message:"";
    const allowed=["billing.iron_rollout_gateway_not_ready","billing.iron_rollout_version_not_published",
      "billing.iron_rollout_cakto_offer_missing","billing.iron_rollout_immutable_price_conflict",
      "billing.iron_rollout_catalog_unverifiable","billing.iron_plan_mapping_immutable",
      "billing.iron_mapping_requires_inactive_draft"];
    return NextResponse.json({error:allowed.includes(code)?code:"billing.iron_rollout_unavailable"},{status:409});
  }
}
