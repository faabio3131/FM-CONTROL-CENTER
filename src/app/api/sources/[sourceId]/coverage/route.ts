import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/application/audit/record-audit-event";
import { projectCommercialCoverage } from "@/application/integration/commercial-source-coverage";
import {
  buildIronCommercialConnector,
  buildKordenaCommercialConnector,
  buildNfcoreCommercialConnector,
} from "@/application/integration/connector-composition";
import { profileForSourceType, sourceMatchesAdapter } from "@/application/integration/saas-adapter-profiles";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import {
  AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError,
  requirePermission, type TenantContext,
} from "@/domain/security/tenant-context";
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
    requirePermission(context, "commercial:read");
    // Aggregate customer counts are an owner/admin operational diagnostic.
    if (context.role !== "owner" && context.role !== "admin") {
      throw new PermissionDeniedError("commercial:read");
    }

    ({ sourceId } = await params);
    const source = await new PostgresSourceRepository().findById(context.tenantId, sourceId);
    const type = source?.sourceType;
    if (!source || source.tenantId !== context.tenantId ||
        (type !== "kordena-commercial-v1" && type !== "iron-commercial-v1" && type !== "nfcore-commercial-v1")) {
      return NextResponse.json({ error: "integration.coverage_source_not_found" },
        { status: 404, headers: responseHeaders });
    }
    const profile = profileForSourceType(type);
    if (!profile || !sourceMatchesAdapter(source, profile) || !source.productId) {
      return NextResponse.json({ error: "integration.coverage_binding_invalid" },
        { status: 403, headers: responseHeaders });
    }
    const product = await new PostgresProductRepository()
      .findById(context.tenantId, source.productId);
    if (!product || product.tenantId !== context.tenantId ||
        product.slug !== profile.productSlug || product.status !== "active") {
      return NextResponse.json({ error: "integration.coverage_product_scope_invalid" },
        { status: 403, headers: responseHeaders });
    }

    const scoped = {
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      timeoutMs: 8000,
    };
    const coverage = type === "kordena-commercial-v1"
      ? projectCommercialCoverage(type, await buildKordenaCommercialConnector().snapshot(scoped, source))
      : type === "iron-commercial-v1"
        ? projectCommercialCoverage(type, await buildIronCommercialConnector().snapshot(scoped, source))
        : projectCommercialCoverage(type, await buildNfcoreCommercialConnector().snapshot(scoped, source));

    await recordAuditEvent(context, {
      action: "integration.commercial_coverage.read",
      resourceType: "integration_source",
      resourceId: sourceId,
      result: "success",
      metadata: { sourceType: type, contractVersion: coverage.contract },
    });
    // Only fixed aggregate fields leave this endpoint. No raw SaaS snapshot.
    return NextResponse.json({ coverage }, { headers: responseHeaders });
  } catch (error) {
    if (context && sourceId) {
      await recordAuditEvent(context, {
        action: "integration.commercial_coverage.read",
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
    return NextResponse.json({ error: "integration.coverage_unavailable" },
      { status: 502, headers: responseHeaders });
  }
}
