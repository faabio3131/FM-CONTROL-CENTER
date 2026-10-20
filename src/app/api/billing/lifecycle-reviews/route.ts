import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { SubscriptionLifecycleReviewService, LifecycleReviewDeniedError } from "@/application/billing/subscription-lifecycle-review-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresSubscriptionLifecycleReviewRepository } from "@/infrastructure/billing/postgres-subscription-lifecycle-review-repository";

export const dynamic = "force-dynamic";
/** Read-only bounded tenant-scoped audit review queue, never an executable job queue. */
export async function GET() {
  try {
    const context = await resolveTenantContext(await headers());
    const data = await new SubscriptionLifecycleReviewService(
      new PostgresSubscriptionLifecycleReviewRepository(),
    ).list(context);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof PermissionDeniedError || error instanceof TenantScopeRequiredError ||
        error instanceof LifecycleReviewDeniedError)
      return NextResponse.json({ error: "billing.lifecycle_review_denied" }, { status: 403 });
    return NextResponse.json({ error: "billing.lifecycle_review_unavailable" }, { status: 503 });
  }
}
