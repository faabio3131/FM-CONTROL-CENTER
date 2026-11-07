import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyCustomerCountQuestion, CustomerSnapshotQueryService,
  type CommercialCustomerSnapshot, type CustomerSnapshotReaders,
} from "@/application/core/customer-snapshot-query";
import type { ProductDefinition, ProductRepository } from "@/domain/products/contracts";
import type { SourceDefinition, SourceRepository } from "@/domain/integration/contracts";
import type { TenantContext } from "@/domain/security/tenant-context";

const current = new Date("2026-11-07T00:30:00.000Z");
const context: TenantContext = { tenantId: "org-a", userId: "u1", role: "owner", correlationId: "cc-1" };
const products: ProductDefinition[] = [
  { id: "k", tenantId: "org-a", name: "Kordena", slug: "kordena", status: "active" },
  { id: "i", tenantId: "org-a", name: "IRON FIT", slug: "iron", status: "active" },
  { id: "n", tenantId: "org-a", name: "NFCore", slug: "nfcore", status: "active" },
  { id: "foreign", tenantId: "org-b", name: "Other", slug: "other", status: "active" },
];
const sources: SourceDefinition[] = [
  { id: "source-k", tenantId: "org-a", productId: "k", name: "Kordena",
    sourceType: "kordena-commercial-v1", authoritativeDomain: "commercial", status: "healthy",
    syncMode: "pull", secretRef: "env:FMCC_KORDENA_CONTROL_PLANE_TOKEN", config: {}, mappingVersion: "kordena-commercial-v1", freshnessSeconds: 300 },
  { id: "source-i", tenantId: "org-a", productId: "i", name: "IRON",
    sourceType: "iron-commercial-v1", authoritativeDomain: "commercial", status: "healthy",
    syncMode: "pull", secretRef: "env:FMCC_IRON_CONTROL_PLANE_TOKEN", config: {}, mappingVersion: "iron-commercial-v1", freshnessSeconds: 300 },
];
function productRepo(): ProductRepository {
  return {
    async list(tenant) { expect(tenant).toBe("org-a"); return products; },
    async findById() { return null; }, async findBySlug() { return null; },
    async create() { throw new Error("not called"); },
  };
}
function sourceRepo(rows: readonly SourceDefinition[] = sources): SourceRepository {
  return {
    async list(tenant) { expect(tenant).toBe("org-a"); return rows; },
    async findById() { return null; }, async create() { throw new Error("not called"); },
  };
}
function snapshot(schema: string, product: string, summary: Record<string, number>, asOf = "2026-11-07T00:29:40.000Z"): CommercialCustomerSnapshot {
  return { schema_version: schema, product_code: product, as_of: asOf, summary };
}
function readers(
  kordena: CommercialCustomerSnapshot = snapshot("kordena.fmcc.commercial.v1", "KORDENA", { customers: 3, active_subscriptions: 0 }),
  iron: CommercialCustomerSnapshot = snapshot("iron.fmcc.commercial.v1", "IRON_FIT_CORE", { customers: 4, active_customers: 4 }),
): CustomerSnapshotReaders {
  return {
    "kordena-commercial-v1": vi.fn(async () => kordena),
    "iron-commercial-v1": vi.fn(async () => iron),
  };
}
function service(inputReaders: CustomerSnapshotReaders = readers(), inputSources: readonly SourceDefinition[] = sources) {
  return new CustomerSnapshotQueryService(productRepo(), sourceRepo(inputSources), inputReaders, () => current);
}

describe("Core direct registered/active customer readback", () => {
  it("detects client-count questions but never subscription-count questions", () => {
    expect(classifyCustomerCountQuestion("Quantos clientes ativos temos hoje?")).toBe("active");
    expect(classifyCustomerCountQuestion("Qual o número de academias ativas?")).toBe("active");
    expect(classifyCustomerCountQuestion("Qual o total de clientes cadastrados?")).toBe("registered");
    expect(classifyCustomerCountQuestion("Quantas assinaturas ativas temos?")).toBeNull();
    expect(classifyCustomerCountQuestion("Quantas assinaturas de clientes ativos?")).toBeNull();
    expect(classifyCustomerCountQuestion("Qual faturamento mensal?")).toBeNull();
  });

  it("reads actual available IRON active academies without treating Kordena registered customers or subscriptions as active", async () => {
    const r = readers(); const answer = await service(r).answer(context, "Quantos clientes ativos temos hoje?", {kind:"active"});
    expect(answer.factualStatus).toBe("grounded");
    expect(answer.answer).toContain("IRON FIT: 4 academias");
    expect(answer.answer).toContain("Kordena: clientes ativos não informados");
    expect(answer.answer).toContain("3 clientes cadastrados");
    expect(answer.answer).toContain("NFCore: contrato de clientes não integrado");
    expect(answer.answer).toContain("Não é possível afirmar um total único");
    expect(answer.answer).not.toContain("Assinaturas ativas: 0");
    expect(answer.evidence.map(e => e.ref)).toContain("iron.fmcc.commercial.v1");
    expect(r["iron-commercial-v1"]).toHaveBeenCalledWith(
      {tenantId:"org-a",correlationId:"cc-1",timeoutMs:8000},sources[1]);
  });

  it("uses selected SaaS only, supports registered customers and zero as real zero", async () => {
    const r=readers(
      snapshot("kordena.fmcc.commercial.v1","KORDENA",{customers:3, active_customers:0}),
      snapshot("iron.fmcc.commercial.v1","IRON_FIT_CORE",{customers:4,active_customers:4}),
    );
    const a=await service(r).answer(context,"Quantos clientes ativos no Kordena?",{kind:"active"});
    expect(a.answer).toContain("Kordena: 0 clientes ativos");
    expect(a.answer).not.toContain("IRON FIT:");
    expect(r["iron-commercial-v1"]).not.toHaveBeenCalled();
    const b=await service(r).answer(context,"Quantos clientes cadastrados temos?",{kind:"registered",productSlugs:["kordena"]});
    expect(b.answer).toContain("Kordena: 3 clientes cadastrados");
    expect(b.answer).not.toContain("IRON FIT:");
  });

  it("rejects foreign or excessive explicit scope; does not call external readers", async () => {
    const r=readers(); const s=service(r);
    await expect(s.answer(context,"Quantos clientes ativos?",{kind:"active",productSlugs:["other"]})).rejects.toThrow();
    await expect(s.answer(context,"Quantos clientes ativos?",{kind:"active",productSlugs:["kordena","kordena"]})).rejects.toThrow();
    expect(r["kordena-commercial-v1"]).not.toHaveBeenCalled();
  });

  it("ignores foreign-tenant or improperly bound source", async () => {
    const r=readers();
    const bad=[{...sources[0],tenantId:"org-b"},{...sources[1],secretRef:"env:OTHER"}];
    const a=await service(r,bad).answer(context,"Quantos clientes ativos temos?",{kind:"active"});
    expect(a.factualStatus).toBe("unavailable");
    expect(a.answer).toContain("consulta indisponível");
    expect(r["iron-commercial-v1"]).not.toHaveBeenCalled();
  });

  it("does not present old or invalid counters as live customer counts", async () => {
    const r=readers(
      snapshot("kordena.fmcc.commercial.v1","KORDENA",{customers:3},"2026-11-06T22:00:00.000Z"),
      snapshot("iron.fmcc.commercial.v1","IRON_FIT_CORE",{customers:4,active_customers:3.5}),
    );
    const a=await service(r).answer(context,"Quantos clientes ativos temos?",{kind:"active"});
    expect(a.factualStatus).toBe("unavailable");
    expect(a.answer).toContain("dados antigos");
    expect(a.answer).toContain("resposta inválida");
    expect(a.evidence.some(e => e.freshnessStatus==="stale")).toBe(true);
  });

  it("preserves unknown when only registered count exists and upstream fails", async () => {
    const r=readers();
    r["iron-commercial-v1"]=vi.fn(async () => { throw new Error("secret-private-value"); });
    const a=await service(r).answer(context,"Quantos clientes ativos temos?",{kind:"active"});
    expect(a.factualStatus).toBe("unavailable");
    expect(a.answer).toContain("3 clientes cadastrados");
    expect(JSON.stringify(a)).not.toContain("secret-private-value");
  });

  it("routes client counts before the model, retains model for all other questions", () => {
    const route=readFileSync(resolve(process.cwd(),"src/app/api/core/query/route.ts"),"utf8");
    expect(route).toContain("classifyCustomerCountQuestion(body.question)");
    expect(route).toContain("buildCustomerSnapshotQueryService().answer");
    expect(route).toContain("buildCoreGateway().ask");
  });
});
