import { describe, expect, it, vi } from "vitest";
import { BillingSubscriptionRegisterService, type BillingSubscriptionRegisterRepository, type BillingSubscriptionRecord } from "../src/application/billing/billing-subscription-register-service";
import type { TenantContext } from "../src/domain/security/tenant-context";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const owner: TenantContext = { tenantId: "tenant-a", userId: "u1", role: "owner", correlationId: "corr" };
const row: BillingSubscriptionRecord = {
  subscriptionId: "subscription-a", customerId: "customer-a", productId: "product-a",
  externalTenantId: "academy-a", planCode: "IRON_V1", status: "pending",
  createdAt: new Date("2026-10-19T10:00:00Z"),
};

function setup(rows: BillingSubscriptionRecord[]) {
  const repository: BillingSubscriptionRegisterRepository = {
    list: vi.fn(async () => rows),
  };
  return { repository, service: new BillingSubscriptionRegisterService(repository) };
}

describe("C02 — cadastro de assinaturas FMCC read-only", () => {
  it("derives tenant only from authorized identity and limits the query", async () => {
    const { repository, service } = setup([row]);
    const result = await service.list(owner, "product-a");
    expect(repository.list).toHaveBeenCalledWith("tenant-a", "product-a", 101);
    expect(result.authority).toBe("fmcc_billing_subscription");
    expect(result.items[0].status).toBe("pending");
  });

  it("does not claim completeness for a bounded page", async () => {
    const { service } = setup(Array.from({ length: 101 }, (_, n) =>
      ({ ...row, subscriptionId: String(n) })));
    const result = await service.list(owner);
    expect(result.items).toHaveLength(100);
    expect(result.truncated).toBe(true);
    expect(result.limit).toBe(100);
  });

  it("rejects access without billing:read and fails closed without tenant", async () => {
    const { repository, service } = setup([row]);
    await expect(service.list({ ...owner, role: "viewer" }, "product-a"))
      .rejects.toThrow("security.permission_denied:billing:read");
    expect(repository.list).not.toHaveBeenCalled();
    await expect(service.list({ ...owner, tenantId: " " })).rejects.toThrow("billing.tenant_scope_missing");
  });

  it("requires product authorization, tenant-first SQL and excludes mutations", () => {
    const api = readFileSync(resolve("src/app/api/billing/subscriptions/route.ts"), "utf8");
    const sql = readFileSync(resolve("src/infrastructure/billing/postgres-billing-subscription-register-repository.ts"), "utf8");
    expect(api).toContain("ProductRegistryService");
    expect(api).toContain('requirePermission(context, "billing:read")');
    expect(sql).toContain("eq(billingSubscriptions.tenantId, tenantId)");
    expect(sql).toContain("eq(billingCustomerBindings.tenantId, billingSubscriptions.tenantId)");
    expect(api).not.toContain("export async function POST");
  });
});
