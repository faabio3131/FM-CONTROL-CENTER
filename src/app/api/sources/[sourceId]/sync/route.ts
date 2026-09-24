import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { buildConnectorRuntime } from "@/application/integration/connector-composition";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import {
  AuthenticationRequiredError,
  CrossTenantAccessError,
  PermissionDeniedError,
  TenantScopeRequiredError,
} from "@/domain/security/tenant-context";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  try {
    const requestHeaders = await headers();
    const context = await resolveTenantContext(requestHeaders);
    const { sourceId } = await params;
    const idempotencyKey =
      requestHeaders.get("idempotency-key")?.trim() ?? "";
    if (!idempotencyKey || idempotencyKey.length > 192) {
      return NextResponse.json(
        { error: "integration.idempotency_key_invalid" },
        { status: 400 },
      );
    }
    const body = (await request.json().catch(() => ({}))) as {
      cursor?: unknown;
    };
    const result = await buildConnectorRuntime().syncPull(context, {
      sourceId,
      idempotencyKey,
      cursor: typeof body.cursor === "string" ? body.cursor : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (
      error instanceof TenantScopeRequiredError ||
      error instanceof PermissionDeniedError ||
      error instanceof CrossTenantAccessError
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "integration.sync_failed" },
      { status: 502 },
    );
  }
}
