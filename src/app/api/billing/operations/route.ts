import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { BillingQueueInspectionService } from "@/application/billing/billing-queue-inspection-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import {
  AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError,
} from "@/domain/security/tenant-context";
import {
  PostgresBillingQueueInspectionRepository,
} from "@/infrastructure/billing/postgres-billing-queue-inspection-repository";

export const dynamic = "force-dynamic";

/** No mutation, no queue claim, no SaaS or provider requests. */
export async function GET() {
  try {
    const context = await resolveTenantContext(await headers());
    const overview = await new BillingQueueInspectionService(
      new PostgresBillingQueueInspectionRepository(),
    ).overview(context);
    return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof PermissionDeniedError || error instanceof TenantScopeRequiredError)
      return NextResponse.json({ error: "billing.operations_access_denied" }, { status: 403 });
    return NextResponse.json({ error: "billing.operations_unavailable" }, { status: 503 });
  }
}
