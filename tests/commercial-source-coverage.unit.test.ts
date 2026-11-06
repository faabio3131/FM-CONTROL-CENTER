import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectCommercialCoverage } from "@/application/integration/commercial-source-coverage";
import type { KordenaCommercialSnapshot } from "@/infrastructure/integration/kordena-commercial-connector";
import type { IronCommercialSnapshot } from "@/infrastructure/integration/iron-commercial-connector";

function kordena(): KordenaCommercialSnapshot {
  return {
    schema_version: "kordena.fmcc.commercial.v1", product_code: "KORDENA",
    as_of: "2026-11-06T17:00:00Z",
    customers: [{ email: "private@example.com" }, { email: "private2@example.com" }],
    product_accounts: [{ legalName: "private ltd" }],
    trials: [{ id: "trial-private" }], subscriptions: [{ id: "subscription-private" }],
    billing_transactions: [], entitlements: [{ secret: "do-not-copy" }],
    catalog: [{ secret: "catalog-secret" }],
    summary: {
      customers: 2, internal_test_customers: 0,
      active_trials: 1, active_subscriptions: 1,
      past_due_subscriptions: 0, suspended_subscriptions: 0,
      confirmed_payments: 0, failed_payments: 0,
      reconciled_transactions: 0, users: 7, units: 2,
    },
    facts: [
      { external_id:"trial:1",fact_type:"trial.started",payload:{email:"personal@private.test"},source_timestamp:"2026-11-06T17:00:00Z" },
      { external_id:"subscription:1",fact_type:"subscription.active",payload:{name:"Private"},source_timestamp:"2026-11-06T17:00:00Z" },
    ],
    coverage: {
      mrr:"pending_governed_semantics",
      arr:"pending_governed_semantics",
    },
  };
}
function iron(): IronCommercialSnapshot {
  return {
    schema_version:"iron.fmcc.commercial.v1",product_code:"IRON_FIT_CORE",
    as_of:"2026-11-06T18:00:00Z",
    customers:Array.from({length:8},(_,i)=>({name:"PERSONAL-CUSTOMER-"+i})),
    trials:[{requestId:"SECRET-TRIAL"}],
    subscriptions:[{planCode:"SECRET-PLAN"}],
    entitlements:[{policy:"PRIVATE"}],
    onboarding:[{step:"NEVER_COPY"}],
    billing_transactions:[],
    facts:Array.from({length:8},(_,i)=>({
      external_id:"tenant:"+i,fact_type:"iron.tenant",
      payload:{email:"PRIVATE"},source_timestamp:"2026-11-06T18:00:00Z",
    })),
    summary:{customers:8,active_customers:8,active_trials:1,active_subscriptions:1,suspended_subscriptions:0,canceled_subscriptions:0},
    coverage:{billing_transactions:"FM_COMMAND_AUTHORITY"},
  };
}
describe("C08 commercial coverage — truthful facts vs business collections",()=>{
  it("Kordena has two facts but seven independent snapshot collections",()=>{
    const x=projectCommercialCoverage("kordena-commercial-v1",kordena());
    expect(x.snapshotFactCount).toBe(2);
    expect(x.collections).toHaveLength(7);
    expect(x.collections.find(c=>c.code==="customers")?.reportedRecords).toBe(2);
    expect(x.collections.find(c=>c.code==="entitlements")?.reportedRecords).toBe(1);
    expect(x.summary.find(c=>c.code==="active_trials")?.count).toBe(1);
    expect(x.completeIntegrationCertified).toBe(false);
    expect(x.additionalTelemetry).toBe("not_in_this_snapshot");
    for(const secret of ["private@example.com","trial-private","do-not-copy","catalog-secret"]){
      expect(JSON.stringify(x)).not.toContain(secret);
    }
  });
  it("IRON 8 facts do not imply 8 features, payment authority remains Command",()=>{
    const x=projectCommercialCoverage("iron-commercial-v1",iron());
    expect(x.snapshotFactCount).toBe(8);
    expect(x.collections).toHaveLength(6);
    expect(x.collections.find(c=>c.code==="billing_transactions")).toMatchObject({
      reportedRecords:0,authority:"fm-command",
    });
    expect(x.billingFromFmCommand).toBe(true);
    expect(x.completeIntegrationCertified).toBe(false);
    expect(x.summary.find(c=>c.code==="active_subscriptions")?.count).toBe(1);
    expect(JSON.stringify(x)).not.toContain("PERSONAL-CUSTOMER");
    expect(JSON.stringify(x)).not.toContain("PRIVATE");
    expect(JSON.stringify(x)).not.toContain("SECRET");
  });
  it("rejects mismatched provider contract and impossible negative/NaN summary",()=>{
    expect(()=>projectCommercialCoverage("kordena-commercial-v1",iron())).toThrow("integration.commercial_coverage_contract_mismatch");
    const x=kordena();
    const bad={...x,summary:{...x.summary,customers:-3}};
    expect(()=>projectCommercialCoverage("kordena-commercial-v1",bad)).toThrow("integration.commercial_coverage_count_invalid");
    const bad2={...x,summary:{...x.summary,users:NaN}};
    expect(()=>projectCommercialCoverage("kordena-commercial-v1",bad2)).toThrow();
  });
  it("observability is optional, reported only when the canonical snapshot provides it",()=>{
    const x=kordena();
    const observable={...x,observability:{schema_version:"kordena.observability.kca13.v1",as_of:x.as_of,internal_test_excluded:true,
      metrics:{},antiabuse:{},health:{},finops:{},alerts:[],tracing:{},coverage:{}}} as KordenaCommercialSnapshot;
    expect(projectCommercialCoverage("kordena-commercial-v1",observable).additionalTelemetry).toBe("reported");
    expect(projectCommercialCoverage("kordena-commercial-v1",x).additionalTelemetry).toBe("not_in_this_snapshot");
  });
  it("server-side read route requires authenticated owner/admin and product scope",()=>{
    const path=resolve(process.cwd(),"src/app/api/sources/[sourceId]/coverage/route.ts");
    const route=readFileSync(path,"utf8");
    expect(route).toContain('requirePermission(context, "source:read")');
    expect(route).toContain('requirePermission(context, "commercial:read")');
    expect(route).toContain('requirePermission(context, "integration:read")');
    expect(route).toContain('context.role !== "owner" && context.role !== "admin"');
    expect(route).toContain("product.slug !== profile.productSlug");
    expect(route).toContain("source.tenantId !== context.tenantId");
    expect(route).toContain("Cache-Control".toLowerCase());
    expect(route).not.toContain("NextResponse.json({ snapshot");
  });
  it("UI no longer calls attempted facts inserted records or certified features",()=>{
    const ui=readFileSync(resolve(process.cwd(),"src/app/dashboard/sources/source-control-panel.tsx"),"utf8");
    expect(ui).toContain("Ver cobertura comercial");
    expect(ui).toContain("fato(s) recebido(s) para processamento");
    expect(ui).toContain("Os conjuntos abaixo são lidos diretamente do SaaS");
    expect(ui).not.toContain("fato(s) canônico(s) ingerido(s)");
  });
});
