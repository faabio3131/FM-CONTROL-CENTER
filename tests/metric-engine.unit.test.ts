import { describe, expect, it } from "vitest";
import { computeMetric } from "@/domain/metrics/metric-engine";
import { getMetricDefinition } from "@/domain/metrics/registry";

describe("F08 deterministic Metric Engine", () => {
  it("mantém missing diferente de zero", () => {
    const definition = getMetricDefinition("trial.starts.count")!;
    expect(computeMetric(definition, [])).toMatchObject({ status: "missing", value: null, qualityStatus: "missing" });
  });

  it("conta IDs distintos determinísticamente", () => {
    const definition = getMetricDefinition("trial.starts.count")!;
    const ts = new Date("2026-09-20T00:00:00Z");
    const result = computeMetric(definition, [
      { id: "1", externalId: "trial-1", factType: "trial.started", payload: {}, sourceTimestamp: ts, provenanceRef: "p1" },
      { id: "2", externalId: "trial-1", factType: "trial.started", payload: {}, sourceTimestamp: ts, provenanceRef: "p2" },
      { id: "3", externalId: "trial-2", factType: "trial.started", payload: {}, sourceTimestamp: ts, provenanceRef: "p3" },
    ]);
    expect(result).toMatchObject({ status: "available", value: "2", unit: "count" });
  });

  it("recusa somar moedas diferentes sem política FX", () => {
    const definition = getMetricDefinition("billing.gross_billed")!;
    const ts = new Date("2026-09-20T00:00:00Z");
    expect(() => computeMetric(definition, [
      { id: "1", externalId: "i1", factType: "billing.invoice", payload: { amount: 10, currency: "BRL" }, sourceTimestamp: ts, provenanceRef: "p1" },
      { id: "2", externalId: "i2", factType: "billing.invoice", payload: { amount: 5, currency: "USD" }, sourceTimestamp: ts, provenanceRef: "p2" },
    ])).toThrow("metrics.fx_policy_required");
  });

  it("não transforma valor inválido em zero", () => {
    const definition = getMetricDefinition("billing.gross_billed")!;
    const result = computeMetric(definition, [
      { id: "1", externalId: "i1", factType: "billing.invoice", payload: { amount: "unknown", currency: "BRL" }, sourceTimestamp: new Date(), provenanceRef: "p1" },
    ]);
    expect(result).toMatchObject({ status: "missing", value: null });
  });
});
