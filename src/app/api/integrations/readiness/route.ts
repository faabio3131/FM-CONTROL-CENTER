import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { C08ReadinessService } from "@/application/integration/c08-readiness-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresSourceRepository, PostgresSyncRepository } from "@/infrastructure/integration/postgres-repositories";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";

export const dynamic = "force-dynamic";

/** No client-supplied tenant/source IDs. No source credentials or URLs in response. */
export async function GET() {
  try {
    const context = await resolveTenantContext(await headers());
    const data = await new C08ReadinessService(
      new PostgresProductRepository(),
      new PostgresSourceRepository(),
      new PostgresSyncRepository(),
    ).snapshot(context);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "security.authentication_required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof PermissionDeniedError || error instanceof TenantScopeRequiredError) {
      return NextResponse.json({ error: "integration.c08_read_denied" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    // Inability to read the registry/sync data is NOT an empty integration list.
    return NextResponse.json({ error: "integration.c08_readiness_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
