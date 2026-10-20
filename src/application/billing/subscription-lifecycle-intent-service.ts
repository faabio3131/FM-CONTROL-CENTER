import { createHash, randomBytes } from "node:crypto";
import { BillingSubscriptionTraceService, type SubscriptionFinancialTrace } from "@/application/billing/billing-subscription-trace-service";
import { previewSubscriptionLifecycle, type LifecycleAction } from "@/domain/billing/subscription-lifecycle-policy";
import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";

const ACTIONS: readonly string[] = ["cancel", "suspend", "reactivate", "renew", "migrate_plan", "convert_trial"];
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const TTL_MS = 5 * 60 * 1000;
export class LifecycleIntentDeniedError extends Error {
  constructor(code = "billing.lifecycle_intent_denied") { super(code); }
}
export interface LifecycleIntentEnvelope {
  readonly subscriptionId: string;
  readonly productId: string;
  readonly customerId: string;
  readonly recordedStatus: string;
  readonly action: LifecycleAction;
  readonly fingerprint: string;
}
export interface LifecycleIntentIssued {
  readonly token: string;
  readonly expiresAt: string;
}
export interface LifecycleIntentRecorded {
  readonly intentId: string;
  readonly state: "awaiting_policy";
  readonly idempotentReplay: boolean;
  readonly executionAuthorized: false;
}
export interface LifecycleIntentStore {
  issue(context: TenantContext, envelope: LifecycleIntentEnvelope, tokenHash: string, expiresAt: string): Promise<void>;
  record(context: TenantContext, envelope: LifecycleIntentEnvelope, tokenHash: string, idempotencyKey: string): Promise<LifecycleIntentRecorded>;
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function requireOperator(context: TenantContext): void {
  requirePermission(context, "billing:write");
  if (!context.tenantId.trim() || !context.userId.trim() ||
      (context.role !== "owner" && context.role !== "admin")) {
    throw new LifecycleIntentDeniedError("billing.lifecycle_scope_denied");
  }
}
function fingerprint(context: TenantContext, trace: SubscriptionFinancialTrace, action: LifecycleAction): string {
  return digest(JSON.stringify({
    version: "fmcc.c06.lifecycle-intent.v1", tenantId: context.tenantId, actorId: context.userId,
    subscriptionId: trace.subscription.subscriptionId, productId: trace.subscription.productId,
    customerId: trace.subscription.customerId, planCode: trace.subscription.planCode,
    recordedStatus: trace.subscription.status, action,
    invoices: trace.invoices.map(invoice => ({
      id: invoice.invoiceId, status: invoice.invoiceStatus,
      payment: invoice.recordedPaymentStatus,
      paidAt: invoice.paymentRecordedAt?.toISOString() ?? null,
    })),
  }));
}

/** Records governed intent only; never executes a financial/entitlement transition. */
export class SubscriptionLifecycleIntentService {
  constructor(private readonly traces: BillingSubscriptionTraceService,
              private readonly store: LifecycleIntentStore) {}

  private async envelope(context: TenantContext, subscriptionId: string, action: string,
                         expectedStatus: string): Promise<LifecycleIntentEnvelope> {
    requireOperator(context);
    if (!ACTIONS.includes(action) ||
        !["pending", "active", "past_due", "cancelled"].includes(expectedStatus)) {
      throw new LifecycleIntentDeniedError("billing.lifecycle_input_invalid");
    }
    const trace = await this.traces.get(context, subscriptionId);
    if (trace.subscription.status !== expectedStatus || trace.truncated) {
      throw new LifecycleIntentDeniedError("billing.lifecycle_snapshot_changed_or_incomplete");
    }
    const policy = previewSubscriptionLifecycle(trace);
    if (policy.options.find(item => item.action === action)?.status !== "candidate_for_review") {
      throw new LifecycleIntentDeniedError("billing.lifecycle_action_not_applicable");
    }
    return {
      subscriptionId: trace.subscription.subscriptionId,
      productId: trace.subscription.productId,
      customerId: trace.subscription.customerId,
      recordedStatus: trace.subscription.status,
      action: action as LifecycleAction,
      fingerprint: fingerprint(context, trace, action as LifecycleAction),
    };
  }

  /** Five-minute, actor-bound proof for registration, not financial authorization. */
  async issue(context: TenantContext, subscriptionId: string, action: string,
              expectedStatus: string): Promise<LifecycleIntentIssued> {
    const envelope = await this.envelope(context, subscriptionId, action, expectedStatus);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
    await this.store.issue(context, envelope, digest(token), expiresAt);
    return { token, expiresAt };
  }

  async record(context: TenantContext, subscriptionId: string, input: {
    action: string; expectedStatus: string; token: string; idempotencyKey: string;
  }): Promise<LifecycleIntentRecorded> {
    requireOperator(context);
    if (!IDEMPOTENCY.test(input.idempotencyKey) ||
        !/^[A-Za-z0-9_-]{40,64}$/.test(input.token)) {
      throw new LifecycleIntentDeniedError("billing.lifecycle_input_invalid");
    }
    const envelope = await this.envelope(context, subscriptionId, input.action, input.expectedStatus);
    return this.store.record(context, envelope, digest(input.token), input.idempotencyKey);
  }
}
