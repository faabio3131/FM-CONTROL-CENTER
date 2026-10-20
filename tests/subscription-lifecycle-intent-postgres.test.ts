import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresSubscriptionLifecycleIntentStore } from "../src/infrastructure/billing/postgres-subscription-lifecycle-intent-store";
import type { LifecycleIntentEnvelope } from "../src/application/billing/subscription-lifecycle-intent-service";
import type { TenantContext } from "../src/domain/security/tenant-context";

/** Never permit integration tests to reach a configured preview/production URL. */
const enabled = process.env.FMCC_LIFECYCLE_INTENT_PG_TEST === "YES";
const tenantId = "ci-lifecycle-" + randomUUID();
const userId = "ci-lifecycle-operator";
const envelope: LifecycleIntentEnvelope = {
  subscriptionId: randomUUID(), productId: randomUUID(), customerId: randomUUID(),
  recordedStatus: "active", action: "cancel", fingerprint: "f".repeat(64),
};
const context: TenantContext = { tenantId, userId, role: "owner", correlationId: "ci-lifecycle-correlation" };
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
let pool: pg.Pool;
let store: PostgresSubscriptionLifecycleIntentStore;

describe.skipIf(!enabled)("C06 disposable PostgreSQL: tenant, actor, idempotency and token fencing", () => {
  beforeAll(async () => {
    const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
    if (!url || process.env.NODE_ENV !== "test" ||
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.port !== "5432" || url.pathname !== "/fmcc_billing_ci" ||
        url.username !== "fmcc_restore_test") {
      throw new Error("billing.lifecycle_test_requires_isolated_postgres");
    }
    pool = new pg.Pool({ connectionString: url.toString(), max: 6 });
    store = new PostgresSubscriptionLifecycleIntentStore(pool);
  });
  afterAll(async () => {
    if (!pool) return;
    try {
      await pool.query("DELETE FROM fmcc_audit_event WHERE tenant_id=$1", [tenantId]);
    } finally { await pool.end(); }
  });

  it("registers exactly one audit intent and replays same key without a second event", async () => {
    const token = randomBytes(32).toString("base64url");
    const fingerprint = hash(token);
    await store.issue(context, envelope, fingerprint, new Date(Date.now() + 120000).toISOString());
    const first = await store.record(context, envelope, fingerprint, "intent-key-0001");
    expect(first).toMatchObject({
      state: "awaiting_policy", executionAuthorized: false, idempotentReplay: false,
    });
    const replay = await store.record(context, envelope, fingerprint, "intent-key-0001");
    expect(replay).toMatchObject({ intentId: first.intentId, idempotentReplay: true,
      executionAuthorized: false });
    const events = await pool.query<{
      metadata: Record<string, unknown>; action: string;
    }>("SELECT action,metadata FROM fmcc_audit_event WHERE tenant_id=$1 ORDER BY occurred_at", [tenantId]);
    expect(events.rows).toHaveLength(2);
    expect(events.rows.filter(x => x.action === "billing.lifecycle.intent_recorded")).toHaveLength(1);
    expect(JSON.stringify(events.rows)).not.toContain(token);
    expect(events.rows[1].metadata).toMatchObject({ state: "awaiting_policy",
      executionAuthorized: false, policyVersion: "fmcc.c06.lifecycle-intent.v1" });
    await expect(store.record(context, { ...envelope, fingerprint: "c".repeat(64) },
      fingerprint, "intent-key-0001")).rejects.toThrow("billing.lifecycle_idempotency_conflict");
  });

  it("prevents two concurrent distinct requests from consuming one preview twice", async () => {
    const tokenHash = hash(randomBytes(32).toString("base64url"));
    await store.issue(context, envelope, tokenHash, new Date(Date.now() + 120000).toISOString());
    const out = await Promise.allSettled([
      store.record(context, envelope, tokenHash, "intent-key-parallel-01"),
      store.record(context, envelope, tokenHash, "intent-key-parallel-02"),
    ]);
    expect(out.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(out.filter(x => x.status === "rejected")).toHaveLength(1);
    const result = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM fmcc_audit_event WHERE tenant_id=$1 AND action='billing.lifecycle.intent_recorded' AND metadata->>'tokenHash'=$2",
      [tenantId, tokenHash]);
    expect(Number(result.rows[0].count)).toBe(1);
  });

  it("rejects stolen token from another actor or tenant and expired previews", async () => {
    const goodToken = hash(randomBytes(32).toString("base64url"));
    await store.issue(context, envelope, goodToken, new Date(Date.now() + 120000).toISOString());
    await expect(store.record({ ...context, userId: "other-user" }, envelope,
      goodToken, "intent-key-other-actor")).rejects.toThrow("billing.lifecycle_preview_invalid");
    await expect(store.record({ ...context, tenantId: "other-tenant" }, envelope,
      goodToken, "intent-key-other-tenant")).rejects.toThrow("billing.lifecycle_preview_invalid");

    const expired = hash(randomBytes(32).toString("base64url"));
    await store.issue(context, envelope, expired, "2020-01-01T00:00:00Z");
    await expect(store.record(context, envelope, expired, "intent-key-expired"))
      .rejects.toThrow("billing.lifecycle_preview_expired");
  });
});
