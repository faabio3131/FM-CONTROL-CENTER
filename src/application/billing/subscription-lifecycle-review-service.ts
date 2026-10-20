import { createHash } from "node:crypto";
import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
export const LIFECYCLE_REJECTION_REASONS = [
  "insufficient_evidence", "policy_unavailable", "duplicate_request", "operator_declined",
] as const;
export type LifecycleRejectionReason = typeof LIFECYCLE_REJECTION_REASONS[number];

export class LifecycleReviewDeniedError extends Error {
  constructor(code = "billing.lifecycle_review_denied") { super(code); }
}
export class LifecycleReviewNotFoundError extends Error {
  constructor() { super("billing.lifecycle_intent_not_found"); }
}
export interface LifecycleReviewItem {
  readonly intentId: string;
  readonly subscriptionId: string;
  readonly productId: string;
  readonly action: string;
  readonly requestedBy: string;
  readonly requestedAt: Date;
  readonly state: "awaiting_policy" | "review_rejected";
}
export interface LifecycleReviewRegister {
  readonly sourceAuthority: "fmcc_audit_event_lifecycle_intent";
  readonly stateIsFinancialAuthorization: false;
  readonly limit: 50;
  readonly truncated: boolean;
  readonly items: readonly LifecycleReviewItem[];
}
export interface LifecycleReviewRejected {
  readonly decisionId: string;
  readonly state: "review_rejected";
  readonly idempotentReplay: boolean;
  readonly executionAuthorized: false;
}
export interface LifecycleReviewRepository {
  list(tenantId: string, limit: number): Promise<readonly LifecycleReviewItem[]>;
  reject(context: TenantContext, intentId: string, reason: LifecycleRejectionReason,
         idempotencyHash: string): Promise<LifecycleReviewRejected>;
}
export function requireLifecycleReviewer(context: TenantContext): void {
  requirePermission(context, "billing:write");
  if (!context.tenantId.trim() || !context.userId.trim() ||
      (context.role !== "owner" && context.role !== "admin")) {
    throw new LifecycleReviewDeniedError("billing.lifecycle_reviewer_denied");
  }
}
export class SubscriptionLifecycleReviewService {
  constructor(private readonly repository: LifecycleReviewRepository) {}

  async list(context: TenantContext): Promise<LifecycleReviewRegister> {
    requireLifecycleReviewer(context);
    const rows = await this.repository.list(context.tenantId, 51);
    return {
      sourceAuthority: "fmcc_audit_event_lifecycle_intent",
      stateIsFinancialAuthorization: false, limit: 50,
      items: rows.slice(0, 50), truncated: rows.length > 50,
    };
  }

  /** An administrative denial, NEVER an approval or entitlement command. */
  async reject(context: TenantContext, intentId: string,
               reason: string, idempotencyKey: string): Promise<LifecycleReviewRejected> {
    requireLifecycleReviewer(context);
    if (!UUID.test(intentId) ||
        !LIFECYCLE_REJECTION_REASONS.includes(reason as LifecycleRejectionReason) ||
        !KEY.test(idempotencyKey)) {
      throw new LifecycleReviewDeniedError("billing.lifecycle_review_input_invalid");
    }
    const idempotencyHash = createHash("sha256").update(
      JSON.stringify([context.tenantId, context.userId, idempotencyKey]),
    ).digest("hex");
    return this.repository.reject(context, intentId, reason as LifecycleRejectionReason, idempotencyHash);
  }
}
