import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import {
  AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError,
} from "@/domain/security/tenant-context";
import { listGatewayAccountsForTenant } from "@/infrastructure/billing/postgres-gateway-account-repository";

/** Read-only. POST/PATCH remain unavailable until the vault and adapter approval gates. */
export async function GET() {
  try {
    const context = await resolveTenantContext(await headers());
    return NextResponse.json({ accounts: await listGatewayAccountsForTenant(context) });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof TenantScopeRequiredError || error instanceof PermissionDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
