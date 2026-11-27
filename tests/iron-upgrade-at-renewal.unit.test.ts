import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { ironUpgradeAtRenewal, IRON_UPGRADE_WINDOW_DAYS } from "@/domain/billing/iron-upgrade-at-renewal";
import { CaktoPaymentProvider } from "@/infrastructure/subscription/cakto-payment-provider";
import { IronSupersededCancelWorker } from "@/application/billing/iron-superseded-cancel-worker";

const DAY = 86_400_000;
const now = new Date("2026-12-10T12:00:00Z");

describe("upgrade window", () => {
  const start = { amountMinor: 14700, interval: "monthly" };
  const growth = { amountMinor: 29700, interval: "monthly" };
  it("opens only in the last days before renewal, for a higher price on the same cycle", () => {
    expect(IRON_UPGRADE_WINDOW_DAYS).toBe(5);
    expect(ironUpgradeAtRenewal({ ...start, paidThrough: new Date(now.getTime() + 3 * DAY) }, growth, now).allowed).toBe(true);
    expect(ironUpgradeAtRenewal({ ...start, paidThrough: new Date(now.getTime() + 6 * DAY) }, growth, now))
      .toMatchObject({ allowed: false, reason: "window_not_open" });
    expect(ironUpgradeAtRenewal({ ...start, paidThrough: new Date(now.getTime() - 1) }, growth, now))
      .toMatchObject({ allowed: false, reason: "period_ended" });
    expect(ironUpgradeAtRenewal({ ...growth, paidThrough: new Date(now.getTime() + DAY) }, start, now))
      .toMatchObject({ allowed: false, reason: "not_upgrade" });
    expect(ironUpgradeAtRenewal({ ...start, paidThrough: new Date(now.getTime() + DAY) }, { ...growth, interval: "yearly" }, now))
      .toMatchObject({ allowed: false, reason: "interval_mismatch" });
    expect(ironUpgradeAtRenewal({ ...start, paidThrough: null }, growth, now))
      .toMatchObject({ allowed: false, reason: "no_paid_period" });
  });
});

describe("Cakto cancellation of the replaced plan", () => {
  const invoiceId = "5c0f3f7e-2a51-4c1e-9a3b-6f0d1e2c3b4a";
  const paymentId = "7d1e2f3a-4b5c-4d6e-8f90-a1b2c3d4e5f6";
  const subId = "9e8d7c6b-5a49-4382-a716-152433425160";
  const env = {
    FMCC_CAKTO_WEBHOOK_SECRET: "x".repeat(32), FMCC_CAKTO_MANAGE_CLIENT_ID: "manage", FMCC_CAKTO_MANAGE_CLIENT_SECRET: "manage-secret",
    FMCC_CAKTO_CHECKOUTS_JSON: JSON.stringify([{ offerId: "offer_start", productId: "iron_product", planCode: "IRON_START_M_2026",
      checkoutUrl: "https://pay.cakto.com.br/offer_start", amountMinor: 14700, interval: "month" }]),
  };
  const input = { invoiceId, paymentId, planCode: "IRON_START_M_2026", amountMinor: 14700, interval: "month" as const };
  const transport = (opts: { status?: string; afterCancel?: string; orderSck?: string } = {}) => {
    let state = opts.status ?? "active";
    const posts: string[] = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/token/")) return new Response(JSON.stringify({ access_token: "manage-token-0000000000000000", token_type: "Bearer", expires_in: 3600 }));
      if (init?.method === "POST") { posts.push(path); state = opts.afterCancel ?? "canceled"; return new Response(JSON.stringify({ detail: "ok", status: state })); }
      if (path.endsWith("/orders/" + paymentId + "/")) return new Response(JSON.stringify({ id: paymentId, sck: opts.orderSck ?? invoiceId,
        type: "subscription", offer_type: "main", product: { id: "iron_product" }, subscription: subId }));
      if (path.endsWith("/subscriptions/" + subId + "/")) return new Response(JSON.stringify({ id: subId, parent_order: paymentId,
        product: "iron_product", offer: "offer_start", status: state }));
      return new Response("", { status: 404 });
    }) as typeof fetch;
    return { fetcher, posts };
  };

  it("cancels through the signed original order and confirms by reading the provider state back", async () => {
    const t = transport();
    expect(await new CaktoPaymentProvider(env).cancelRecurringByAnchor(input, t.fetcher)).toBe("cancelled");
    expect(t.posts).toEqual(["/public_api/subscriptions/" + subId + "/cancel/"]);
  });

  it("does not cancel twice, refuses another invoice's order and reports an unconfirmed cancellation", async () => {
    const done = transport({ status: "canceled" });
    expect(await new CaktoPaymentProvider(env).cancelRecurringByAnchor(input, done.fetcher)).toBe("already_cancelled");
    expect(done.posts).toEqual([]);
    const foreign = transport({ orderSck: "00000000-0000-4000-8000-000000000000" });
    await expect(new CaktoPaymentProvider(env).cancelRecurringByAnchor(input, foreign.fetcher)).rejects.toThrow("cakto.cancel_binding_invalid");
    expect(foreign.posts).toEqual([]);
    const stuck = transport({ afterCancel: "active" });
    await expect(new CaktoPaymentProvider(env).cancelRecurringByAnchor(input, stuck.fetcher)).rejects.toThrow("cakto.cancel_not_confirmed");
  });

  it("requires the dedicated write credential", async () => {
    const { FMCC_CAKTO_MANAGE_CLIENT_SECRET: _omit, ...readOnly } = env;
    void _omit;
    await expect(new CaktoPaymentProvider(readOnly).cancelRecurringByAnchor(input, transport().fetcher)).rejects.toThrow("cakto.manage_not_configured");
  });
});

describe("superseded cancellation worker", () => {
  const env = { FMCC_IRON_BILLING_TENANT_ID: "fm-tenant", FMCC_IRON_PRODUCT_ID: "999f0dd5-0f3b-4c46-93b5-b5c18f53a073" };
  const run = async (error: string, attempts = 0) => {
    const updates: unknown[][] = [];
    const pool = { query: async (sql: string, params?: unknown[]) => {
      if (sql.includes("RETURNING s.id")) return { rows: [{ id: "sub", customer_id: "c", plan_code: "IRON_START_M_2026", provider_cancel_attempts: attempts }] };
      if (sql.includes("FROM fmcc_billing_invoice i")) return { rows: [{ invoice_id: "i", external_payment_id: "p", amount_minor: "14700", interval: "monthly" }] };
      updates.push(params ?? []);
      return { rows: [], rowCount: 1 };
    } } as unknown as Pick<Pool, "query">;
    const worker = new IronSupersededCancelWorker(pool, env, () => ({ cancelRecurringByAnchor: async () => { throw new Error(error); } }));
    return { result: await worker.processOne(), update: updates[0] };
  };
  it("waits for the credential without spending attempts, retries transient failures and stops on a wrong binding", async () => {
    expect(await run("cakto.manage_not_configured")).toMatchObject({ result: "not_configured", update: expect.arrayContaining(["pending", "cakto.manage_not_configured", 0]) });
    expect(await run("cakto.cancel_unavailable")).toMatchObject({ result: "retry", update: expect.arrayContaining(["pending", 1]) });
    expect(await run("cakto.cancel_unavailable", 7)).toMatchObject({ result: "failed", update: expect.arrayContaining(["failed", 8]) });
    expect(await run("cakto.cancel_binding_invalid")).toMatchObject({ result: "failed" });
  });
});
