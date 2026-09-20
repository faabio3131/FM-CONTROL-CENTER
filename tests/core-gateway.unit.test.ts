import { describe, expect, it } from "vitest";
import { CoreGateway } from "@/application/core/core-gateway";
import { FmccVerticalCognitiveCore } from "@/application/core/fmcc-vertical-cognitive-core";
import type { MetricService } from "@/application/metrics/metric-service";
import type { CognitiveModel } from "@/domain/core/cognitive-model";
import type { TenantContext } from "@/domain/security/tenant-context";

const context: TenantContext = { tenantId: "tenant-b", userId: "user-b", role: "owner", correlationId: "corr-b" };

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

describe("F09 FMCC Vertical Cognitive Core", () => {
  it("usa o Metric Engine como autoridade factual", async () => {
    const metrics = {
      async query(received: TenantContext) {
        expect(received.tenantId).toBe("tenant-b");
        return {
          metricId: "billing.gross_billed", metricVersion: 1, value: "100", unit: "currency", currency: "BRL",
          computedAt: new Date(), sourceTimestamp: new Date(), freshnessStatus: "current", qualityStatus: "verified",
          sourceAuthority: "billing-authority", provenanceRefs: ["fact-1"],
        };
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
    let receivedContext: readonly Record<string, unknown>[] = [];
    const cognitiveModel: CognitiveModel = {
      async plan(input) {
        receivedContext = input.operationalContext;
        return { metricIds: ["billing.gross_billed"] };
      },
      async synthesize() { return "R$ 100"; },
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

    await new CoreGateway(new FmccVerticalCognitiveCore(cognitiveModel), metrics, contextReader).ask(context, "E hoje?");
    expect(receivedContext).toHaveLength(1);
  });

  it("consulta múltiplas métricas governadas para correlação, anomalia, risco e recomendação", async () => {
    const requested: string[] = [];
    const metrics = {
      async query(_context: TenantContext, metricId: string) {
        requested.push(metricId);
        return {
          metricId, metricVersion: 1, value: metricId === "billing.gross_billed" ? "1000" : "800",
          unit: "currency", currency: "BRL", computedAt: new Date(), freshnessStatus: "fresh",
          qualityStatus: "verified", sourceAuthority: "finance", provenanceRefs: [`fact-${metricId}`],
        };
      },
    } as unknown as MetricService;

    const answer = await new CoreGateway(
      new FmccVerticalCognitiveCore(model(["billing.gross_billed", "revenue.cash_collected"])),
      metrics,
    ).ask(context, "Existe diferença relevante entre faturado e recebido?");

    expect(answer.factualStatus).toBe("grounded");
    expect(requested).toEqual(["billing.gross_billed", "revenue.cash_collected"]);
  });
});
