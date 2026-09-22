import { describe, expect, it } from "vitest";
import { CoreArgumentError, CoreGateway } from "@/application/core/core-gateway";
import { FmccVerticalCognitiveCore } from "@/application/core/fmcc-vertical-cognitive-core";
import type { MetricService } from "@/application/metrics/metric-service";
import type { CognitiveModel } from "@/domain/core/cognitive-model";
import type { CoreOperationalContext } from "@/domain/core/contracts";
import type { ProductDefinition, ProductRepository } from "@/domain/products/contracts";
import type { TenantContext } from "@/domain/security/tenant-context";

const context: TenantContext = { tenantId: "tenant-b", userId: "user-b", role: "owner", correlationId: "corr-b" };

const productRows: ProductDefinition[] = [
  { id: "p-kordena", tenantId: "tenant-b", slug: "kordena", name: "Kordena", status: "active" },
  { id: "p-iron", tenantId: "tenant-b", slug: "iron", name: "IRON", status: "active" },
  { id: "p-inactive", tenantId: "tenant-b", slug: "legacy", name: "Legacy", status: "inactive" },
  { id: "p-foreign", tenantId: "tenant-foreign", slug: "foreign", name: "Foreign", status: "active" },
];

function productRepo(): ProductRepository {
  return {
    async findById(tenantId, productId) { return productRows.find((p) => p.tenantId === tenantId && p.id === productId) ?? null; },
    async findBySlug(tenantId, slug) { return productRows.find((p) => p.tenantId === tenantId && p.slug === slug) ?? null; },
    async list(tenantId) { return productRows.filter((p) => p.tenantId === tenantId); },
    async create() { throw new Error("unused"); },
  };
}

function model(metricIds: readonly string[], answer = "Resposta governada"): CognitiveModel {
  return {
    async plan(input) {
      expect(input.metricCatalog.length).toBeGreaterThan(0);
      return { metricIds };
    },
    async synthesize(input) {
      expect(input.evidence.length).toBe(input.facts.length);
      return answer;
    },
  };
}

function metric(metricId: string, productId?: string, value = "100") {
  return {
    productId, metricId, metricVersion: 1, value, unit: "currency", currency: "BRL",
    computedAt: new Date(), sourceTimestamp: new Date(), freshnessStatus: "fresh", qualityStatus: "verified",
    sourceAuthority: "billing-authority", provenanceRefs: [`fact-${productId ?? "global"}-${metricId}`],
  };
}

describe("F09/F11 FMCC Vertical Cognitive Core", () => {
  it("usa o Metric Engine como autoridade factual", async () => {
    const metrics = {
      async query(received: TenantContext) {
        expect(received.tenantId).toBe("tenant-b");
        return metric("billing.gross_billed");
      },
    } as unknown as MetricService;

    const answer = await new CoreGateway(
      new FmccVerticalCognitiveCore(model(["billing.gross_billed"], "Faturamento governado: R$ 100")),
      metrics,
    ).ask(context, "Quanto faturamos?");

    expect(answer).toMatchObject({
      factualStatus: "grounded",
      evidence: [{ ref: "billing.gross_billed", sourceAuthority: "billing-authority" }],
    });
  });

  it("não inventa valor quando a métrica não existe", async () => {
    let synthesisCalled = false;
    const cognitiveModel: CognitiveModel = {
      async plan() { return { metricIds: ["revenue.cash_collected"] }; },
      async synthesize() { synthesisCalled = true; return "não deveria"; },
    };
    const metrics = { async query() { return null; } } as unknown as MetricService;

    const answer = await new CoreGateway(new FmccVerticalCognitiveCore(cognitiveModel), metrics)
      .ask(context, "Quanto recebemos?");

    expect(answer.factualStatus).toBe("unavailable");
    expect(answer.answer).toContain("indisponíveis");
    expect(synthesisCalled).toBe(false);
  });

  it("usa memória operacional tenant/user scoped apenas como continuidade", async () => {
    let receivedContext: readonly CoreOperationalContext[] = [];
    const cognitiveModel: CognitiveModel = {
      async plan(input) {
        receivedContext = input.operationalContext;
        return { metricIds: ["billing.gross_billed"] };
      },
      async synthesize() { return "R$ 100"; },
    };
    const metrics = { async query() { return metric("billing.gross_billed"); } } as unknown as MetricService;
    const contextReader = {
      async recent(input: { tenantId: string; userId: string }) {
        expect(input).toMatchObject({ tenantId: "tenant-b", userId: "user-b" });
        return [{
          question: "Quanto faturamos ontem?", answer: "R$ 90", factualStatus: "grounded" as const,
          evidenceRefs: ["billing.gross_billed"],
        }];
      },
    };

    await new CoreGateway(new FmccVerticalCognitiveCore(cognitiveModel), metrics, contextReader).ask(context, "E hoje?");
    expect(receivedContext).toHaveLength(1);
  });

  it("consulta múltiplas métricas governadas para correlação, anomalia, risco e recomendação", async () => {
    const requested: string[] = [];
    const metrics = {
      async query(_context: TenantContext, metricId: string) {
        requested.push(metricId);
        return metric(metricId, undefined, metricId === "billing.gross_billed" ? "1000" : "800");
      },
    } as unknown as MetricService;

    const answer = await new CoreGateway(
      new FmccVerticalCognitiveCore(model(["billing.gross_billed", "revenue.cash_collected"])),
      metrics,
    ).ask(context, "Existe diferença relevante entre faturado e recebido?");

    expect(answer.factualStatus).toBe("grounded");
    expect(requested).toEqual(["billing.gross_billed", "revenue.cash_collected"]);
  });

  it("resolve produto único somente a partir do catálogo autorizado do tenant", async () => {
    let productCatalog: readonly { slug: string; name: string }[] = [];
    const cognitiveModel: CognitiveModel = {
      async plan(input) {
        productCatalog = input.productCatalog ?? [];
        return { metricIds: ["billing.gross_billed"], productSlugs: ["kordena"] };
      },
      async synthesize(input) {
        expect(input.facts[0]).toMatchObject({ productId: "p-kordena", productSlug: "kordena", value: "100" });
        return "Kordena: faturamento governado disponível.";
      },
    };
    const requestedProducts: Array<string | undefined> = [];
    const metrics = {
      async query(_context: TenantContext, metricId: string, productId?: string) {
        requestedProducts.push(productId);
        return metric(metricId, productId);
      },
    } as unknown as MetricService;

    const answer = await new CoreGateway(
      new FmccVerticalCognitiveCore(cognitiveModel), metrics, undefined, productRepo(),
    ).ask(context, "Como está o faturamento do Kordena?");

    expect(productCatalog).toEqual([
      { slug: "kordena", name: "Kordena" },
      { slug: "iron", name: "IRON" },
    ]);
    expect(requestedProducts).toEqual(["p-kordena"]);
    expect(answer.evidence[0]).toMatchObject({ productId: "p-kordena", productSlug: "kordena" });
  });

  it("consulta múltiplos produtos autorizados sem cruzar tenant", async () => {
    const requested: Array<{ metricId: string; productId?: string }> = [];
    const cognitiveModel: CognitiveModel = {
      async plan() { return { metricIds: ["billing.gross_billed"], productSlugs: ["kordena", "iron"] }; },
      async synthesize(input) {
        expect(input.facts).toHaveLength(2);
        return "Comparação governada.";
      },
    };
    const metrics = {
      async query(_context: TenantContext, metricId: string, productId?: string) {
        requested.push({ metricId, productId });
        return metric(metricId, productId, productId === "p-kordena" ? "100" : "80");
      },
    } as unknown as MetricService;

    const answer = await new CoreGateway(
      new FmccVerticalCognitiveCore(cognitiveModel), metrics, undefined, productRepo(),
    ).ask(context, "Compare faturamento do Kordena e IRON.");

    expect(requested).toEqual([
      { metricId: "billing.gross_billed", productId: "p-kordena" },
      { metricId: "billing.gross_billed", productId: "p-iron" },
    ]);
    expect(answer.evidence.map((item) => item.productSlug)).toEqual(["kordena", "iron"]);
  });

  it("falha fechado quando o plano tenta usar produto não autorizado", async () => {
    const cognitiveModel: CognitiveModel = {
      async plan() { return { metricIds: ["billing.gross_billed"], productSlugs: ["foreign"] }; },
      async synthesize() { return "não deveria"; },
    };
    const metrics = { async query() { return metric("billing.gross_billed"); } } as unknown as MetricService;

    await expect(new CoreGateway(
      new FmccVerticalCognitiveCore(cognitiveModel), metrics, undefined, productRepo(),
    ).ask(context, "Consulte foreign")).rejects.toBeInstanceOf(CoreArgumentError);
  });
});
