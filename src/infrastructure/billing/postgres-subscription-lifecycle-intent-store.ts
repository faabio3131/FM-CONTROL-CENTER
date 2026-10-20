import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { TenantContext } from "@/domain/security/tenant-context";
import { LifecycleIntentDeniedError, type LifecycleIntentEnvelope, type LifecycleIntentStore, type LifecycleIntentRecorded } from "@/application/billing/subscription-lifecycle-intent-service";
import { pool } from "@/infrastructure/db/client";

const digest = (v: string) => createHash("sha256").update(v).digest("hex");
const property = (o: Record<string, unknown>, k: string) =>
  typeof o[k] === "string" ? o[k] as string : null;

/**
 * Atomic, append-only intent audit: NOT a payment or license action queue.
 * SQL only uses parameters; the database transaction holds no provider calls.
 */
export class PostgresSubscriptionLifecycleIntentStore implements LifecycleIntentStore {
  constructor(private readonly database: Pick<Pool, "connect"> = pool) {}

  async issue(context: TenantContext, envelope: LifecycleIntentEnvelope,
              tokenHash: string, expiresAt: string): Promise<void> {
    const client = await this.database.connect();
    try {
      await client.query(
        "INSERT INTO fmcc_audit_event (tenant_id,actor_id,actor_type,action,resource_type,resource_id,result,correlation_id,metadata) VALUES ($1,$2,'user','billing.lifecycle.intent_preview_issued','billing_subscription',$3,'allowed',$4,$5::jsonb)",
        [context.tenantId, context.userId, envelope.subscriptionId, context.correlationId,
          JSON.stringify({ productId: envelope.productId, customerId: envelope.customerId,
            recordedStatus: envelope.recordedStatus, action: envelope.action,
            fingerprint: envelope.fingerprint, tokenHash, expiresAt,
            policyVersion: "fmcc.c06.lifecycle-intent.v1" })],
      );
    } finally { client.release(); }
  }

  async record(context: TenantContext, envelope: LifecycleIntentEnvelope,
               tokenHash: string, idempotencyKey: string): Promise<LifecycleIntentRecorded> {
    const client = await this.database.connect();
    const idempotencyHash = digest(JSON.stringify([context.tenantId, context.userId, idempotencyKey]));
    try {
      await client.query("BEGIN");
      // Stable lock order; token and idempotency scope include tenant/actor.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        ["fmcc.lifecycle.idem:" + idempotencyHash]);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        ["fmcc.lifecycle.token:" + context.tenantId + ":" + tokenHash]);
      const existing = await client.query<{
        id: string; resource_id: string | null; metadata: Record<string, unknown>;
      }>("SELECT id,resource_id,metadata FROM fmcc_audit_event WHERE tenant_id=$1 AND actor_id=$2 AND action='billing.lifecycle.intent_recorded' AND metadata->>'idempotencyHash'=$3 LIMIT 1",
        [context.tenantId, context.userId, idempotencyHash]);
      if (existing.rows.length) {
        const row = existing.rows[0];
        if (row.resource_id !== envelope.subscriptionId ||
            property(row.metadata, "fingerprint") !== envelope.fingerprint ||
            property(row.metadata, "tokenHash") !== tokenHash ||
            property(row.metadata, "productId") !== envelope.productId ||
            property(row.metadata, "action") !== envelope.action) {
          throw new LifecycleIntentDeniedError("billing.lifecycle_idempotency_conflict");
        }
        await client.query("COMMIT");
        return { intentId: row.id, state: "awaiting_policy",
          idempotentReplay: true, executionAuthorized: false };
      }
      const previews = await client.query<{ metadata: Record<string, unknown> }>(
        "SELECT metadata FROM fmcc_audit_event WHERE tenant_id=$1 AND actor_id=$2 AND action='billing.lifecycle.intent_preview_issued' AND resource_id=$3 AND metadata->>'tokenHash'=$4 LIMIT 1",
        [context.tenantId, context.userId, envelope.subscriptionId, tokenHash]);
      const metadata = previews.rows[0]?.metadata;
      if (!metadata || property(metadata, "fingerprint") !== envelope.fingerprint ||
          property(metadata, "productId") !== envelope.productId ||
          property(metadata, "customerId") !== envelope.customerId ||
          property(metadata, "recordedStatus") !== envelope.recordedStatus ||
          property(metadata, "action") !== envelope.action ||
          property(metadata, "policyVersion") !== "fmcc.c06.lifecycle-intent.v1") {
        throw new LifecycleIntentDeniedError("billing.lifecycle_preview_invalid");
      }
      const expiresAt = property(metadata, "expiresAt");
      if (!expiresAt || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) {
        throw new LifecycleIntentDeniedError("billing.lifecycle_preview_expired");
      }
      const consumed = await client.query<{ id: string }>(
        "SELECT id FROM fmcc_audit_event WHERE tenant_id=$1 AND action='billing.lifecycle.intent_recorded' AND metadata->>'tokenHash'=$2 LIMIT 1",
        [context.tenantId, tokenHash]);
      if (consumed.rows.length) throw new LifecycleIntentDeniedError("billing.lifecycle_preview_already_used");
      const inserted = await client.query<{ id: string }>(
        "INSERT INTO fmcc_audit_event (tenant_id,actor_id,actor_type,action,resource_type,resource_id,result,correlation_id,metadata) VALUES ($1,$2,'user','billing.lifecycle.intent_recorded','billing_subscription',$3,'success',$4,$5::jsonb) RETURNING id",
        [context.tenantId, context.userId, envelope.subscriptionId, context.correlationId,
          JSON.stringify({ productId: envelope.productId, customerId: envelope.customerId,
            recordedStatus: envelope.recordedStatus, action: envelope.action,
            fingerprint: envelope.fingerprint, tokenHash, idempotencyHash,
            state: "awaiting_policy", executionAuthorized: false,
            policyVersion: "fmcc.c06.lifecycle-intent.v1" })]);
      if (inserted.rows.length !== 1) throw new Error("billing.lifecycle_intent_audit_missing");
      await client.query("COMMIT");
      return { intentId: inserted.rows[0].id, state: "awaiting_policy",
        idempotentReplay: false, executionAuthorized: false };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
}
