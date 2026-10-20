import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BillingCustomerBindingRegisterService, type BillingCustomerBindingRegisterRepository,
  type BillingCustomerBindingRecord,
} from "../src/application/billing/billing-customer-binding-register-service";
import type { TenantContext } from "../src/domain/security/tenant-context";

const ctx: TenantContext = {
  tenantId: "fm-tenant", userId: "owner", role: "owner", correlationId: "corr",
};
const binding: BillingCustomerBindingRecord = {
  customerId: "customer-1", externalCustomerId: "provider-customer-1",
  productId: "iron", externalTenantId: "academy-1",
  createdAt: new Date("2026-10-19T12:00:00Z"),
};

function fixture(rows: BillingCustomerBindingRecord[]) {
  const repository: BillingCustomerBindingRegisterRepository = {
    list: vi.fn(async () => rows),
  };
  return { repository, service: new BillingCustomerBindingRegisterService(repository) };
}

describe("C02: FMCC customer bindings read-only", () => {
  it("derives tenant only from context, enforces bounded query and source authority", async () => {
    const { repository, service } = fixture([binding]);
    const result = await service.list(ctx, "iron");
    expect(repository.list).toHaveBeenCalledWith("fm-tenant", "iron", 101);
    expect(result.authority).toBe("fmcc_billing_customer_binding");
    expect(result.items[0].externalTenantId).toBe("academy-1");
  });

  it("marks truncated results without inventing a full customer count", async () => {
    const rows = Array.from({ length: 101 }, (_, n) =>
      ({ ...binding, customerId: String(n) }));
    const { service } = fixture(rows);
    const result = await service.list(ctx);
    expect(result.items).toHaveLength(100);
    expect(result.truncated).toBe(true);
  });

  it("rejects role without financial read and missing identity tenant before query", async () => {
    const { repository, service } = fixture([binding]);
    await expect(service.list({ ...ctx, role: "viewer" }))
      .rejects.toThrow("security.permission_denied:billing:read");
    await expect(service.list({ ...ctx, tenantId: " " }))
      .rejects.toThrow("billing.tenant_scope_missing");
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("has server product authorization, tenant-fenced join and no mutations", () => {
    const route = readFileSync(resolve("src/app/api/billing/customers/route.ts"), "utf8");
    const sql = readFileSync(resolve("src/infrastructure/billing/postgres-billing-customer-binding-register-repository.ts"), "utf8");
    expect(route).toContain("ProductRegistryService");
    expect(route).toContain('requirePermission(context, "billing:read")');
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(sql).toContain("eq(billingCustomerBindings.tenantId, tenantId)");
    expect(sql).toContain("eq(billingCustomers.tenantId, billingCustomerBindings.tenantId)");
    expect(sql).toContain("eq(billingCustomers.id, billingCustomerBindings.customerId)");
    expect(route).not.toContain("export async function POST");
  });
});
