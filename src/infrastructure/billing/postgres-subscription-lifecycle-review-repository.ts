import type { Pool } from "pg";
import type { TenantContext } from "@/domain/security/tenant-context";
import {
  LifecycleReviewDeniedError, LifecycleReviewNotFoundError,
  type LifecycleReviewItem, type LifecycleRejectionReason,
  type LifecycleReviewRejected, type LifecycleReviewRepository,
} from "@/application/billing/subscription-lifecycle-review-service";
import { pool } from "@/infrastructure/db/client";

type StoredRequestRow = {
  id: string; resource_id: string | null; actor_id: string; occurred_at: Date;
  metadata: Record<string, unknown>;
};
const property = (object: Record<string, unknown>, key: string): string | null =>
  typeof object[key] === "string" ? object[key] as string : null;

/**
 * Append-only decision over an existing audit intent, never a financial executor.
 * SQL queries are tenant-scoped, bounded and parameterized.
 */
export class PostgresSubscriptionLifecycleReviewRepository implements LifecycleReviewRepository {
  constructor(private readonly database: Pick<Pool, "connect"> = pool) {}

  async list(tenantId: string, limit: number): Promise<readonly LifecycleReviewItem[]> {
    if (!tenantId.trim() || !Number.isSafeInteger(limit) || limit < 1 || limit > 51) {
      throw new LifecycleReviewDeniedError("billing.lifecycle_review_query_invalid");
    }
    const client = await this.database.connect();
    try {
      const result = await client.query<StoredRequestRow & { rejected: boolean }>(
        "SELECT requests.id, requests.resource_id, requests.actor_id, requests.occurred_at, requests.metadata, " +
        "EXISTS (SELECT 1 FROM fmcc_audit_event decisions " +
        "WHERE decisions.tenant_id=requests.tenant_id " +
        "AND decisions.action='billing.lifecycle.intent_review_rejected' " +
        "AND decisions.resource_id=requests.id::text) AS rejected " +
        "FROM fmcc_audit_event requests WHERE requests.tenant_id=$1 " +
        "AND requests.action='billing.lifecycle.intent_recorded' " +
        "AND requests.result='success' " +
        "ORDER BY requests.occurred_at DESC, requests.id DESC LIMIT $2",
        [tenantId, limit],
      );
      // Never return internal approval hashes, tokens or raw audit metadata.
      return result.rows.map(row => ({
        intentId: row.id, subscriptionId: row.resource_id ?? "",
        productId: property(row.metadata, "productId") ?? "",
        action: property(row.metadata, "action") ?? "unknown",
        requestedBy: row.actor_id, requestedAt: row.occurred_at,
        state: row.rejected ? "review_rejected" as const : "awaiting_policy" as const,
      }));
    } finally { client.release(); }
  }

  async reject(context: TenantContext, intentId: string,
               reason: LifecycleRejectionReason, idempotencyHash: string): Promise<LifecycleReviewRejected> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      // Idempotency first, then intent lock, same acquisition order for all calls.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        ["fmcc.lifecycle.review.idem:" + context.tenantId + ":" + idempotencyHash]);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        ["fmcc.lifecycle.review.intent:" + context.tenantId + ":" + intentId]);
      const prior = await client.query<{
        id: string; resource_id: string | null; metadata: Record<string, unknown>;
      }>(
        "SELECT id,resource_id,metadata FROM fmcc_audit_event " +
        "WHERE tenant_id=$1 AND actor_id=$2 AND action='billing.lifecycle.intent_review_rejected' " +
        "AND metadata->>'idempotencyHash'=$3 LIMIT 1",
        [context.tenantId, context.userId, idempotencyHash],
      );
      if (prior.rows.length) {
        const record = prior.rows[0];
        if (record.resource_id !== intentId || property(record.metadata, "reason") !== reason) {
          throw new LifecycleReviewDeniedError("billing.lifecycle_review_idempotency_conflict");
        }
        await client.query("COMMIT");
        return { decisionId: record.id, state: "review_rejected",
          idempotentReplay: true, executionAuthorized: false };
      }
      const original = await client.query<StoredRequestRow>(
        "SELECT id,resource_id,actor_id,occurred_at,metadata FROM fmcc_audit_event " +
        "WHERE tenant_id=$1 AND id=$2 AND action='billing.lifecycle.intent_recorded' " +
        "AND resource_type='billing_subscription' AND result='success' LIMIT 1",
        [context.tenantId, intentId],
      );
      if (original.rows.length !== 1 ||
          property(original.rows[0].metadata, "state") !== "awaiting_policy" ||
          property(original.rows[0].metadata, "policyVersion") !== "fmcc.c06.lifecycle-intent.v1") {
        throw new LifecycleReviewNotFoundError();
      }
      const priorDecision = await client.query<{ id: string }>(
        "SELECT id FROM fmcc_audit_event WHERE tenant_id=$1 " +
        "AND action='billing.lifecycle.intent_review_rejected' AND resource_id=$2 LIMIT 1",
        [context.tenantId, intentId],
      );
      if (priorDecision.rows.length) {
        throw new LifecycleReviewDeniedError("billing.lifecycle_intent_already_reviewed");
      }
      const decision = await client.query<{ id: string }>(
        "INSERT INTO fmcc_audit_event " +
        "(tenant_id,actor_id,actor_type,action,resource_type,resource_id,result,correlation_id,metadata) " +
        "VALUES ($1,$2,'user','billing.lifecycle.intent_review_rejected', " +
        "'billing_lifecycle_intent',$3,'success',$4,$5::jsonb) RETURNING id",
        [context.tenantId, context.userId, intentId, context.correlationId, JSON.stringify({
          state: "review_rejected", reason, idempotencyHash,
          policyVersion: "fmcc.c06.lifecycle-review.v1", executionAuthorized: false,
          subscriptionId: original.rows[0].resource_id,
        })],
      );
      if (decision.rows.length !== 1) throw new Error("billing.lifecycle_review_audit_missing");
      await client.query("COMMIT");
      return { decisionId: decision.rows[0].id, state: "review_rejected",
        idempotentReplay: false, executionAuthorized: false };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
}
