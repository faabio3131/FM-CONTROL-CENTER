import { describe, expect, it, vi } from "vitest";
import type { SourceDefinition, ConnectorContext } from "@/domain/integration/contracts";
import { NfcoreCognitiveConnector, NfcoreConnectorError, NFCORE_COGNITIVE_SOURCE_TYPE, NFCORE_COGNITIVE_SECRET_REF, parseNfcoreMetricsEnvelope } from "@/infrastructure/integration/nfcore-cognitive-connector";
import { profileForProductSlug } from "@/application/integration/saas-adapter-profiles";

const context: ConnectorContext = {tenantId:"fm-control",correlationId:"corr-001",timeoutMs:2500};
const source: SourceDefinition = {
 id:"s-1", tenantId:"fm-control", productId:"nfcore-product", name:"NFCore",
 sourceType:NFCORE_COGNITIVE_SOURCE_TYPE, authoritativeDomain:"cognitive",
 status:"configured",syncMode:"pull",secretRef:NFCORE_COGNITIVE_SECRET_REF,
 config:{baseUrl:"https://api.nfcore.com.br"}, mappingVersion:NFCORE_COGNITIVE_SOURCE_TYPE,
};
const snapshot = () => ({
 schemaVersion:"nfcore.cognitive.metrics/v1",mappingVersion:"1",productId:"nfcore",
 source:"nfcore.cognitive",correlationId:"corr-001",observedAt:"2026-11-06T14:00:00Z",
 freshness:{scope:"process",semantics:"monotonic_counters_since"},
 provenance:{authority:"nfcore-cognitive-core",deterministicCounters:true},
 aiEnabled:true,
 facts:{since:"2026-11-06T13:00:00Z",lastObservedAt:"2026-11-06T13:59:59Z",
 requests:{total:100,byStatus:{ok:100}},model:{calls:50,inputTokens:100000,outputTokens:50000,costReportedCalls:0,costMicroBrl:null},
 tenants:{"tenant-private-1":{requests:10}},prompt:"NEVER INGEST"},
});
describe("C08 NFCore cognitive connector isolated from legacy Kordena",() => {
 it("has dedicated profile but no claim of live certification",() => {
   const profile=profileForProductSlug("nfcore");
   expect(profile?.sourceType).toBe(NFCORE_COGNITIVE_SOURCE_TYPE);
   expect(profile?.authoritativeDomain).toBe("cognitive");
   expect(profile?.secretRef).toBe(NFCORE_COGNITIVE_SECRET_REF);
 });
 it("validates provenance, counters and never imports per-tenant payloads",() => {
   const parsed=parseNfcoreMetricsEnvelope(snapshot(),"corr-001");
   expect(parsed.facts).toHaveLength(1);
   expect(parsed.facts[0].factType).toBe("nfcore.cognitive.process_snapshot");
   const text=JSON.stringify(parsed.facts);
   expect(text).not.toContain("tenant-private-1");
   expect(text).not.toContain("NEVER INGEST");
   expect(text).toContain('"inputTokens":100000');
 });
 it("does not invent finance, MRR or billable usage from process counters",() => {
   const p=parseNfcoreMetricsEnvelope(snapshot(),"corr-001");
   expect(p.facts[0].factType).not.toMatch(/billing|revenue|subscription/);
   expect(p.facts[0].payload).not.toHaveProperty("mrr");
   expect(p.facts[0].payload).not.toHaveProperty("planId");
 });
 it("is stable for repeated unchanged data despite new request timestamp",() => {
   const one=snapshot(),two=snapshot();two.observedAt="2026-11-06T14:00:10Z";
   const a=parseNfcoreMetricsEnvelope(one,"corr-001");
   const b=parseNfcoreMetricsEnvelope(two,"corr-001");
   expect(a.cursor).toBe(b.cursor);
 });
 it("fails closed on forged response correlation, wrong values and process timeline",() => {
   expect(() => parseNfcoreMetricsEnvelope(snapshot(),"other")).toThrow();
   const t=snapshot();t.facts.model.calls=101;
   expect(() => parseNfcoreMetricsEnvelope(t,"corr-001")).toThrow();
   const q=snapshot();q.facts.lastObservedAt="2026-11-09T00:00:00Z";
   expect(() => parseNfcoreMetricsEnvelope(q,"corr-001")).toThrow();
 });
 it("requires exact controller tenant, HTTPS origin, typed source and secret", async () => {
   const fetcher=vi.fn(async () => new Response(JSON.stringify(snapshot()),{status:200}));
   const client=new NfcoreCognitiveConnector(()=> "x".repeat(40),fetcher as unknown as typeof fetch,
     ()=>["https://api.nfcore.com.br"],()=> "fm-control");
   const rows=await client.pull(context,source);
   expect(rows.facts).toHaveLength(1);
   expect(fetcher).toHaveBeenCalledTimes(1);
   const init=fetcher.mock.calls[0] as unknown as [string,RequestInit];
   expect(init[0]).toBe("https://api.nfcore.com.br/v1/command/cognitive/metrics");
   expect((init[1].headers as Record<string,string>).authorization).toBe("Bearer "+"x".repeat(40));
   await expect(client.pull({...context,tenantId:"another"},source)).rejects.toThrow("nfcore.scope_denied");
   await expect(client.pull(context,{...source,config:{baseUrl:"http://api.nfcore.com.br"}})).rejects.toThrow("nfcore.url_insecure");
   await expect(client.pull(context,{...source,config:{baseUrl:"https://evil.example"}})).rejects.toThrow("nfcore.origin_not_allowed");
   await expect(client.pull(context,{...source,sourceType:"kordena-commercial-v1"})).rejects.toThrow("nfcore.scope_denied");
   await expect(client.pull(context,{...source,secretRef:"env:FMCC_KORDENA_TOKEN"})).rejects.toThrow("nfcore.scope_denied");
   expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it("fails closed before parsing a response exceeding 64 KiB", async () => {
   const oversized={...snapshot(), padding:"x".repeat(70000)};
   const fetcher=vi.fn(async()=>new Response(JSON.stringify(oversized), {status:200}));
   const connector=new NfcoreCognitiveConnector(
     ()=>"x".repeat(40), fetcher as unknown as typeof fetch,
     ()=>["https://api.nfcore.com.br"], ()=>"fm-control",
   );
   await expect(connector.pull(context,source)).rejects.toThrow("nfcore.response_too_large");
   expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it("times out stalled response body even after HTTP headers arrive", async () => {
   const stream = new ReadableStream<Uint8Array>({
     start(controller) {
       controller.enqueue(new TextEncoder().encode('{"schemaVersion":'));
       // Deliberately never finish or close. Header response succeeds immediately.
     },
   });
   const fetcher = vi.fn(async () => new Response(stream, { status: 200 }));
   const client = new NfcoreCognitiveConnector(
     () => "x".repeat(40), fetcher as unknown as typeof fetch,
     () => ["https://api.nfcore.com.br"], () => "fm-control",
   );
   await expect(client.pull({ ...context, timeoutMs: 150 }, source))
     .rejects.toThrow("nfcore.transport_timeout");
   expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it("times out stalled header retrieval even when fetch ignores AbortSignal", async () => {
   const fetcher = vi.fn(async (): Promise<Response> => new Promise(() => {}));
   const client = new NfcoreCognitiveConnector(
     () => "x".repeat(40), fetcher as unknown as typeof fetch,
     () => ["https://api.nfcore.com.br"], () => "fm-control",
   );
   await expect(client.pull({ ...context, timeoutMs: 150 }, source))
     .rejects.toThrow("nfcore.transport_timeout");
 });
 it("never returns a healthy state if the provider is unauthenticated",async() => {
   const c=new NfcoreCognitiveConnector(()=>undefined,vi.fn() as unknown as typeof fetch,
     ()=>["https://api.nfcore.com.br"],()=>"fm-control");
   expect(await c.health(context,source)).toBe("unavailable");
 });
});
