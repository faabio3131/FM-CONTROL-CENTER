import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { listProviderDescriptors } from "@/domain/billing-central/provider-registry";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { requirePermission, AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError } from "@/domain/security/tenant-context";

export async function GET() {
  try {
    const context = await resolveTenantContext(await headers());
    requirePermission(context, "billing:read");
    // This is only a read-only catalog; no gateway is yet enabled for live collections.
    return NextResponse.json({ providers:listProviderDescriptors(), livePaymentsEnabled:false });
  } catch(error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error:error.message },{status:401});
    if (error instanceof TenantScopeRequiredError || error instanceof PermissionDeniedError) {
      return NextResponse.json({ error:error.message },{status:403});
    }
    throw error;
  }
}
