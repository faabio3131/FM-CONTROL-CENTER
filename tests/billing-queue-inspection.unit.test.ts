import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BillingQueueInspectionService,
  type BillingQueueInspectionRepository, type GatewayEventQueueRecord, type IronOutboxQueueRecord,
} from "../src/application/billing/billing-queue-inspection-service";
import type { TenantContext } from "../src/domain/security/tenant-context";

const admin: TenantContext = { tenantId: "fm", userId: "owner", role: "owner", correlationId: "corr" };
const event: GatewayEventQueueRecord = {
  id: "event-id", gatewayAccountId: "account-id", eventType: "PAYMENT_UPDATED",
  status: "received", attempts: 0, lastErrorCode: null,
  receivedAt: new Date("2026-10-20T10:00:00Z"), updatedAt: new Date("2026-10-20T10:00:00Z"),
};
const outbox: IronOutboxQueueRecord = {
  id: "delivery-id", productId: "iron", eventType: "LICENSE_ACTIVATE",
  status: "retry", attempts: 1, lastErrorCode: "upstream_timeout",
  createdAt: new Date("2026-10-20T10:00:00Z"), updatedAt: new Date("2026-10-20T10:00:00Z"),
};
function fixture(events: GatewayEventQueueRecord[], outboxRows: IronOutboxQueueRecord[]) {
  const repository: BillingQueueInspectionRepository = {
    listGatewayEvents: vi.fn(async () => events),
    listIronOutbox: vi.fn(async () => outboxRows),
  };
  return { repository, service: new BillingQueueInspectionService(repository) };
}

describe("C03/C04 — leitura operacional das filas financeiras existentes", () => {
  it("uses authorized tenant on both queries and does not infer settlement", async () => {
    const { service, repository } = fixture([event], [outbox]);
    const result = await service.overview(admin);
    expect(repository.listGatewayEvents).toHaveBeenCalledWith("fm", 41);
    expect(repository.listIronOutbox).toHaveBeenCalledWith("fm", 41);
    expect(result.outbox[0].status).toBe("retry");
    expect(result.figuresAreFullQueueTotals).toBe(false);
    expect(result.anyProviderSettlementVerified).toBe(false);
  });

  it("marks truncated bounded samples separately instead of reporting total queue size", async () => {
    const { service } = fixture(Array(41).fill(event), Array(41).fill(outbox));
    const result = await service.overview(admin);
    expect(result.events).toHaveLength(40);
    expect(result.outbox).toHaveLength(40);
    expect(result.eventsTruncated).toBe(true);
    expect(result.outboxTruncated).toBe(true);
  });

  it("rejects unauthorized identity before reading either queue", async () => {
    const { service, repository } = fixture([event], [outbox]);
    await expect(service.overview({ ...admin, role: "viewer" }))
      .rejects.toThrow("security.permission_denied:billing:read");
    await expect(service.overview({ ...admin, tenantId: " " }))
      .rejects.toThrow("billing.tenant_scope_missing");
    expect(repository.listGatewayEvents).not.toHaveBeenCalled();
    expect(repository.listIronOutbox).not.toHaveBeenCalled();
  });

  it("keeps API read-only and repository tenant scoped without full gateway identifiers", () => {
    const src = (path: string) => readFileSync(resolve(path), "utf8");
    const api = src("src/app/api/billing/operations/route.ts");
    const sql = src("src/infrastructure/billing/postgres-billing-queue-inspection-repository.ts");
    const ui = src("src/app/dashboard/billing/operations/page.tsx");
    expect(api).toContain("resolveTenantContext(await headers())");
    expect(api).toContain('"Cache-Control": "no-store"');
    expect(api).not.toContain("export async function POST");
    expect(sql).toContain("eq(billingGatewayEvents.tenantId, tenantId)");
    expect(sql).toContain("eq(billingIronEntitlementOutbox.tenantId, tenantId)");
    expect(sql).not.toContain("externalPaymentId");
    expect(ui).toContain("Não foi possível consultar o banco");
  });
});
