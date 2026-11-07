import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/application/audit/record-audit-event";
import { buildIronUsageConnector, buildNfcoreOperationalUsageConnector } from "@/application/integration/connector-composition";
import { projectOperationalUsageCoverage } from "@/application/integration/operational-usage-coverage";
import { profileForSourceType, sourceMatchesAdapter } from "@/application/integration/saas-adapter-profiles";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import {
  AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError,
  requirePermission, type TenantContext,
} from "@/domain/security/tenant-context";
import { IRON_USAGE_SOURCE_TYPE } from "@/infrastructure/integration/iron-usage-connector";
import { NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE } from "@/infrastructure/integration/nfcore-operational-usage-connector";
import { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store, max-age=0" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  let context: TenantContext | null = null;
  let sourceId: string | null = null;
  try {
    context = await resolveTenantContext(await headers());
    requirePermission(context, "source:read");
    requirePermission(context, "integration:read");
    requirePermission(context, "metric:read");
    if (context.role !== "owner" && context.role !== "admin") {
      throw new PermissionDeniedError("metric:read");
    }
    ({ sourceId } = await params);
    const source = await new PostgresSourceRepository().findById(context.tenantId, sourceId);
    const type = source?.sourceType;
    if (!source || source.tenantId !== context.tenantId ||
        (type !== IRON_USAGE_SOURCE_TYPE && type !== NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE)) {
      return NextResponse.json({error:"operational_usage.source_not_found"},
        {status:404,headers:noStore});
    }
    const profile = profileForSourceType(type);
    if (!profile || !sourceMatchesAdapter(source, profile) || !source.productId ||
        profile.authoritativeDomain !== "operational-usage") {
      return NextResponse.json({error:"operational_usage.binding_invalid"},
        {status:403,headers:noStore});
    }
    const product = await new PostgresProductRepository().findById(context.tenantId, source.productId);
    if (!product || product.tenantId !== context.tenantId ||
        product.status !== "active" || product.slug !== profile.productSlug) {
      return NextResponse.json({error:"operational_usage.product_invalid"},
        {status:403,headers:noStore});
    }
    const scoped = { tenantId:context.tenantId, correlationId:context.correlationId, timeoutMs:8000 };
    const coverage = type === IRON_USAGE_SOURCE_TYPE
      ? projectOperationalUsageCoverage(type, await buildIronUsageConnector().snapshot(scoped, source))
      : projectOperationalUsageCoverage(
          NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE,
          await buildNfcoreOperationalUsageConnector().snapshot(scoped, source),
        );
    await recordAuditEvent(context, {
      action:"integration.operational_usage.read",
      resourceType:"integration_source",resourceId:sourceId,result:"success",
      metadata:{sourceType:type,contractVersion:coverage.contract},
    });
    return NextResponse.json({coverage},{headers:noStore});
  } catch (error) {
    if (context && sourceId) {
      await recordAuditEvent(context,{
        action:"integration.operational_usage.read",resourceType:"integration_source",
        resourceId:sourceId,result:"failure",
        metadata:{errorType:error instanceof Error ? error.name:"UnknownError"},
      }).catch(() => undefined);
    }
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({error:error.message},{status:401,headers:noStore});
    }
    if (error instanceof TenantScopeRequiredError || error instanceof PermissionDeniedError) {
      return NextResponse.json({error:error.message},{status:403,headers:noStore});
    }
    return NextResponse.json({error:"operational_usage.unavailable"},{status:502,headers:noStore});
  }
}
