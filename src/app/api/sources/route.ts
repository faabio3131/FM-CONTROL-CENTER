import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ConfigSecretForbiddenError, InvalidProductScopeError, InvalidSecretReferenceError, SourceRegistryService } from "@/application/integration/source-registry-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import type { SourceDefinition } from "@/domain/integration/contracts";
import { AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";

function publicSource(source: SourceDefinition) {
  const { secretRef: _secretRef, ...safe } = source;
  return { ...safe, hasSecretReference: Boolean(source.secretRef) };
}
function securityResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: error.message }, { status: 401 });
  if (error instanceof TenantScopeRequiredError || error instanceof PermissionDeniedError) return NextResponse.json({ error: error.message }, { status: 403 });
  return null;
}
function service() {
  return new SourceRegistryService(new PostgresSourceRepository(), new PostgresProductRepository());
}

export async function GET() {
  try {
    const context = await resolveTenantContext(await headers());
    const sources = await service().list(context);
    return NextResponse.json(sources.map(publicSource));
  } catch (error) {
    const response = securityResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const context = await resolveTenantContext(await headers());
    const body = await request.json() as {
      productId?: unknown; name?: unknown; sourceType?: unknown; authoritativeDomain?: unknown; syncMode?: unknown;
      secretRef?: unknown; mappingVersion?: unknown; freshnessSeconds?: unknown; config?: unknown;
    };
    if (typeof body.name !== "string" || typeof body.sourceType !== "string" || typeof body.authoritativeDomain !== "string") {
      return NextResponse.json({ error: "integration.source_definition_invalid" }, { status: 400 });
    }
    if (body.syncMode !== "pull" && body.syncMode !== "webhook" && body.syncMode !== "hybrid") {
      return NextResponse.json({ error: "integration.sync_mode_invalid" }, { status: 400 });
    }
    const source = await service().register(context, {
      productId: typeof body.productId === "string" ? body.productId : undefined,
      name: body.name, sourceType: body.sourceType, authoritativeDomain: body.authoritativeDomain, syncMode: body.syncMode,
      secretRef: typeof body.secretRef === "string" ? body.secretRef : undefined,
      mappingVersion: typeof body.mappingVersion === "string" ? body.mappingVersion : undefined,
      freshnessSeconds: typeof body.freshnessSeconds === "number" ? body.freshnessSeconds : undefined,
      config: body.config && typeof body.config === "object" && !Array.isArray(body.config) ? body.config as Record<string, unknown> : undefined,
    });
    return NextResponse.json(publicSource(source), { status: 201 });
  } catch (error) {
    const response = securityResponse(error);
    if (response) return response;
    if (error instanceof InvalidSecretReferenceError || error instanceof ConfigSecretForbiddenError || error instanceof InvalidProductScopeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
