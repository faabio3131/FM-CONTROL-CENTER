import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";

const tenant = "fm-ci-vende-" + randomUUID();
const url = process.env.DATABASE_URL ?? "";
const pool = new pg.Pool({ connectionString: url, max: 4, allowExitOnIdle: true });
let productId: string, customerId: string, gatewayId: string;
let subId: string, invoiceId: string, revisionId: string;
let service: typeof import("../src/application/billing/assistant-paid-license-outbox");

describe("Vende paid license projection in disposable PostgreSQL", () => {
  beforeAll(async () => {
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) ||
        !["/fmcc", "/fmcc_billing_ci"].includes(parsed.pathname) ||
        process.env.NODE_ENV !== "test") throw Error("test_requires_isolated_postgres");
    process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID = tenant;
    service = await import("../src/application/billing/assistant-paid-license-outbox");

    const product = await pool.query(
      "INSERT INTO fmcc_product_definition(tenant_id,slug,name) VALUES($1,'vendeatendeia','Vende CI') RETURNING id",
      [tenant],
    );
    productId = product.rows[0].id;
    const customer = await pool.query(
      "INSERT INTO fmcc_billing_customer(tenant_id,external_customer_id) VALUES($1,'ci-customer') RETURNING id",
      [tenant],
    );
    customerId = customer.rows[0].id;
    const gateway = await pool.query(
      "INSERT INTO fmcc_billing_gateway_account(tenant_id,provider,environment,label,secret_ref,status) VALUES($1,'asaas','sandbox','ci','secret://ci','enabled') RETURNING id",
      [tenant],
    );
    gatewayId = gateway.rows[0].id;
    await pool.query(
      "INSERT INTO fmcc_billing_customer_binding(tenant_id,product_id,customer_id,external_tenant_id) VALUES($1,$2,$3,'vendee-customer-1')",
      [tenant, productId, customerId],
    );
    const sub = await pool.query(
      "INSERT INTO fmcc_billing_subscription(tenant_id,product_id,customer_id,plan_code) VALUES($1,$2,$3,'premium') RETURNING id",
      [tenant, productId, customerId],
    );
    subId = sub.rows[0].id;
    const invoice = await pool.query(
      "INSERT INTO fmcc_billing_invoice(tenant_id,product_id,customer_id,subscription_id,gateway_account_id,amount_minor,currency) VALUES($1,$2,$3,$4,$5,900,'BRL') RETURNING id",
      [tenant, productId, customerId, subId, gatewayId],
    );
    invoiceId = invoice.rows[0].id;
    await pool.query(
      "INSERT INTO fmcc_billing_provider_payment(tenant_id,invoice_id,gateway_account_id,external_payment_id,status) VALUES($1,$2,$3,'asaas-ci-payment','received')",
      [tenant, invoiceId, gatewayId],
    );
    const plan = await pool.query(
      "INSERT INTO fmcc_assistant_plan_revision(tenant_id,product_id,plan_code,revision,label,billing_interval,amount_minor,currency,allowances,status,actor_id,published_at) VALUES($1,$2,'premium',1,'Premium','monthly',900,'BRL',$3,'published','fm-admin',now()) RETURNING id",
      [tenant, productId, JSON.stringify([
        { resource: "ai.requests", scope: "tenant", limitUnits: 100, windowSeconds: 86400 },
        { resource: "ai.total_tokens", scope: "tenant", limitUnits: 1000, windowSeconds: 86400 },
      ])],
    );
    revisionId = plan.rows[0].id;
  });
  afterAll(async () => {
    try {
      await pool.query("DELETE FROM fmcc_billing_vende_license_outbox WHERE tenant_id=$1", [tenant]);
      await pool.query("DELETE FROM fmcc_billing_provider_payment WHERE tenant_id=$1", [tenant]);
      await pool.query("DELETE FROM fmcc_billing_invoice WHERE tenant_id=$1", [tenant]);
      await pool.query("DELETE FROM fmcc_billing_subscription WHERE tenant_id=$1", [tenant]);
      await pool.query("DELETE FROM fmcc_billing_customer_binding WHERE tenant_id=$1", [tenant]);
      await pool.query("DELETE FROM fmcc_assistant_plan_revision WHERE tenant_id=$1", [tenant]);
      await pool.query("DELETE FROM fmcc_billing_gateway_account WHERE tenant_id=$1", [tenant]);
      await pool.query("DELETE FROM fmcc_billing_customer WHERE tenant_id=$1", [tenant]);
      await pool.query("DELETE FROM fmcc_product_definition WHERE tenant_id=$1", [tenant]);
    } finally {
      await pool.end();
    }
  });

  it("refuses unpaid invoice and only enqueues once after canonical settlement", async () => {
    await expect(service.enqueueVerifiedVendePaidLicense(tenant, invoiceId))
      .rejects.toThrow("vende.license_payment_proof_denied");
    const { PostgresCanonicalBillingRepository } = await import(
      "../src/infrastructure/billing/postgres-canonical-billing-repository"
    );
    await new PostgresCanonicalBillingRepository().markInvoicePaid(
      tenant, invoiceId, "asaas-ci-payment",
    );
    // Canonical billing settlement atomically enqueued it in the same TX.
    expect(await service.enqueueVerifiedVendePaidLicense(tenant, invoiceId)).toBe("already_queued");
    expect(await service.enqueueVerifiedVendePaidLicense(tenant, invoiceId)).toBe("already_queued");
    await expect(service.enqueueVerifiedVendePaidLicense("foreign-tenant", invoiceId))
      .rejects.toThrow();
    const rows = await pool.query(
      "SELECT external_tenant_id,plan_revision,state FROM fmcc_billing_vende_license_outbox WHERE tenant_id=$1 AND invoice_id=$2",
      [tenant, invoiceId],
    );
    expect(rows.rows).toMatchObject([{
      external_tenant_id: "vendee-customer-1", plan_revision: 1, state: "pending",
    }]);
  });

  it("denies reversed payment and quarantines uncertain delivery without resend", async () => {
    const another = await pool.query(
      "INSERT INTO fmcc_billing_invoice(tenant_id,product_id,customer_id,subscription_id,gateway_account_id,amount_minor,currency) VALUES($1,$2,$3,$4,$5,900,'BRL') RETURNING id",
      [tenant, productId, customerId, subId, gatewayId],
    );
    const invoice = another.rows[0].id as string;
    const providerPaymentId = "asaas-ci-other-" + randomUUID();
    await pool.query(
      "INSERT INTO fmcc_billing_provider_payment(tenant_id,invoice_id,gateway_account_id,external_payment_id,status) VALUES($1,$2,$3,$4,'received')",
      [tenant, invoice, gatewayId, providerPaymentId],
    );
    const { PostgresCanonicalBillingRepository } = await import(
      "../src/infrastructure/billing/postgres-canonical-billing-repository"
    );
    await new PostgresCanonicalBillingRepository().markInvoicePaid(
      tenant, invoice, providerPaymentId,
    );
    const queued = await pool.query(
      "SELECT id FROM fmcc_billing_vende_license_outbox WHERE tenant_id=$1 AND invoice_id=$2",
      [tenant, invoice],
    );
    const id = queued.rows[0].id as string;
    const config = {
      assistantOrigin: "https://assistant.example.test", keyId: "ci-key",
      signingKey: "only-a-synthetic-fm-command-test-key-000000000",
      organizationId: tenant,
    };
    await pool.query(
      "UPDATE fmcc_billing_invoice SET status='reversed' WHERE tenant_id=$1 AND id=$2",
      [tenant, invoice],
    );
    let calls = 0;
    const transport = (async () => {
      calls++;
      throw new Error("provider timeout");
    }) as typeof fetch;
    await expect(service.dispatchVerifiedVendePaidLicense(id, config, transport))
      .rejects.toThrow();
    expect(calls).toBe(0); // no dispatch on reversed invoice

    await pool.query(
      "UPDATE fmcc_billing_invoice SET status='paid' WHERE tenant_id=$1 AND id=$2",
      [tenant, invoice],
    );
    await expect(service.dispatchVerifiedVendePaidLicense(id, config, transport))
      .rejects.toThrow();
    expect(calls).toBe(1);
    await expect(service.dispatchVerifiedVendePaidLicense(id, config, transport))
      .rejects.toThrow();
    expect(calls).toBe(1); // uncertain result never automatically retried
    const state = await pool.query(
      "SELECT state,attempts FROM fmcc_billing_vende_license_outbox WHERE id=$1",
      [id],
    );
    expect(state.rows[0]).toMatchObject({ state: "blocked", attempts: 1 });
  });

  it("reconciles blocked intent with signed Assistant state, never resending the license", async () => {
    const candidate = await pool.query(
      "SELECT id FROM fmcc_billing_vende_license_outbox WHERE tenant_id=$1 AND state='blocked' LIMIT 1",
      [tenant],
    );
    const id = candidate.rows[0].id as string;
    const config = {
      assistantOrigin: "https://assistant.example.test",
      keyId: "ci-key",
      signingKey: "a-synthetic-test-only-secret-that-is-over-32-characters",
      organizationId: tenant,
    };
    let calls = 0;
    const unknown = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      expect(String(url)).toContain("/assistant-plans/binding-status");
      expect(String(url).endsWith("/binding-status")).toBe(true);
      expect(new Headers(init?.headers).get("X-FM-Command-Signature"))
        .toMatch(/^[0-9a-f]{64}$/);
      return new Response(JSON.stringify({ status: "not_confirmed" }), {status: 200});
    }) as typeof fetch;
    expect(await service.reconcileBlockedVendePaidLicense(id, config, unknown))
      .toBe("still_blocked");
    const positive = (async () => {
      calls++;
      return new Response(JSON.stringify({ status: "bound_confirmed" }), {status: 200});
    }) as typeof fetch;
    expect(await service.reconcileBlockedVendePaidLicense(id, config, positive))
      .toBe("delivered");
    expect(calls).toBe(2);
    await expect(service.dispatchVerifiedVendePaidLicense(id, config, positive))
      .rejects.toThrow();
    const final = await pool.query(
      "SELECT state,attempts FROM fmcc_billing_vende_license_outbox WHERE id=$1", [id],
    );
    expect(final.rows[0]).toMatchObject({state:"delivered",attempts:1});
  });

  it("dispatches signed binding once and prevents replay of consumed intent", async () => {
    const row = await pool.query(
      "SELECT id FROM fmcc_billing_vende_license_outbox WHERE tenant_id=$1 AND invoice_id=$2",
      [tenant, invoiceId],
    );
    let calls = 0;
    const send = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      expect(String(input)).toBe("https://assistant.example.test/internal/v1/command/assistant-plans/bind");
      const payload = JSON.parse(String(init?.body));
      expect(payload).toMatchObject({
        tenant_id: "vendee-customer-1", plan_code: "premium", plan_revision: 1,
      });
      expect(new Headers(init?.headers).get("X-FM-Command-Signature")).toMatch(/^[a-f0-9]{64}$/);
      return new Response(JSON.stringify({ status: "bound" }), { status: 200 });
    };
    const config = {
      assistantOrigin: "https://assistant.example.test",
      keyId: "ci-fm-key", signingKey: "a-synthetic-test-only-secret-that-is-over-32-characters",
      organizationId: tenant,
    };
    expect(await service.dispatchVerifiedVendePaidLicense(
      row.rows[0].id, config, send as typeof fetch,
    )).toBe("delivered");
    await expect(service.dispatchVerifiedVendePaidLicense(
      row.rows[0].id, config, send as typeof fetch,
    )).rejects.toThrow();
    expect(calls).toBe(1);
    expect(await service.drainVerifiedVendePaidLicenses(config, 10, send as typeof fetch))
      .toEqual({ delivered: 0, blocked: 0 });
    expect(calls).toBe(1);
    await expect(service.drainVerifiedVendePaidLicenses(config, 0, send as typeof fetch))
      .rejects.toThrow();
  });
});
