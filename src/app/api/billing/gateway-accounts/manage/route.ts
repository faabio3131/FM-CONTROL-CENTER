import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { requirePermission, AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError } from "@/domain/security/tenant-context";

/**
 * This route deliberately does not accept or persist gateway secrets until an audited
 * external vault, transactional repository and certification are available.
 * Never change this to accept raw credentialRef from request JSON.
 */
export async function POST(_request: Request) {
  try {
    const context = await resolveTenantContext(await headers());
    requirePermission(context, "billing:write");
    return NextResponse.json({ error: "billing.gateway_management_unavailable" }, { status: 503 });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({error:error.message},{status:401});
    if (error instanceof TenantScopeRequiredError || error instanceof PermissionDeniedError)
      return NextResponse.json({error:error.message},{status:403});
    throw error;
  }
}
