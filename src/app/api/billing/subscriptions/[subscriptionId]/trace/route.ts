import { headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  BillingSubscriptionTraceService, SubscriptionTraceInputError, SubscriptionTraceNotFoundError,
} from "@/application/billing/billing-subscription-trace-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import {
  AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError,
} from "@/domain/security/tenant-context";
import {
  PostgresBillingSubscriptionTraceRepository,
} from "@/infrastructure/billing/postgres-billing-subscription-trace-repository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request, { params }: { params: Promise<{ subscriptionId: string }> },
) {
  try {
    const context = await resolveTenantContext(await headers());
    const { subscriptionId } = await params;
    const data = await new BillingSubscriptionTraceService(
      new PostgresBillingSubscriptionTraceRepository(),
    ).get(context, subscriptionId);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof PermissionDeniedError || error instanceof TenantScopeRequiredError) {
      return NextResponse.json({ error: "billing.subscription_trace_denied" }, { status: 403 });
    }
    if (error instanceof SubscriptionTraceInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SubscriptionTraceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "billing.subscription_trace_unavailable" }, { status: 503 });
  }
}
