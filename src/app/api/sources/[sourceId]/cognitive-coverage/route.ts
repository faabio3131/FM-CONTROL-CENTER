import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/application/audit/record-audit-event";
import { buildNfcoreCognitiveConnector } from "@/application/integration/connector-composition";
import { projectNfcoreCognitiveCoverage } from "@/application/integration/nfcore-cognitive-coverage";
import { profileForSourceType, sourceMatchesAdapter } from "@/application/integration/saas-adapter-profiles";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import {
  AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError,
  requirePermission, type TenantContext,
} from "@/domain/security/tenant-context";
import { NFCORE_COGNITIVE_SOURCE_TYPE } from "@/infrastructure/integration/nfcore-cognitive-connector";
import { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";

export const dynamic = "force-dynamic";
const responseHeaders = { "cache-control": "no-store, max-age=0" };

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
    if (!source || source.tenantId !== context.tenantId ||
        source.sourceType !== NFCORE_COGNITIVE_SOURCE_TYPE) {
      return NextResponse.json({ error: "integration.nfcore_coverage_source_not_found" },
        { status: 404, headers: responseHeaders });
    }
    const profile = profileForSourceType(source.sourceType);
    if (!profile || !sourceMatchesAdapter(source, profile) || !source.productId) {
      return NextResponse.json({ error: "integration.nfcore_coverage_binding_invalid" },
        { status: 403, headers: responseHeaders });
    }
    const product = await new PostgresProductRepository()
      .findById(context.tenantId, source.productId);
    if (!product || product.tenantId !== context.tenantId ||
        product.slug !== "nfcore" || product.slug !== profile.productSlug ||
        product.status !== "active") {
      return NextResponse.json({ error: "integration.nfcore_coverage_product_invalid" },
        { status: 403, headers: responseHeaders });
    }

    // Reuse the existing, validated S2S connector. No raw NFCore response leaves this route.
    const result = await buildNfcoreCognitiveConnector().pull({
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      timeoutMs: 8000,
    }, source);
    const coverage = projectNfcoreCognitiveCoverage(result);
    await recordAuditEvent(context, {
      action: "integration.nfcore_cognitive_coverage.read",
      resourceType: "integration_source",
      resourceId: sourceId,
      result: "success",
      metadata: { contractVersion: coverage.contract, sourceType: source.sourceType },
    });
    return NextResponse.json({ coverage }, { headers: responseHeaders });
  } catch (error) {
    if (context && sourceId) {
      await recordAuditEvent(context, {
        action: "integration.nfcore_cognitive_coverage.read",
        resourceType: "integration_source",
        resourceId: sourceId,
        result: "failure",
        metadata: { errorType: error instanceof Error ? error.name : "UnknownError" },
      }).catch(() => undefined);
    }
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401, headers: responseHeaders });
    }
    if (error instanceof TenantScopeRequiredError || error instanceof PermissionDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403, headers: responseHeaders });
    }
    return NextResponse.json({ error: "integration.nfcore_cognitive_coverage_unavailable" },
      { status: 502, headers: responseHeaders });
  }
}
