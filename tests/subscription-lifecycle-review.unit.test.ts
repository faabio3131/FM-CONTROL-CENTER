import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SubscriptionLifecycleReviewService, type LifecycleReviewRepository,
  type LifecycleReviewItem,
} from "../src/application/billing/subscription-lifecycle-review-service";
import type { TenantContext } from "../src/domain/security/tenant-context";

const ctx: TenantContext = { tenantId: "fm-tenant", userId: "finance-admin",
  role: "admin", correlationId: "ci" };
const row: LifecycleReviewItem = {
  intentId: "11111111-1111-4111-8111-111111111111",
  subscriptionId: "22222222-2222-4222-8222-222222222222",
  productId: "product", action: "cancel", requestedBy: "requester",
  requestedAt: new Date("2026-10-20T14:00:00Z"), state: "awaiting_policy",
};
function fixture(rows: LifecycleReviewItem[]) {
  const repo: LifecycleReviewRepository = {
    list: vi.fn(async () => rows),
    reject: vi.fn(async () => ({ decisionId: "decision", state: "review_rejected" as const,
      idempotentReplay: false, executionAuthorized: false as const })),
  };
  return { repo, svc: new SubscriptionLifecycleReviewService(repo) };
}
describe("FMCC C06 lifecycle review queue and denial", () => {
  it("returns bounded tenant scoped records with source authority", async () => {
    const { svc, repo } = fixture([row]);
    const result = await svc.list(ctx);
    expect(repo.list).toHaveBeenCalledWith("fm-tenant", 51);
    expect(result.items).toEqual([row]);
    expect(result.sourceAuthority).toBe("fmcc_audit_event_lifecycle_intent");
    expect(result.stateIsFinancialAuthorization).toBe(false);
  });
  it("does not represent a bounded result as a full queue", async () => {
    const x = await fixture(Array(51).fill(row)).svc.list(ctx);
    expect(x.items).toHaveLength(50); expect(x.truncated).toBe(true);
  });
  it("blocks readonly roles and missing tenant before repository", async () => {
    const { svc, repo } = fixture([row]);
    await expect(svc.list({ ...ctx, role: "viewer" }))
      .rejects.toThrow("security.permission_denied:billing:write");
    await expect(svc.list({ ...ctx, tenantId: "" }))
      .rejects.toThrow("billing.lifecycle_reviewer_denied");
    await expect(svc.reject({ ...ctx, role: "analyst" }, row.intentId,
      "duplicate_request", "review-key-001")).rejects.toThrow();
    expect(repo.list).not.toHaveBeenCalled(); expect(repo.reject).not.toHaveBeenCalled();
  });
  it("accepts a reviewed refusal, but never provides financial approval", async () => {
    const { svc, repo } = fixture([row]);
    const result = await svc.reject(ctx, row.intentId, "insufficient_evidence", "review-key-001");
    expect(result.executionAuthorized).toBe(false);
    expect(result.state).toBe("review_rejected");
    expect(repo.reject).toHaveBeenCalledTimes(1);
    await expect(svc.reject(ctx, row.intentId, "user_supplied_sql", "review-key-002"))
      .rejects.toThrow("billing.lifecycle_review_input_invalid");
    await expect(svc.reject(ctx, "../other", "duplicate_request", "review-key-003"))
      .rejects.toThrow("billing.lifecycle_review_input_invalid");
  });
  it("preserves tenant-fenced audit SQL, step-up and no financial mutations", () => {
    const source = (path: string) => readFileSync(resolve(path), "utf8");
    const pg = source("src/infrastructure/billing/postgres-subscription-lifecycle-review-repository.ts");
    const api = source("src/app/api/billing/lifecycle-reviews/[intentId]/reject/route.ts");
    const ui = source("src/app/dashboard/billing/lifecycle-reviews/page.tsx");
    expect(pg).toContain("pg_advisory_xact_lock");
    expect(pg).toContain("WHERE tenant_id=$1 AND actor_id=$2");
    expect(pg).toContain("WHERE decisions.tenant_id=requests.tenant_id");
    expect(pg).toContain("billing.lifecycle.intent_review_rejected");
    expect(pg).not.toContain("UPDATE fmcc_billing_subscription");
    expect(pg).not.toContain("fmcc_billing_iron_entitlement_outbox");
    expect(api).toContain("requireLifecycleReviewer(context)");
    expect(api).toContain("verifyPasswordStepUp");
    expect(api).toContain('"Cache-Control": "no-store"');
    expect(ui).toContain("Esta lista não aprova nem executa");
  });
});
