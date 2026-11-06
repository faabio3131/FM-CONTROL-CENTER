import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ConnectorPullResult } from "@/domain/integration/contracts";
import { projectNfcoreCognitiveCoverage } from "@/application/integration/nfcore-cognitive-coverage";

function sample(): ConnectorPullResult {
  return { facts: [{
    externalId: "s1",
    factType: "nfcore.cognitive.process_snapshot",
    sourceTimestamp: new Date("2026-11-06T17:00:00Z"),
    payload: {
      since: "2026-11-06T16:00:00Z", lastObservedAt: "2026-11-06T17:00:00Z",
      aiEnabled: true, requests: 12, modelCalls: 5, inputTokens: 100,
      outputTokens: 44, costReportedCalls: 0, costMicroBrl: null,
      freshnessScope: "process", authority: "nfcore-cognitive-core",
      tenants: { "private-tenant": { requests: 100 } },
      prompts: ["never expose"],
    },
  }] };
}
describe("NFCore C08 cognitive coverage, no commercial fabrication", () => {
  it("shows process metrics without copying private payload and without inventing cost", () => {
    const x = projectNfcoreCognitiveCoverage(sample());
    expect(x.source).toBe("nfcore-cognitive-metrics-v1");
    expect(x.freshnessScope).toBe("process");
    expect(x.metrics.find(m => m.code === "requests")?.value).toBe(12);
    expect(x.metrics.find(m => m.code === "costMicroBrl")?.value).toBeNull();
    expect(x.completeIntegrationCertified).toBe(false);
    const output=JSON.stringify(x);
    expect(output).not.toContain("private-tenant");
    expect(output).not.toContain("never expose");
    expect(output).not.toContain("mrr");
  });
  it("rejects wrong authority, counters and missing snapshot", () => {
    expect(() => projectNfcoreCognitiveCoverage({ facts: [] })).toThrow();
    const s=sample();
    const bad: ConnectorPullResult = {facts: [{...s.facts[0],payload: {...s.facts[0].payload,authority:"untrusted"}}]};
    expect(() => projectNfcoreCognitiveCoverage(bad)).toThrow();
    const counters: ConnectorPullResult = {facts:[{...s.facts[0], payload:{...s.facts[0].payload,modelCalls:50}}]};
    expect(() => projectNfcoreCognitiveCoverage(counters)).toThrow();
  });
  it("shows zero requests as zero but absent costs as unknown", () => {
    const s=sample();
    const zero: ConnectorPullResult={facts:[{...s.facts[0],payload:{
      ...s.facts[0].payload,requests:0,modelCalls:0, inputTokens:0,outputTokens:0,
      costReportedCalls:0,costMicroBrl:null,lastObservedAt:null,aiEnabled:false,
    }}]};
    const x=projectNfcoreCognitiveCoverage(zero);
    expect(x.metrics.find(m=>m.code==="requests")?.value).toBe(0);
    expect(x.metrics.find(m=>m.code==="costMicroBrl")?.value).toBeNull();
  });
  it("requires owner/admin, metric permission, tenant/product and validated connector", () => {
    const text=readFileSync(resolve(process.cwd(),"src/app/api/sources/[sourceId]/cognitive-coverage/route.ts"),"utf8");
    expect(text).toContain('requirePermission(context, "metric:read")');
    expect(text).toContain('requirePermission(context, "source:read")');
    expect(text).toContain('requirePermission(context, "integration:read")');
    expect(text).toContain('context.role !== "owner" && context.role !== "admin"');
    expect(text).toContain("source.tenantId !== context.tenantId");
    expect(text).toContain("sourceMatchesAdapter");
    expect(text).toContain('product.slug !== "nfcore"');
    expect(text).toContain("buildNfcoreCognitiveConnector().pull");
    expect(text).toContain('"cache-control": "no-store');
  });
  it("adds a separate NFCore control, preserving Kordena and IRON commercial coverage", () => {
    const ui=readFileSync(resolve(process.cwd(),"src/app/dashboard/sources/source-control-panel.tsx"),"utf8");
    expect(ui).toContain("Ver cobertura cognitiva");
    expect(ui).toContain("Ver cobertura comercial");
    expect(ui).toContain("nfcore-cognitive-metrics-v1");
    expect(ui).toContain("Custos ausentes não significam custo zero");
  });
});
