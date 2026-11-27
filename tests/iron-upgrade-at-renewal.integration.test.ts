import { createHmac, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { caktoReadbackFixture, ciCaktoReadEnv } from "./fixtures/cakto-readback-fixture";
import { pool } from "@/infrastructure/db/client";
import { CaktoIronProductBilling } from "@/application/billing/cakto-iron-product-billing";
import { IronSupersededCancelWorker } from "@/application/billing/iron-superseded-cancel-worker";
import { IronEntitlementOutboxWorker } from "@/application/billing/iron-entitlement-outbox-worker";
import { PostgresProductBillingAuthorityRepository } from "@/infrastructure/billing/postgres-product-billing-authority-repository";

const enabled = process.env.FMCC_CAKTO_DB_CERTIFICATION === "1" && process.env.DATABASE_URL?.includes("fmcc_billing_ci");
const dbIt = enabled ? it : it.skip;
const tenant = "ci-upgrade-" + randomUUID().slice(0, 12);
const gym = randomUUID();
const secret = "ci-cakto-only-" + "u".repeat(40);
const DAY = 86_400_000;
const readback = caktoReadbackFixture();
const repo = new PostgresProductBillingAuthorityRepository();

let productId = "";
const ids = { customer: "", gateway: "", start: "", startInvoice: "" };

const mapping = (code: string) => ({ revision: 0, commercialPlanCode: code, ironPlanCode: code.replace(/_M_2026$/, ""),
  ironPlanVersion: 1, effectiveFrom: "2026-11-27T00:00:00.000Z" });

async function seed(paidThroughInDays: number) {
  const product = await pool.query("INSERT INTO fmcc_product_definition(tenant_id,slug,name,status) VALUES ($1,'iron','IRON CI','active') RETURNING id", [tenant]);
  productId = product.rows[0].id;
  const mappings = ["IRON_START_M_2026", "IRON_GROWTH_M_2026", "IRON_BASIC_M_2026"].map((c, i) => ({ ...mapping(c), revision: i + 1 }));
  await pool.query("INSERT INTO fmcc_source_definition(tenant_id,product_id,name,source_type,authoritative_domain,sync_mode,config) VALUES($1,$2,'IRON FIT CORE Commercial','iron-commercial-v1','commercial','pull',$3::jsonb)",
    [tenant, productId, JSON.stringify({ ironCommercialPlanMappings: { schemaVersion: "iron.commercial-plan-mappings.v1", mappings } })]);
  ids.customer = (await pool.query("INSERT INTO fmcc_billing_customer(tenant_id,external_customer_id) VALUES($1,$2) RETURNING id", [tenant, "ci-" + randomUUID()])).rows[0].id;
  ids.gateway = (await pool.query("INSERT INTO fmcc_billing_gateway_account(tenant_id,provider,environment,label,secret_ref,status) VALUES($1,'cakto','production','ci','env://FMCC_CAKTO_WEBHOOK_SECRET','enabled') RETURNING id", [tenant])).rows[0].id;
  await pool.query("INSERT INTO fmcc_billing_product_route(tenant_id,product_id,gateway_account_id,status) VALUES($1,$2,$3,'enabled')", [tenant, productId, ids.gateway]);
  await pool.query("INSERT INTO fmcc_billing_customer_binding(tenant_id,product_id,customer_id,external_tenant_id) VALUES($1,$2,$3,$4)", [tenant, productId, ids.customer, gym]);
  for (const [code, amount] of [["IRON_START_M_2026", 14700], ["IRON_GROWTH_M_2026", 29700], ["IRON_BASIC_M_2026", 9700]] as const)
    await pool.query("INSERT INTO fmcc_billing_product_plan(tenant_id,product_id,plan_code,name,interval,amount_minor,status) VALUES($1,$2,$3,$3,'monthly',$4,'active')", [tenant, productId, code, amount]);
  const paidThrough = new Date(Date.now() + paidThroughInDays * DAY);
  ids.start = (await pool.query("INSERT INTO fmcc_billing_subscription(tenant_id,product_id,customer_id,plan_code,status,paid_through) VALUES($1,$2,$3,'IRON_START_M_2026','active',$4) RETURNING id", [tenant, productId, ids.customer, paidThrough])).rows[0].id;
  ids.startInvoice = (await pool.query("INSERT INTO fmcc_billing_invoice(tenant_id,product_id,customer_id,subscription_id,gateway_account_id,amount_minor,status,period_end) VALUES($1,$2,$3,$4,$5,14700,'paid',$6) RETURNING id", [tenant, productId, ids.customer, ids.start, ids.gateway, paidThrough])).rows[0].id;
  const startOrder = randomUUID();
  await pool.query("INSERT INTO fmcc_billing_provider_payment(tenant_id,invoice_id,gateway_account_id,external_payment_id,status) VALUES($1,$2,$3,$4,'received')", [tenant, ids.startInvoice, ids.gateway, startOrder]);
  await pool.query("INSERT INTO fmcc_billing_gateway_event(tenant_id,gateway_account_id,external_event_id,status,event_type,external_payment_id,external_reference,payload_fingerprint,processed_at) VALUES($1,$2,$3,'processed','payment_confirmed',$4,$5,'ci',now())",
    [tenant, ids.gateway, "cakto:payment_confirmed:" + startOrder, startOrder, ids.startInvoice]);
  return { paidThrough, startOrder };
}

function notification(event: string, orderId: string, sck: string, amount: number, offerId: string) {
  const body = JSON.stringify({ event, data: { id: orderId, offer_type: "main", sck, status: "paid", amount,
    currency: "BRL", paidAt: new Date().toISOString(), offer: { id: offerId }, product: { id: "iron_product" } } });
  readback.register(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = "v1=" + createHmac("sha256", secret).update(timestamp + "." + body).digest("hex");
  return { raw: body, headers: new Headers({ "x-cakto-timestamp": timestamp, "x-cakto-signature": signature }) };
}

const cfg = () => ({
  ...ciCaktoReadEnv, FMCC_IRON_BILLING_TENANT_ID: tenant, FMCC_IRON_PRODUCT_ID: productId, FMCC_CAKTO_WEBHOOK_SECRET: secret,
  FMCC_CAKTO_CHECKOUTS_JSON: JSON.stringify([
    { offerId: "offer_start", productId: "iron_product", planCode: "IRON_START_M_2026", checkoutUrl: "https://pay.cakto.com.br/offer_start", amountMinor: 14700, interval: "month" },
    { offerId: "offer_growth", productId: "iron_product", planCode: "IRON_GROWTH_M_2026", checkoutUrl: "https://pay.cakto.com.br/offer_growth", amountMinor: 29700, interval: "month" },
  ]),
});
const prepare = (planCode: string, key: string = randomUUID()) => repo.prepareSubscriptionInvoice({ tenantId: tenant, productId,
  externalTenantId: gym, planCode, idempotencyKey: "ci-" + key, payloadHash: "h-" + planCode });

afterAll(async () => {
  if (!enabled) return;
  for (const table of ["fmcc_billing_iron_entitlement_outbox", "fmcc_billing_gateway_event", "fmcc_billing_provider_payment",
    "fmcc_billing_command_request", "fmcc_billing_invoice", "fmcc_billing_subscription", "fmcc_billing_product_plan",
    "fmcc_billing_customer_binding", "fmcc_billing_product_route", "fmcc_billing_gateway_account", "fmcc_billing_customer",
    "fmcc_source_definition", "fmcc_product_definition"])
    await pool.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenant]);
});

describe("IRON upgrade at renewal (disposable PostgreSQL)", () => {
  dbIt("opens only inside the window, starts the paid cycle at the old period end and stops the old recurrence", async () => {
    const { paidThrough } = await seed(20);
    await expect(prepare("IRON_GROWTH_M_2026")).rejects.toThrow("billing.iron_upgrade_window_not_open");
    await expect(prepare("IRON_BASIC_M_2026")).rejects.toThrow("billing.iron_upgrade_not_allowed");
    await expect(prepare("IRON_START_M_2026")).rejects.toThrow("billing.subscription_exists");

    // Renewal now three days away: inside the five-day window.
    const renewal = new Date(Date.now() + 3 * DAY);
    await pool.query("UPDATE fmcc_billing_subscription SET paid_through=$2 WHERE id=$1", [ids.start, renewal]);
    expect(paidThrough.getTime()).not.toBe(renewal.getTime());
    const first = await prepare("IRON_GROWTH_M_2026", "first");
    const again = await prepare("IRON_GROWTH_M_2026", "second");
    expect(again.invoiceId).toBe(first.invoiceId);
    expect(again.idempotentReplay).toBe(true);
    await expect(prepare("IRON_BASIC_M_2026")).rejects.toThrow();
    const pending = (await pool.query("SELECT status,supersedes_subscription_id FROM fmcc_billing_subscription WHERE id=$1", [first.subscriptionId])).rows[0];
    expect(pending).toEqual({ status: "pending", supersedes_subscription_id: ids.start });

    // While unpaid, the gym still sees the plan it pays for.
    const view = await repo.readIronCommerceCustomer(tenant, productId, gym);
    expect(view.subscription?.planCode).toBe("IRON_START_M_2026");

    const billing = new CaktoIronProductBilling(cfg(), readback.transport);
    expect(await billing.checkoutUrl(first.invoiceId)).toContain("sck=" + first.invoiceId);
    const paid = notification("purchase_approved", randomUUID(), first.invoiceId, 297, "offer_growth");
    expect(await billing.handleWebhook(paid.headers, paid.raw)).toBe("applied");

    const growth = (await pool.query("SELECT status,paid_through FROM fmcc_billing_subscription WHERE id=$1", [first.subscriptionId])).rows[0];
    const expectedEnd = new Date(renewal); expectedEnd.setUTCMonth(expectedEnd.getUTCMonth() + 1);
    expect(growth.status).toBe("active");
    // First Growth cycle starts when the paid Start period ends: no day paid twice.
    expect(Math.abs(growth.paid_through.getTime() - expectedEnd.getTime())).toBeLessThan(3 * DAY);
    expect(growth.paid_through.getTime()).toBeGreaterThan(renewal.getTime() + 27 * DAY);
    const old = (await pool.query("SELECT status,provider_cancel_status FROM fmcc_billing_subscription WHERE id=$1", [ids.start])).rows[0];
    expect(old).toEqual({ status: "cancelled", provider_cancel_status: "pending" });
    const jobs = (await pool.query("SELECT subscription_id,event_type FROM fmcc_billing_iron_entitlement_outbox WHERE tenant_id=$1", [tenant])).rows;
    expect(jobs).toEqual([{ subscription_id: first.subscriptionId, event_type: "LICENSE_ACTIVATE" }]);
    expect((await repo.readIronCommerceCustomer(tenant, productId, gym)).subscription?.planCode).toBe("IRON_GROWTH_M_2026");

    // The license moves from IRON_START to IRON_GROWTH v1 and gets the new paid period.
    const startSub = randomUUID(), growthSub = randomUUID();
    const sent: Array<Record<string, unknown>> = [];
    const iron = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/snapshot")) return new Response(JSON.stringify({ subscriptions: [
        { tenant_id: gym, plan_code: "IRON_START", external_id: startSub, status: "ACTIVE" }] }));
      if (u.endsWith("/plan-versions")) return new Response(JSON.stringify({ plans: [
        { plan_code: "IRON_START", version: 1 }, { plan_code: "IRON_GROWTH", version: 1 }] }));
      const body = JSON.parse(String(init?.body)); sent.push(body);
      return new Response(JSON.stringify({ result: { subscription: { id: growthSub } } }));
    }) as typeof fetch;
    const delivery = new IronEntitlementOutboxWorker(pool, { FMCC_IRON_BILLING_TENANT_ID: tenant, FMCC_IRON_PRODUCT_ID: productId,
      FMCC_IRON_CONTROL_PLANE_URL: "https://api.ironfitcore.com.br/api/v1/control-plane/fmcc",
      FMCC_IRON_CONTROL_PLANE_TOKEN: "ci-only-" + "t".repeat(40) }, iron);
    expect(await delivery.processOne()).toBe("delivered");
    expect(sent[0]).toMatchObject({ action: "subscription.plan.transition", expectedSubscriptionId: startSub, planCode: "IRON_GROWTH", planVersion: 1 });
    expect(sent[1]).toMatchObject({ action: "subscription.status.sync", expectedSubscriptionId: growthSub,
      entitlementStatus: "ACTIVE", paidThrough: growth.paid_through.toISOString() });

    // Provider recurrence of the replaced plan is stopped exactly once, through its own signed order.
    const calls: unknown[] = [];
    const worker = new IronSupersededCancelWorker(pool, cfg(), () => ({ cancelRecurringByAnchor: async (input) => {
      calls.push(input); return "cancelled" as const; } }));
    expect(await worker.processOne()).toBe("cancelled");
    expect(await worker.processOne()).toBe("idle");
    expect(calls).toEqual([expect.objectContaining({ invoiceId: ids.startInvoice, planCode: "IRON_START_M_2026", amountMinor: 14700, interval: "month" })]);
    expect((await pool.query("SELECT provider_cancel_status FROM fmcc_billing_subscription WHERE id=$1", [ids.start])).rows[0].provider_cancel_status).toBe("done");
  });
});
