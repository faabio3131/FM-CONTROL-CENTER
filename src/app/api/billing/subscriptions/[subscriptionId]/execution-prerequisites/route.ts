import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { BillingSubscriptionTraceService, SubscriptionTraceInputError, SubscriptionTraceNotFoundError } from "@/application/billing/billing-subscription-trace-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { assessLifecycleExecutionPrerequisites } from "@/domain/billing/subscription-execution-prerequisites";
import { AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresBillingSubscriptionTraceRepository } from "@/infrastructure/billing/postgres-billing-subscription-trace-repository";

export const dynamic = "force-dynamic";
const actions = ["cancel", "suspend", "reactivate", "renew", "migrate_plan", "convert_trial"] as const;
/**
 * Explicitly no client-provided evidence/policy flags.
 * Only trusted backend evidence adapters may ever fill those fields.
 */
export async function GET(request: Request, {
  params,
}: { params: Promise<{ subscriptionId: string }> }) {
  try {
    const context = await resolveTenantContext(await headers());
    const action = new URL(request.url).searchParams.get("action");
    if (!action || !actions.some(value => value === action)) {
      return NextResponse.json({ error: "billing.lifecycle_action_invalid" }, { status: 400 });
    }
    const { subscriptionId } = await params;
    const trace = await new BillingSubscriptionTraceService(
      new PostgresBillingSubscriptionTraceRepository(),
    ).get(context, subscriptionId);
    const report = assessLifecycleExecutionPrerequisites(
      trace, action as typeof actions[number], context.tenantId,
    );
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof PermissionDeniedError || error instanceof TenantScopeRequiredError)
      return NextResponse.json({ error: "billing.lifecycle_prerequisites_denied" }, { status: 403 });
    if (error instanceof SubscriptionTraceInputError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof SubscriptionTraceNotFoundError)
      return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: "billing.lifecycle_prerequisites_unavailable" }, { status: 503 });
  }
}
