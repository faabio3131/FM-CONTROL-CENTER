import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { buildLifecycleIntentService } from "@/application/billing/subscription-lifecycle-intent-composition";
import { LifecycleIntentDeniedError } from "@/application/billing/subscription-lifecycle-intent-service";
import { SubscriptionTraceInputError, SubscriptionTraceNotFoundError } from "@/application/billing/billing-subscription-trace-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { verifyPasswordStepUp, StepUpRequiredError } from "@/application/security/password-step-up";
import { AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError } from "@/domain/security/tenant-context";

export const dynamic = "force-dynamic";
/** Records an audit-only intent; no mutation of subscription, gateway, invoice or entitlement. */
export async function POST(
  request: Request, { params }: { params: Promise<{ subscriptionId: string }> },
) {
  try {
    const requestHeaders = await headers();
    const context = await resolveTenantContext(requestHeaders);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json({ error: "billing.lifecycle_input_invalid" }, { status: 400 });
    const data = body as Record<string, unknown>;
    if (typeof data.password !== "string" || typeof data.action !== "string" ||
        typeof data.expectedStatus !== "string" || typeof data.token !== "string")
      return NextResponse.json({ error: "billing.lifecycle_input_invalid" }, { status: 400 });
    const proof = await verifyPasswordStepUp(requestHeaders, data.password);
    if (proof.userId !== context.userId)
      return NextResponse.json({ error: "security.step_up_required" }, { status: 403 });
    const { subscriptionId } = await params;
    const result = await buildLifecycleIntentService().record(context, subscriptionId, {
      action: data.action, expectedStatus: data.expectedStatus, token: data.token,
      idempotencyKey: requestHeaders.get("x-idempotency-key") ?? "",
    });
    return NextResponse.json(result, {
      status: result.idempotentReplay ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof StepUpRequiredError || error instanceof PermissionDeniedError ||
        error instanceof TenantScopeRequiredError)
      return NextResponse.json({ error: "billing.lifecycle_intent_denied" }, { status: 403 });
    if (error instanceof SubscriptionTraceInputError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof SubscriptionTraceNotFoundError)
      return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof LifecycleIntentDeniedError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "billing.lifecycle_intent_unavailable" }, { status: 503 });
  }
}
