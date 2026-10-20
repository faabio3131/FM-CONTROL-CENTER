import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { SubscriptionLifecycleReviewService, requireLifecycleReviewer, LifecycleReviewDeniedError, LifecycleReviewNotFoundError } from "@/application/billing/subscription-lifecycle-review-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { verifyPasswordStepUp, StepUpRequiredError } from "@/application/security/password-step-up";
import { AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresSubscriptionLifecycleReviewRepository } from "@/infrastructure/billing/postgres-subscription-lifecycle-review-repository";

export const dynamic = "force-dynamic";
/** Administrative rejection only; no approval action and no billing side effects. */
export async function POST(request: Request, {
  params,
}: { params: Promise<{ intentId: string }> }) {
  try {
    const requestHeaders = await headers();
    const context = await resolveTenantContext(requestHeaders);
    requireLifecycleReviewer(context);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "billing.lifecycle_review_input_invalid" }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    if (typeof input.password !== "string" || typeof input.reason !== "string") {
      return NextResponse.json({ error: "billing.lifecycle_review_input_invalid" }, { status: 400 });
    }
    const proof = await verifyPasswordStepUp(requestHeaders, input.password);
    if (proof.userId !== context.userId) {
      return NextResponse.json({ error: "security.step_up_required" }, { status: 403 });
    }
    const { intentId } = await params;
    const result = await new SubscriptionLifecycleReviewService(
      new PostgresSubscriptionLifecycleReviewRepository(),
    ).reject(context, intentId, input.reason, requestHeaders.get("x-idempotency-key") ?? "");
    return NextResponse.json(result, {
      status: result.idempotentReplay ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof StepUpRequiredError || error instanceof PermissionDeniedError ||
        error instanceof TenantScopeRequiredError)
      return NextResponse.json({ error: "billing.lifecycle_review_denied" }, { status: 403 });
    if (error instanceof LifecycleReviewNotFoundError)
      return NextResponse.json({ error: "billing.lifecycle_intent_not_found" }, { status: 404 });
    if (error instanceof LifecycleReviewDeniedError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "billing.lifecycle_review_unavailable" }, { status: 503 });
  }
}
