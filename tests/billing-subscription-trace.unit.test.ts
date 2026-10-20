import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BillingSubscriptionTraceService, SubscriptionTraceInputError, SubscriptionTraceNotFoundError,
  type SubscriptionTraceRepository, type SubscriptionTraceHeader, type SubscriptionInvoiceTrace,
} from "../src/application/billing/billing-subscription-trace-service";
import type { TenantContext } from "../src/domain/security/tenant-context";

const identity: TenantContext = {
  tenantId: "fm", userId: "admin", role: "owner", correlationId: "corr",
};
const id = "11111111-1111-4111-8111-111111111111";
const head: SubscriptionTraceHeader = {
  subscriptionId: id, productId: "product-fm", customerId: "customer-fm",
  externalTenantId: "gym-1", planCode: "PLAN-A", status: "pending",
  createdAt: new Date("2026-10-20T04:00:00Z"),
};
const invoice: SubscriptionInvoiceTrace = {
  invoiceId: "invoice-1", invoiceStatus: "pending", amountMinor: 17900,
  currency: "BRL", createdAt: new Date("2026-10-20T04:00:00Z"),
  gatewayAccountId: "gateway-1", recordedPaymentStatus: null,
  paymentRecordedAt: null,
};
function fixture(rows: SubscriptionInvoiceTrace[], header: SubscriptionTraceHeader | null = head) {
  const repository: SubscriptionTraceRepository = {
    getSubscription: vi.fn(async () => header),
    listInvoices: vi.fn(async () => rows),
  };
  return { repository, service: new BillingSubscriptionTraceService(repository) };
}

describe("FMCC C02 subscription invoice trace", () => {
  it("derives the tenant from identity and scopes invoices to product/customer", async () => {
    const { service, repository } = fixture([invoice]);
    const trace = await service.get(identity, id);
    expect(repository.getSubscription).toHaveBeenCalledWith("fm", id);
    expect(repository.listInvoices).toHaveBeenCalledWith("fm", id, "product-fm", "customer-fm", 51);
    expect(trace.authority).toBe("fmcc_billing_invoice_and_provider_payment");
    expect(trace.invoices[0].recordedPaymentStatus).toBeNull();
    expect(trace.settlementConfirmedByThisView).toBe(false);
  });

  it("limits history without misrepresenting a truncated page as complete", async () => {
    const { service } = fixture(Array.from({ length: 51 }, (_, n) => ({
      ...invoice, invoiceId: String(n),
    })));
    const trace = await service.get(identity, id);
    expect(trace.invoices).toHaveLength(50);
    expect(trace.truncated).toBe(true);
  });

  it("denies financial viewers and malformed/unknown subscription IDs without invoice query", async () => {
    const { service, repository } = fixture([invoice]);
    await expect(service.get({ ...identity, role: "viewer" }, id))
      .rejects.toThrow("security.permission_denied:billing:read");
    await expect(service.get(identity, "../other-tenant")).rejects.toBeInstanceOf(SubscriptionTraceInputError);
    const missing = fixture([], null);
    await expect(missing.service.get(identity, id)).rejects.toBeInstanceOf(SubscriptionTraceNotFoundError);
    expect(missing.repository.listInvoices).not.toHaveBeenCalled();
    expect(repository.listInvoices).not.toHaveBeenCalled();
  });

  it("requires signed identity, no-store API and tenant-aware SQL joins", () => {
    const source = (file: string) => readFileSync(resolve(file), "utf8");
    const sql = source("src/infrastructure/billing/postgres-billing-subscription-trace-repository.ts");
    const api = source("src/app/api/billing/subscriptions/[subscriptionId]/trace/route.ts");
    const ui = source("src/app/dashboard/subscriptions/[subscriptionId]/page.tsx");
    expect(api).toContain("resolveTenantContext(await headers())");
    expect(api).toContain('"Cache-Control": "no-store"');
    expect(api).not.toContain("export async function POST");
    expect(sql).toContain("eq(billingInvoices.tenantId, tenantId)");
    expect(sql).toContain("eq(billingProviderPayments.tenantId, billingInvoices.tenantId)");
    expect(sql).toContain("eq(billingInvoices.productId, productId)");
    expect(sql).toContain("eq(billingInvoices.customerId, customerId)");
    expect(ui).toContain("Somente a");
    expect(ui).toContain("reconciliação autorizada com o provedor");
  });
});
