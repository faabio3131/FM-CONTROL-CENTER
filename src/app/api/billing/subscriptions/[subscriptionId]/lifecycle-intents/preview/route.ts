import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { buildLifecycleIntentService } from "@/application/billing/subscription-lifecycle-intent-composition";
import { LifecycleIntentDeniedError } from "@/application/billing/subscription-lifecycle-intent-service";
import { SubscriptionTraceInputError, SubscriptionTraceNotFoundError } from "@/application/billing/billing-subscription-trace-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError } from "@/domain/security/tenant-context";

export const dynamic = "force-dynamic";
/** Prepares a short-lived token tied to the actor and snapshot; no financial execution. */
export async function POST(
  request: Request, { params }: { params: Promise<{ subscriptionId: string }> },
) {
  try {
    const context = await resolveTenantContext(await headers());
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json({ error: "billing.lifecycle_input_invalid" }, { status: 400 });
    const data = body as Record<string, unknown>;
    if (typeof data.action !== "string" || typeof data.expectedStatus !== "string")
      return NextResponse.json({ error: "billing.lifecycle_input_invalid" }, { status: 400 });
    const { subscriptionId } = await params;
    const prepared = await buildLifecycleIntentService().issue(
      context, subscriptionId, data.action, data.expectedStatus,
    );
    return NextResponse.json(prepared, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof PermissionDeniedError || error instanceof TenantScopeRequiredError)
      return NextResponse.json({ error: "billing.lifecycle_preview_denied" }, { status: 403 });
    if (error instanceof SubscriptionTraceInputError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof SubscriptionTraceNotFoundError)
      return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof LifecycleIntentDeniedError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "billing.lifecycle_preview_unavailable" }, { status: 503 });
  }
}
