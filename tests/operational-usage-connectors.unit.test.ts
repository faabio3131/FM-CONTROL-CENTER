import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ConnectorContext, SourceDefinition } from "@/domain/integration/contracts";
import {
  IRON_USAGE_SECRET_REF, IRON_USAGE_SOURCE_TYPE, IronUsageConnector,
  parseIronUsageSnapshot,
} from "@/infrastructure/integration/iron-usage-connector";
import {
  NFCORE_OPERATIONAL_USAGE_SECRET_REF, NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE,
  NfcoreOperationalUsageConnector, parseNfcoreOperationalUsageSnapshot,
} from "@/infrastructure/integration/nfcore-operational-usage-connector";
import { projectOperationalUsageCoverage } from "@/application/integration/operational-usage-coverage";
import { SAAS_ADAPTER_PROFILES, sourceMatchesAdapter, profileForSourceType } from "@/application/integration/saas-adapter-profiles";

const ctx: ConnectorContext = { tenantId:"fm-control",correlationId:"corr-usage-7",timeoutMs:2000 };
const approved = "https://iron.example.test";
const nfcore = "https://nfcore.example.test";
function source(type: "iron" | "nfcore"): SourceDefinition {
  const iron = type === "iron";
  const id = iron ? IRON_USAGE_SOURCE_TYPE : NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE;
  return {
    id:iron?"iron-usage":"nfcore-usage", tenantId:ctx.tenantId,
    productId:iron?"iron-product":"nfcore-product",name:id,
    sourceType:id, authoritativeDomain:"operational-usage",status:"configured",
    syncMode:"pull", secretRef:iron?IRON_USAGE_SECRET_REF:NFCORE_OPERATIONAL_USAGE_SECRET_REF,
    mappingVersion:id, config:{baseUrl:iron?approved:nfcore},
  };
}
const settings = (key:string) => ({
  FMCC_IRON_CONTROL_TENANT_ID:"fm-control",
  FMCC_NFCORE_CONTROL_TENANT_ID:"fm-control",
  FMCC_IRON_ALLOWED_ORIGINS:approved,
  FMCC_NFCORE_ALLOWED_ORIGINS:nfcore,
})[key as keyof {
  FMCC_IRON_CONTROL_TENANT_ID:string;
  FMCC_NFCORE_CONTROL_TENANT_ID:string;
  FMCC_IRON_ALLOWED_ORIGINS:string;
  FMCC_NFCORE_ALLOWED_ORIGINS:string;
}];
const token=()=> "x".repeat(40);
function ironSnapshot() {
  return {
    schema_version:"iron.fmcc.ai-usage.v1",product_code:"IRON_FIT_CORE",
    as_of:"2026-11-06T20:00:00Z",window_start:"2026-10-07T20:00:00Z",
    window_days:30,metric:"ai_execution_trace_count",
    usage:[
      { tenant_id:"private-gym-1",capability:"PLAN",provider_code:"p1",
        model_code:"m1",status:"COMPLETED",execution_count:3 },
      { tenant_id:"private-gym-2",capability:"PLAN",provider_code:"p1",
        model_code:"m1",status:"COMPLETED",execution_count:2 },
    ],
    unavailable_metrics:["input_tokens","output_tokens","provider_cost_minor"],
    provenance:{
      source:"IRON_CANONICAL_AI_EXECUTION_TRACE",
      calculation:"GROUP_BY_TENANT_CAPABILITY_PROVIDER_MODEL_STATUS",
      commercial_authority:"FM_COMMAND",
    },
  };
}
function nfcoreSnapshot() {
  const as_of="2026-11-06T20:00:00+00:00";
  const summary={subscriptions_with_quotas:1,metrics_reported:2,metrics_unavailable:1};
  const payload={as_of, ...summary};
  const canonical='{"as_of": '+JSON.stringify(as_of)+
    ', "metrics_reported": 2, "metrics_unavailable": 1, "subscriptions_with_quotas": 1}';
  const digest=createHash("sha256").update(canonical).digest("hex");
  return {
    schema_version:"nfcore.fmcc.operational-usage.v1",product_code:"NFCORE",as_of,
    correlationId:"corr-usage-7",
    provenance:{authority:"nfcore-operational-usage-core",readOnly:true},
    consumption:[{
      subscription_id:"private-sub-1",tenant_id:"private-tenant-1",
      plan_id:"private-plan-1",status:"active",
      metrics:[
        {metric_id:"invoice_documents",limit:100,used:12,unavailable:false},
        {metric_id:"consultations",limit:50,used:null,unavailable:true},
      ],
    }],
    summary,
    facts:[{
      external_id:"nfcore-operational-usage-v1:"+digest,
      fact_type:"nfcore.operational_usage.snapshot",payload,source_timestamp:as_of,
    }],
  };
}
function iron(fetcher:typeof fetch, s=settings) {
  return new IronUsageConnector(token,fetcher,s);
}
function nf(fetcher:typeof fetch, s=settings) {
  return new NfcoreOperationalUsageConnector(token,fetcher,s);
}
describe("C08 real S2S operational usage read models", () => {
  it("registers independent operational-usage profiles without mixing other domains", () => {
    expect(SAAS_ADAPTER_PROFILES.filter(p=>p.authoritativeDomain==="operational-usage").map(p=>p.sourceType).sort())
      .toEqual(["iron-usage-v1","nfcore-operational-usage-v1"]);
    for (const type of [IRON_USAGE_SOURCE_TYPE,NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE]) {
      const profile=profileForSourceType(type);
      expect(profile).toBeDefined();
      expect(profile?.authoritativeDomain).toBe("operational-usage");
      expect(sourceMatchesAdapter(source(type==="iron-usage-v1"?"iron":"nfcore"),profile!)).toBe(true);
    }
    expect(sourceMatchesAdapter({...source("iron"),authoritativeDomain:"commercial"},profileForSourceType(IRON_USAGE_SOURCE_TYPE)!)).toBe(false);
    expect("pull" in iron(vi.fn() as unknown as typeof fetch)).toBe(false);
    expect("pull" in nf(vi.fn() as unknown as typeof fetch)).toBe(false);
  });
  it("reads exact IRON v1 via GET, dedicated bearer, correlation and fixed 30-day window",async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify(ironSnapshot()),{status:200}));
    const result=await iron(fetcher as typeof fetch).snapshot(ctx,source("iron"));
    expect(result.usage).toHaveLength(2);
    expect(result.unavailable_metrics).toContain("provider_cost_minor");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe(approved+"/api/v1/control-plane/fmcc/usage/ai?days=30");
    expect(init).toMatchObject({method:"GET",redirect:"error",cache:"no-store"});
    expect(init.headers).toMatchObject({
      authorization:"Bearer "+"x".repeat(40),"x-correlation-id":"corr-usage-7",
    });
  });
  it("rejects wrong IRON schema, product, provenance, missing metrics and negative counts",()=>{
    for(const change of [
      {schema_version:"bad"},
      {product_code:"OTHER"},
      {metric:"tokens"},
      {unavailable_metrics:[]},
      {usage:[{...ironSnapshot().usage[0],execution_count:-1}]},
      {provenance:{source:"UNKNOWN",calculation:"invalid",commercial_authority:"FM_COMMAND"}},
    ]) {
      expect(()=>parseIronUsageSnapshot({...ironSnapshot(),...change})).toThrow();
    }
  });
  it("projects IRON counts without exposing gym IDs or any unavailable measurement as zero",()=>{
    const output=projectOperationalUsageCoverage(IRON_USAGE_SOURCE_TYPE,parseIronUsageSnapshot(ironSnapshot()));
    expect(output.summary.find(x=>x.code==="executions")?.count).toBe(5);
    expect(output.groups).toHaveLength(1);
    expect(output.groups[0]).toMatchObject({measured:5,limit:null});
    const json=JSON.stringify(output);
    expect(json).not.toContain("private-gym");
    expect(json).not.toContain("provider_cost_minor");
    expect(json).not.toContain("input_tokens");
    expect(output.measurementKind).toBe("execution_count");
  });
  it("reads validated NFCore quota usage, deterministic fact and source correlation",async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify(nfcoreSnapshot()),{status:200}));
    const report=await nf(fetcher as typeof fetch).snapshot(ctx,source("nfcore"));
    expect(report.summary).toEqual(nfcoreSnapshot().summary);
    expect(report.consumption[0].metrics[1]).toMatchObject({used:null,unavailable:true});
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe(nfcore+"/v1/command/operational-usage/snapshot");
    expect(init).toMatchObject({method:"GET",redirect:"error",cache:"no-store"});
    expect(init.headers).toMatchObject({
      authorization:"Bearer "+"x".repeat(40),"x-correlation-id":"corr-usage-7",
    });
  });
  it("preserves quota unknown as null and rejects inconsistent NFCore totals",()=>{
    const snapshot=parseNfcoreOperationalUsageSnapshot(nfcoreSnapshot(),"corr-usage-7");
    const report=projectOperationalUsageCoverage(NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE,snapshot);
    const unknown=report.groups.find(x=>x.label==="consultations");
    expect(unknown).toMatchObject({limit:50,measured:null,missingMeasurements:1});
    expect(report.groups.find(x=>x.label==="invoice_documents")).toMatchObject({limit:100,measured:12});
    expect(report.summary.find(x=>x.code==="metrics_unavailable")?.count).toBe(1);
    const json=JSON.stringify(report);
    expect(json).not.toContain("private-sub");
    expect(json).not.toContain("private-tenant");
    expect(json).not.toContain("private-plan");
    expect(json).not.toContain("correlationId");
    expect(report.completeIntegrationCertified).toBe(false);
  });
  it("rejects mismatched correlation, schema, product, forged fact, summary and fabricated measurement",()=>{
    const original=nfcoreSnapshot();
    const cases:unknown[]=[
      {...original,schema_version:"bad"},
      {...original,product_code:"OTHER"},
      {...original,correlationId:"forged"},
      {...original,summary:{...original.summary,metrics_reported:3}},
      {...original,facts:[{...original.facts[0],external_id:"nfcore-operational-usage-v1:forged"}]},
      {...original,consumption:[{...original.consumption[0],metrics:[
        {...original.consumption[0].metrics[0],used:0,unavailable:true},
      ]}]},
      {...original,amount:300},
    ];
    for(const item of cases) {
      expect(()=>parseNfcoreOperationalUsageSnapshot(item,"corr-usage-7")).toThrow();
    }
  });
  it("fails closed before any HTTP on wrong tenant, binding, origin and correlation",async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify(ironSnapshot()),{status:200}));
    const client=iron(fetcher as typeof fetch);
    await expect(client.snapshot({...ctx,tenantId:"other"},source("iron"))).rejects.toThrow("operational_usage.scope_denied");
    await expect(client.snapshot(ctx,{...source("iron"),sourceType:"iron-commercial-v1"})).rejects.toThrow("operational_usage.scope_denied");
    await expect(client.snapshot(ctx,{...source("iron"),authoritativeDomain:"commercial"})).rejects.toThrow("operational_usage.scope_denied");
    await expect(client.snapshot(ctx,{...source("iron"),secretRef:"env:OTHER_TOKEN"})).rejects.toThrow("operational_usage.scope_denied");
    await expect(client.snapshot({...ctx,correlationId:"wrong\nheader"},source("iron"))).rejects.toThrow("operational_usage.context_invalid");
    await expect(client.snapshot(ctx,{...source("iron"),config:{baseUrl:"http://iron.example.test"}})).rejects.toThrow("operational_usage.url_insecure");
    await expect(client.snapshot(ctx,{...source("iron"),config:{baseUrl:"https://evil.example.test"}})).rejects.toThrow("operational_usage.origin_denied");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never accepts secret absence, cross-origin redirects, provider 401 or body oversized",async()=>{
    const valid=source("nfcore");
    await expect(new NfcoreOperationalUsageConnector(
      ()=>undefined,vi.fn() as unknown as typeof fetch,settings,
    ).snapshot(ctx,valid)).rejects.toThrow("operational_usage.secret_unavailable");
    const fail=vi.fn(async()=>new Response("{}",{status:401}));
    await expect(nf(fail as typeof fetch).snapshot(ctx,valid)).rejects.toThrow("operational_usage.upstream_denied");
    const oversize=vi.fn(async()=>new Response("x".repeat(1_048_577),{status:200}));
    await expect(nf(oversize as typeof fetch).snapshot(ctx,valid)).rejects.toThrow("operational_usage.response_too_large");
    expect(oversize).toHaveBeenCalledTimes(1);
  });
  it("does not treat a 503 or stalled body as healthy",async()=>{
    const retry=vi.fn(async()=>new Response("{}",{status:503}));
    expect(await nf(retry as typeof fetch).health(ctx,source("nfcore"))).toBe("unavailable");
    const stream=new ReadableStream<Uint8Array>({
      start(controller){controller.enqueue(new TextEncoder().encode('{"schema_version":'));}
    });
    const hung=vi.fn(async()=>new Response(stream,{status:200}));
    await expect(nf(hung as typeof fetch).snapshot({...ctx,timeoutMs:100},source("nfcore"))).rejects.toThrow("operational_usage.timeout");
  });
  it("enforces server-side auth/tenant binding and independent UI lifecycle",()=>{
    const route=readFileSync(resolve(process.cwd(),"src/app/api/sources/[sourceId]/usage/route.ts"),"utf8");
    const ui=readFileSync(resolve(process.cwd(),"src/app/dashboard/sources/source-control-panel.tsx"),"utf8");
    for(const check of [
      'requirePermission(context, "source:read")',
      'requirePermission(context, "integration:read")',
      'requirePermission(context, "metric:read")',
      'context.role !== "owner" && context.role !== "admin"',
      'sourceMatchesAdapter(source, profile)',
      'source.tenantId !== context.tenantId',
      'product.slug !== profile.productSlug',
      '"cache-control": "no-store',
    ]) expect(route).toContain(check);
    expect(ui).toContain("Ver consumo operacional");
    expect(ui).toContain('closeCoverage(source.id, "operational")');
    expect(ui).toContain("Fechar consumo operacional de");
    expect(ui).toContain('source.authoritativeDomain !== "operational-usage"');
    expect(ui).toContain("Ver cobertura comercial");
    expect(ui).toContain("Ver cobertura cognitiva");
  });
});
