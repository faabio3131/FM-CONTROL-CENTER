import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { C08ReadinessService } from "@/application/integration/c08-readiness-service";
import type { SourceRepository, SyncOperationalReader, SourceDefinition } from "@/domain/integration/contracts";
import type { ProductRepository, ProductDefinition } from "@/domain/products/contracts";
import type { TenantContext } from "@/domain/security/tenant-context";

const context: TenantContext = { tenantId: "fm", userId: "operator", role: "owner", correlationId: "test" };
const product: ProductDefinition = { id: "iron", tenantId: "fm", slug: "iron", name: "IRON", status: "active" };
const source: SourceDefinition = {
  id: "source", tenantId: "fm", productId: "iron", name: "IRON Commercial",
  sourceType: "iron-commercial-v1", authoritativeDomain: "commercial",
  status: "configured", syncMode: "pull", secretRef: "env:SECRET_REAL_NEVER_SENT",
  mappingVersion: "iron-commercial-v1", freshnessSeconds: 300,
  config: { baseUrl: "https://private.example.test" },
};

function fakes(foreign = false) {
  const products: ProductRepository = {
    findById: vi.fn(async()=>null), findBySlug: vi.fn(async()=>null),
    create: vi.fn(async()=>product),
    list: vi.fn(async (_tenantId:string) => foreign ? [{ ...product, tenantId: "foreign" }] : [product]),
  };
  const sources: SourceRepository = {
    findById: vi.fn(async()=>null), create: vi.fn(async()=>source),
    list: vi.fn(async (_tenantId:string) => foreign ? [{ ...source, tenantId: "foreign" }] : [source]),
  };
  const sync: SyncOperationalReader = {
    operationalState: vi.fn(async () => ({lastSuccessfulAt:new Date("2026-10-20T11:59:00Z") })),
  };
  return { products, sources, sync, service:new C08ReadinessService(products,sources,sync) };
}
const now = new Date("2026-10-20T12:00:00Z");
describe("C08 integration readiness API service security", () => {
  it("derives tenant exclusively from authenticated context and never exposes secrets/URLs",async()=>{
    const { products,sources,sync,service }=fakes();
    const result=await service.snapshot(context,now);
    expect(products.list).toHaveBeenCalledWith("fm");
    expect(sources.list).toHaveBeenCalledWith("fm");
    expect(sync.operationalState).toHaveBeenCalledWith("fm","source");
    expect(result.rows[0].state).toBe("sync_recent");
    expect(result.rows[0].authenticatedSaasE2eCertified).toBe(false);
    expect(JSON.stringify(result)).not.toContain("SECRET_REAL_NEVER_SENT");
    expect(JSON.stringify(result)).not.toContain("private.example.test");
  });
  it("rejects users lacking either registry permission before fetching records",async()=>{
    const {service,sources,products}=fakes();
    await expect(service.snapshot({...context,role:"viewer"},now)).rejects.toThrow("security.permission_denied");
    expect(sources.list).not.toHaveBeenCalled();
    expect(products.list).not.toHaveBeenCalled();
  });
  it("does not return rows or call foreign source sync when a repository returns the wrong tenant",async()=>{
    const {service,sync}=fakes(true);
    const result=await service.snapshot(context,now);
    expect(result.rows).toHaveLength(0);
    expect(sync.operationalState).not.toHaveBeenCalled();
    expect(result.certifiedIntegrations).toBeNull();
  });
  it("enforces explicit capacity instead of silently omitting sources",async()=>{
    const {service,sources}=fakes();
    vi.mocked(sources.list).mockResolvedValue(Array(257).fill(source));
    await expect(service.snapshot(context,now)).rejects.toThrow("integration.c08_snapshot_capacity_unverified");
  });
  it("uses session-only identity, no-store and fail-unavailable HTTP semantics",()=>{
    const route=readFileSync(resolve("src/app/api/integrations/readiness/route.ts"),"utf8");
    expect(route).toContain("resolveTenantContext(await headers())");
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).toContain('status: 503');
    expect(route).not.toContain("export async function POST");
    expect(route).not.toContain("x-tenant-id");
    expect(route).not.toContain("source.secretRef");
  });
});
