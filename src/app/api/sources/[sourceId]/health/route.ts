import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { buildConnectorRuntime } from "@/application/integration/connector-composition";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import {
  AuthenticationRequiredError,
  PermissionDeniedError,
  TenantScopeRequiredError,
} from "@/domain/security/tenant-context";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  try {
    const context = await resolveTenantContext(await headers());
    const { sourceId } = await params;
    const status = await buildConnectorRuntime().health(context, sourceId);
    return NextResponse.json({ status });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (
      error instanceof TenantScopeRequiredError ||
      error instanceof PermissionDeniedError
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "integration.health_failed" },
      { status: 502 },
    );
  }
}
