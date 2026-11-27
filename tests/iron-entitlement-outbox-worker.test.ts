import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { IronEntitlementOutboxWorker, ironLicenseCommand, selectIronSubscription } from "@/application/billing/iron-entitlement-outbox-worker";
import type { Pool } from "pg";

const gym = "d29f0dd5-0f3b-4c46-93b5-b5c18f53a073";
const ironSubscription = "0592a749-ab6c-4cbc-94d9-bdc5fca927b0";
const invoice = "33804d46-6da3-4273-803f-cefcf73b74d4";
const outbox = "98c06e68-96ba-46c0-9e75-2eaecf613f24";
const token = "test-only-control-plane-abcdefghijklmnopqrstuvwxyz";
const mappingConfig = { ironCommercialPlanMappings: { schemaVersion: "iron.commercial-plan-mappings.v1", mappings: [
  { revision: 1, commercialPlanCode: "IRON_PRO_M_2026", ironPlanCode: "IRON_PRO", ironPlanVersion: 1, effectiveFrom: "2026-11-27T00:00:00.000Z" },
] } };
const mappingRows = { rows: [{ config: mappingConfig }], rowCount: 1 };
const env = { FMCC_IRON_BILLING_TENANT_ID: "fm-tenant", FMCC_IRON_PRODUCT_ID: "999f0dd5-0f3b-4c46-93b5-b5c18f53a073", FMCC_IRON_CONTROL_PLANE_URL: "https://api.ironfitcore.com.br/api/v1/control-plane/fmcc", FMCC_IRON_CONTROL_PLANE_TOKEN: token };

describe("IRON canonical entitlement delivery contract", () => {
  it("keeps the established V1 dispatcher separate from the Cakto outbox scheduler", () => {
    const existing = readFileSync(new URL("../src/infrastructure/billing/postgres-iron-entitlement-outbox.ts", import.meta.url), "utf8");
    expect(existing).toContain("idempotency_key NOT LIKE 'cakto:%'");
  });

  it("selects only a unique scoped current IRON subscription", () => {
    const snapshot = { subscriptions: [
      { tenant_id: gym, plan_code: "IRON_PRO", external_id: ironSubscription, status: "ACTIVE" },
      { tenant_id: "cd81ebaa-260d-437b-b489-a2fbfb8bd305", plan_code: "IRON_PRO", external_id: "92dac5f8-596a-4a26-9689-c37ad091984f", status: "ACTIVE" },
    ] };
    expect(selectIronSubscription(snapshot, gym, "IRON_PRO")).toBe(ironSubscription);
    expect(() => selectIronSubscription(snapshot, gym, "IRON_OTHER")).toThrow("iron.subscription_not_unique_or_missing");
    expect(() => selectIronSubscription({ subscriptions: [...snapshot.subscriptions, snapshot.subscriptions[0]] }, gym, "IRON_PRO")).toThrow("iron.subscription_not_unique_or_missing");
    expect(() => selectIronSubscription({ subscriptions: [] }, gym, "IRON_PRO")).toThrow();
    expect(() => selectIronSubscription({ subscriptions: snapshot.subscriptions }, "not-a-uuid", "IRON_PRO")).toThrow();
  });

  it("never grants extra authority: uses canonical status sync and existing subscription ID", () => {
    expect(ironLicenseCommand("LICENSE_ACTIVATE", gym, ironSubscription, invoice)).toMatchObject({
      action: "subscription.status.sync", gymId: gym, expectedSubscriptionId: ironSubscription,
      commercialStatus: "active", entitlementStatus: "ACTIVE",
    });
    expect(ironLicenseCommand("LICENSE_SUSPEND", gym, ironSubscription, invoice).entitlementStatus).toBe("SUSPENDED");
    expect(ironLicenseCommand("LICENSE_CANCEL", gym, ironSubscription, invoice).entitlementStatus).toBe("CANCELED");
  });

  it("delivers an outbox claim exactly once, with signed S2S bearer and stable idempotency key", async () => {
    const sqls: string[] = [];
    const pool = { query: async (sql: string, _params?: unknown[]) => {
      sqls.push(sql);
      if (sql.includes("RETURNING id, tenant_id")) return { rows: [{ id: outbox, tenant_id: "fm-tenant", product_id: "iron-product", invoice_id: invoice, subscription_id: "billing-sub", event_type: "LICENSE_ACTIVATE", attempts: 1, claim_token: "lease" }] };
      if (sql.includes("fmcc_source_definition")) return mappingRows;
      if (sql.includes("SELECT b.external_tenant_id")) return { rows: [{ gym_id: gym, plan_code: "IRON_PRO_M_2026", invoice_status: "paid", subscription_status: "active", paid_through: new Date(Date.now() + 30 * 86_400_000), invoice_period_end: new Date(Date.now() + 29 * 86_400_000) }] };
      return { rows: [], rowCount: 1 };
    }} as unknown as Pick<Pool, "query">;
    const http: Array<{ url: string; init?: RequestInit }> = [];
    const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      http.push({ url: String(url), init });
      if (String(url).endsWith("/snapshot")) return new Response(JSON.stringify({
        subscriptions: [{ tenant_id: gym, plan_code: "IRON_PRO", external_id: ironSubscription, status: "ACTIVE" }],
      }), { status: 200 });
      return new Response(JSON.stringify({ result: { status: "ACTIVE" } }), { status: 200 });
    }) as typeof fetch;
    const result = await new IronEntitlementOutboxWorker(pool, env, mockFetch).processOne();
    expect(result).toBe("delivered");
    expect(http).toHaveLength(2);
    const posted = http[1].init!;
    expect(posted.method).toBe("POST");
    expect(JSON.parse(posted.body as string)).toMatchObject({ gymId: gym, expectedSubscriptionId: ironSubscription, entitlementStatus: "ACTIVE", paidThrough: expect.any(String) });
    const h = new Headers(posted.headers);
    expect(h.get("idempotency-key")).toBe("fmcc-cakto-license-" + outbox);
    expect(h.get("authorization")).toBe("Bearer " + token);
    expect(sqls.some(x => x.includes("status='delivered'"))).toBe(true);
    expect(sqls.some(x => x.includes("candidate.idempotency_key LIKE 'cakto:%'"))).toBe(true);
    expect(sqls.some(x => x.includes("candidate.tenant_id=$2 AND candidate.product_id=$3"))).toBe(true);
  });

  it("retains a retryable DB job on transient S2S failure, without marking it delivered", async () => {
    const queries: Array<{ sql: string; params: unknown[] | undefined }> = [];
    const pool = { query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes("RETURNING id, tenant_id")) return { rows: [{ id: outbox, tenant_id: "fm-tenant", product_id: "iron-product", invoice_id: invoice, subscription_id: "billing-sub", event_type: "LICENSE_ACTIVATE", attempts: 1, claim_token: "lease" }] };
      if (sql.includes("fmcc_source_definition")) return mappingRows;
      if (sql.includes("SELECT b.external_tenant_id")) return { rows: [{ gym_id: gym, plan_code: "IRON_PRO_M_2026", invoice_status: "paid", subscription_status: "active", paid_through: new Date(Date.now() + 30 * 86_400_000), invoice_period_end: new Date(Date.now() + 29 * 86_400_000) }] };
      return { rows: [], rowCount: 1 };
    }} as unknown as Pick<Pool, "query">;
    const failingFetch = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
    expect(await new IronEntitlementOutboxWorker(pool, env, failingFetch).processOne()).toBe("retry");
    expect(queries.some(x => x.params?.includes("retry"))).toBe(true);
    expect(queries.some(x => x.sql.includes("status='delivered'"))).toBe(false);
  });

  it("rejects a stale suspension from an older paid cycle without calling IRON", async () => {
    const pool = { query: async (sql: string) => {
      if (sql.includes("RETURNING id, tenant_id")) return { rows: [{ id: outbox, tenant_id: "fm-tenant", product_id: "iron-product", invoice_id: invoice, subscription_id: "billing-sub", event_type: "LICENSE_SUSPEND", attempts: 1, claim_token: "lease" }] };
      if (sql.includes("fmcc_source_definition")) return mappingRows;
      if (sql.includes("SELECT b.external_tenant_id")) return { rows: [{ gym_id: gym, plan_code: "IRON_PRO_M_2026", invoice_status: "paid", subscription_status: "active", paid_through: new Date(Date.now() + 60 * 86_400_000), invoice_period_end: new Date(Date.now() + 30 * 86_400_000) }] };
      return { rows: [], rowCount: 1 };
    }} as unknown as Pick<Pool, "query">;
    let called = false;
    const mocked = (async () => { called = true; throw new Error("must_not_send"); }) as typeof fetch;
    expect(await new IronEntitlementOutboxWorker(pool, env, mocked).processOne()).toBe("blocked");
    expect(called).toBe(false);
  });

  it("does not deliver a license for unpaid or missing canonical invoice binding", async () => {
    const pool = { query: async (sql: string, _params?: unknown[]) => {
      if (sql.includes("RETURNING id, tenant_id")) return { rows: [{ id: outbox, tenant_id: "fm-tenant", product_id: "iron-product", invoice_id: invoice, subscription_id: "billing-sub", event_type: "LICENSE_ACTIVATE", attempts: 1, claim_token: "lease" }] };
      if (sql.includes("fmcc_source_definition")) return mappingRows;
      if (sql.includes("SELECT b.external_tenant_id")) return { rows: [{ gym_id: gym, plan_code: "IRON_PRO_M_2026", invoice_status: "pending", subscription_status: "pending", paid_through: null, invoice_period_end: null }] };
      return { rows: [], rowCount: 1 };
    }} as unknown as Pick<Pool, "query">;
    let called = false;
    const mockFetch = (async () => { called = true; throw new Error("network_should_not_be_used"); }) as typeof fetch;
    expect(await new IronEntitlementOutboxWorker(pool, env, mockFetch).processOne()).toBe("blocked");
    expect(called).toBe(false);
  });
});

describe("IRON first purchase from a trial (commercial code differs from IRON plan code)", () => {
  const trialSub = "7a8c1f2e-1b3d-4c5e-8f9a-0b1c2d3e4f50";
  const newSub = "1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b";
  const paidRows = { rows: [{ gym_id: gym, plan_code: "IRON_PRO_M_2026", invoice_status: "paid", subscription_status: "active", paid_through: new Date(Date.now() + 30 * 86_400_000), invoice_period_end: new Date(Date.now() + 30 * 86_400_000) }] };
  const claim = { rows: [{ id: outbox, tenant_id: "fm-tenant", product_id: "iron-product", invoice_id: invoice, subscription_id: "billing-sub", event_type: "LICENSE_ACTIVATE", attempts: 1, claim_token: "lease" }] };
  const pool = (mapping: { rows: Array<{ config: Record<string, unknown> }>; rowCount: number } = mappingRows) => ({ query: async (sql: string) => {
    if (sql.includes("RETURNING id, tenant_id")) return claim;
    if (sql.includes("fmcc_source_definition")) return mapping;
    if (sql.includes("SELECT b.external_tenant_id")) return paidRows;
    return { rows: [], rowCount: 1 };
  }}) as unknown as Pick<Pool, "query">;
  const run = async (trialStatus: string) => {
    const posted: Array<{ key: string | null; body: Record<string, unknown> }> = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/snapshot")) return new Response(JSON.stringify({ subscriptions: [
        { tenant_id: gym, plan_code: "IRON_V1_TRIAL", external_id: trialSub, status: trialStatus },
        { tenant_id: gym, plan_code: "IRON_V1_TRIAL", external_id: ironSubscription, status: "CANCELED" },
      ] }), { status: 200 });
      if (u.endsWith("/plan-versions")) return new Response(JSON.stringify({ plans: [
        { plan_code: "IRON_PRO", version: 1 }, { plan_code: "IRON_V1_TRIAL", version: 1 } ] }), { status: 200 });
      const body = JSON.parse(String(init?.body));
      posted.push({ key: new Headers(init?.headers).get("idempotency-key"), body });
      if (body.action === "subscription.plan.transition")
        return new Response(JSON.stringify({ result: { subscription: { id: newSub } } }), { status: 200 });
      return new Response(JSON.stringify({ result: { status: "ACTIVE" } }), { status: 200 });
    }) as typeof fetch;
    const result = await new IronEntitlementOutboxWorker(pool(), env, fetcher).processOne();
    return { result, posted };
  };

  it("moves a running trial to the mapped IRON plan and then activates the paid period", async () => {
    const { result, posted } = await run("ACTIVE");
    expect(result).toBe("delivered");
    expect(posted.map(p => p.body.action)).toEqual(["subscription.plan.transition", "subscription.status.sync"]);
    expect(posted[0].body).toMatchObject({ expectedSubscriptionId: trialSub, planCode: "IRON_PRO", planVersion: 1, transitionKind: "PLAN_CHANGE" });
    expect(posted[1].body).toMatchObject({ expectedSubscriptionId: newSub, entitlementStatus: "ACTIVE", paidThrough: expect.any(String) });
    expect(posted.map(p => p.key)).toEqual(["fmcc-cakto-plan-" + outbox, "fmcc-cakto-license-" + outbox]);
  });

  it("reopens an expired (suspended) trial before moving it to the paid plan", async () => {
    const { result, posted } = await run("SUSPENDED");
    expect(result).toBe("delivered");
    expect(posted.map(p => p.body.action)).toEqual(["subscription.status.sync", "subscription.plan.transition", "subscription.status.sync"]);
    expect(posted[0]).toMatchObject({ key: "fmcc-cakto-reopen-" + outbox, body: { expectedSubscriptionId: trialSub, entitlementStatus: "ACTIVE" } });
    expect(posted[0].body).not.toHaveProperty("paidThrough");
  });

  it("blocks without calling IRON when the commercial plan has no recorded mapping", async () => {
    let called = false;
    const fetcher = (async () => { called = true; throw new Error("must_not_send"); }) as typeof fetch;
    const empty = { rows: [{ config: {} }], rowCount: 1 };
    expect(await new IronEntitlementOutboxWorker(pool(empty), env, fetcher).processOne()).toBe("blocked");
    expect(called).toBe(false);
  });
});
