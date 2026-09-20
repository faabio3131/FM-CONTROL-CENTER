import { describe, expect, it } from "vitest";
import { CoreGateway } from "@/application/core/core-gateway";
import type { MetricService } from "@/application/metrics/metric-service";
import type { CanonicalCoreClient } from "@/domain/core/contracts";
import type { TenantContext } from "@/domain/security/tenant-context";

const context: TenantContext = { tenantId: "tenant-b", userId: "user-b", role: "owner", correlationId: "corr-b" };

describe("F09 Core Gateway", () => {
  it("propaga tenant autoritativo e retorna evidence da Metric Authority", async () => {
    let plannedTenant = "";
    const core: CanonicalCoreClient = {
      async plan(input) { plannedTenant = input.tenantId; return { capability: "metric.query", arguments: { metricId: "billing.gross_billed" } }; },
      async synthesize(input) { return { answer: `R$ ${input.facts[0].value}`, evidence: input.evidence, factualStatus: "grounded" }; },
    };
    const metrics = {
      async query(received: TenantContext) {
        expect(received.tenantId).toBe("tenant-b");
        return { metricId: "billing.gross_billed", metricVersion: 1, value: "100", unit: "currency", currency: "BRL", computedAt: new Date(), sourceTimestamp: new Date(), freshnessStatus: "current", qualityStatus: "verified", sourceAuthority: "billing-authority", provenanceRefs: ["fact-1"] };
      },
    } as unknown as MetricService;
    const answer = await new CoreGateway(core, metrics).ask(context, "Quanto faturamos?");
    expect(plannedTenant).toBe("tenant-b");
    expect(answer).toMatchObject({ factualStatus: "grounded", evidence: [{ ref: "billing.gross_billed", sourceAuthority: "billing-authority" }] });
  });

  it("não inventa valor quando a métrica não existe", async () => {
    let synthesizeCalled = false;
    const core: CanonicalCoreClient = {
      async plan() { return { capability: "metric.query", arguments: { metricId: "revenue.cash_collected" } }; },
      async synthesize() { synthesizeCalled = true; throw new Error("should-not-run"); },
    };
    const metrics = { async query() { return null; } } as unknown as MetricService;
    const answer = await new CoreGateway(core, metrics).ask(context, "Quanto recebemos?");
    expect(answer.factualStatus).toBe("unavailable");
    expect(answer.answer).toContain("indisponível");
    expect(synthesizeCalled).toBe(false);
  });

  it("rejeita capability fora da allowlist", async () => {
    const core = {
      async plan() { return { capability: "payment.execute", arguments: {} }; },
      async synthesize() { throw new Error("should-not-run"); },
    } as unknown as CanonicalCoreClient;
    const metrics = {} as MetricService;
    await expect(new CoreGateway(core, metrics).ask(context, "Pague agora")).rejects.toThrow("core.capability_denied");
  });
});


  it("usa contexto operacional tenant/user scoped apenas como continuidade", async () => {
    let receivedContext: readonly unknown[] | undefined;
    const core: CanonicalCoreClient = {
      async plan(input) {
        receivedContext = input.operationalContext;
        return { capability: "metric.query", arguments: { metricId: "billing.gross_billed" } };
      },
      async synthesize(input) {
        expect(input.operationalContext?.[0]?.question).toBe("Quanto faturamos ontem?");
        return { answer: "R$ 100", evidence: input.evidence, factualStatus: "grounded" };
      },
    };
    const metrics = {
      async query() {
        return {
          metricId: "billing.gross_billed", metricVersion: 1, value: "100", unit: "currency", currency: "BRL",
          computedAt: new Date(), freshnessStatus: "fresh", qualityStatus: "verified",
          sourceAuthority: "billing-authority", provenanceRefs: ["fact-1"],
        };
      },
    } as unknown as MetricService;
    const contextReader = {
      async recent(input: { tenantId: string; userId: string }) {
        expect(input).toMatchObject({ tenantId: "tenant-b", userId: "user-b" });
        return [{
          question: "Quanto faturamos ontem?",
          answer: "R$ 90",
          factualStatus: "grounded" as const,
          evidenceRefs: ["billing.gross_billed"],
        }];
      },
    };

    await new CoreGateway(core, metrics, contextReader).ask(context, "E hoje?");
    expect(receivedContext).toHaveLength(1);
  });

  it("consulta múltiplas métricas governadas para correlação, anomalia, risco e recomendação", async () => {
    const requested: string[] = [];
    const core: CanonicalCoreClient = {
      async plan() {
        return {
          capability: "metrics.query_many",
          arguments: { metricIds: ["revenue.mrr", "subscription.churn_rate"] },
        };
      },
      async synthesize(input) {
        expect(input.facts).toHaveLength(2);
        expect(input.evidence.map((item) => item.ref)).toEqual(["revenue.mrr", "subscription.churn_rate"]);
        return {
          answer: "Os fatos governados permitem avaliar conjuntamente MRR e churn.",
          evidence: input.evidence,
          factualStatus: "grounded",
        };
      },
    };
    const metrics = {
      async query(_context: TenantContext, metricId: string) {
        requested.push(metricId);
        return {
          metricId, metricVersion: 1, value: metricId === "revenue.mrr" ? "1000" : "8",
          unit: metricId === "revenue.mrr" ? "currency" : "percent",
          currency: metricId === "revenue.mrr" ? "BRL" : undefined,
          computedAt: new Date(), freshnessStatus: "fresh", qualityStatus: "verified",
          sourceAuthority: "billing-authority", provenanceRefs: [`fact-${metricId}`],
        };
      },
    } as unknown as MetricService;

    const answer = await new CoreGateway(core, metrics).ask(context, "Há risco de churn afetando MRR?");
    expect(answer.factualStatus).toBe("grounded");
    expect(requested).toEqual(["revenue.mrr", "subscription.churn_rate"]);
  });

  it("rejeita conjunto multi-métrica inválido em vez de ampliar escopo livremente", async () => {
    const core: CanonicalCoreClient = {
      async plan() {
        return { capability: "metrics.query_many", arguments: { metricIds: ["revenue.mrr"] } };
      },
      async synthesize() { throw new Error("should-not-run"); },
    };
    const metrics = {} as MetricService;
    await expect(new CoreGateway(core, metrics).ask(context, "Compare")).rejects.toThrow("core.argument_invalid");
  });
