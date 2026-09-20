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
