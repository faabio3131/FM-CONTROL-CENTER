import { describe, expect, it, vi } from "vitest";
import {
  IronTrialPortfolioService,
  projectIronTrialPortfolio,
} from "@/application/customer/iron-trial-portfolio-service";
import {
  IRON_COMMERCIAL_SECRET_REF,
  IRON_COMMERCIAL_SOURCE_TYPE,
} from "@/infrastructure/integration/iron-commercial-connector";
import type { ProductRepository, ProductDefinition } from "@/domain/products/contracts";
import type { SourceRepository, SourceDefinition } from "@/domain/integration/contracts";
import type { TenantContext } from "@/domain/security/tenant-context";

const t = "fm-tenant-real", other = "other-fm-tenant";
const gymA = "d29f0dd5-0f3b-4c46-93b5-b5c18f53a073";
const gymB = "4ac6bd98-4a20-4c29-8ac5-b6213d46c8b4";
const subA = "0592a749-ab6c-4cbc-94d9-bdc5fca927b0";
const subB = "b3ef43ee-3fcf-49b1-882d-fb7cc7481d8f";
const product: ProductDefinition = { id:"product-iron", tenantId:t, slug:"iron", name:"IRON FIT CORE", status:"active" };
const source: SourceDefinition = {
  id:"source-iron", tenantId:t, productId:product.id, name:"IRON commercial",
  sourceType:IRON_COMMERCIAL_SOURCE_TYPE, authoritativeDomain:"commercial",
  status:"healthy", syncMode:"pull", secretRef:IRON_COMMERCIAL_SECRET_REF,
  mappingVersion:IRON_COMMERCIAL_SOURCE_TYPE, config:{baseUrl:"https://api.ironfitcore.com.br"},
  freshnessSeconds:300,
};
const context: TenantContext = {
  tenantId:t, userId:"fm-user", role:"owner", correlationId:"corr-iron-test",
};
function snapshot() {
  return {
    schema_version:"iron.fmcc.commercial.v1",
    product_code:"IRON_FIT_CORE",
    as_of:new Date().toISOString(),
    customers:[
      {tenant_id:gymA,name:"Academia A",active:true,created_at:"2026-11-10T12:00:00.000Z"},
      {tenant_id:gymB,name:"Academia B",active:true,created_at:"2026-11-11T12:00:00.000Z"},
    ],
    trials:[
      {external_id:"req-a",tenant_id:gymA,subscription_id:subA,status:"active",
        started_at:"2026-11-10T12:00:00.000Z",ends_at:"2026-12-10T12:00:00.000Z"},
      {external_id:"req-b",tenant_id:gymB,subscription_id:subB,status:"expired",
        started_at:"2026-11-11T12:00:00.000Z",ends_at:"2026-12-11T12:00:00.000Z"},
    ],
    subscriptions:[
      {external_id:subA,tenant_id:gymA,status:"ACTIVE",plan_code:"IRON_V1_TRIAL"},
      {external_id:subB,tenant_id:gymB,status:"SUSPENDED",plan_code:"IRON_V1_TRIAL"},
    ],
    entitlements:[],onboarding:[],billing_transactions:[],facts:[],
    summary:{customers:2,active_customers:2,active_trials:1},
    coverage:{tenant:"IRON_CANONICAL",trial:"IRON_CANONICAL"},
  };
}
function service(options?:{
  sources?: readonly SourceDefinition[];
  products?: readonly ProductDefinition[];
  snapshot?: ReturnType<typeof snapshot>;
  onSnapshot?: ReturnType<typeof vi.fn>;
}) {
  const products = {
    list: vi.fn(async() => options?.products ?? [product]),
  } as unknown as ProductRepository;
  const sources = {
    list: vi.fn(async() => options?.sources ?? [source]),
  } as unknown as SourceRepository;
  const readSnapshot = options?.onSnapshot ?? vi.fn(async()=>options?.snapshot ?? snapshot());
  return {reader:new IronTrialPortfolioService(products,sources,readSnapshot as never),readSnapshot,products,sources};
}
describe("IRON real Command trial portfolio, source-owned and isolated",()=>{
  it("projects every trial without billing and shows real source statuses", async()=>{
    const {reader,readSnapshot}=service();
    const value=await reader.read(context);
    expect(value.state).toBe("ready");
    if(value.state!=="ready")throw Error("Expected authoritative source");
    expect(value.total).toBe(2);
    expect(value.registeredAcademies).toBe(2);
    expect(value.activeTrialCount).toBe(1);
    expect(value.expiredTrialCount).toBe(1);
    expect(value.academies.map(x=>x.academyName)).toEqual(["Academia B","Academia A"]);
    expect(value.academies[0].subscriptionStatus).toBe("SUSPENDED");
    expect(value.sourceAuthority).toBe("IRON_CANONICAL");
    expect(JSON.stringify(value)).not.toContain("cnpj");
    expect(JSON.stringify(value)).not.toContain("email");
    expect(readSnapshot).toHaveBeenCalledOnce();
    expect(readSnapshot).toHaveBeenCalledWith({
      tenantId:t,correlationId:context.correlationId,timeoutMs:8000,
    },source);
  });

  it("distinguishes academies cadastradas de trials provisionados sem criar assinatura inexistente", () => {
    const payload=snapshot();
    payload.customers.push({
      tenant_id:"11111111-2222-4333-8444-555555555555",
      name:"Academia sem trial",active:true,created_at:"2026-11-11T15:00:00.000Z",
    });
    const result=projectIronTrialPortfolio(payload,source.id);
    expect(result.registeredAcademies).toBe(3);
    expect(result.total).toBe(2);
    expect(result.activeTrialCount).toBe(1);
    expect(result.expiredTrialCount).toBe(1);
  });

  it("never accesses another FM tenant's IRON source or another product",async()=>{
    const {reader,readSnapshot}=service();
    expect((await reader.read({...context,tenantId:other})).state).toBe("not_applicable");
    expect((await reader.read(context,"product-other")).state).toBe("not_applicable");
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  it("requires one existing, matched source and never invents a zero count", async()=>{
    for(const sources of [[],[{...source,tenantId:other}], [{...source,productId:"other"}],
      [{...source,secretRef:"env:FOREIGN_TOKEN"}], [source,source]]) {
      const {reader,readSnapshot}=service({sources});
      expect(await reader.read(context)).toEqual({state:"unavailable"});
      expect(readSnapshot).not.toHaveBeenCalled();
    }
  });

  it("rejects wrong product identity, mismatched tenant subscription and duplicate requests",()=>{
    const bad=snapshot();
    bad.product_code="NOT_IRON";
    expect(()=>projectIronTrialPortfolio(bad,source.id)).toThrow("iron.trial_source_invalid");
    const crossed=snapshot();crossed.trials[0].subscription_id=subB;
    expect(()=>projectIronTrialPortfolio(crossed,source.id)).toThrow("iron.trial_source_invalid");
    const duplicated=snapshot();duplicated.trials[1].external_id="req-a";
    expect(()=>projectIronTrialPortfolio(duplicated,source.id)).toThrow("iron.trial_source_invalid");
  });

  it("distinguishes unavailable upstream from genuine empty trial source",async()=>{
    const empty=snapshot();empty.customers=[];empty.trials=[];empty.subscriptions=[];
    expect(await service({snapshot:empty}).reader.read(context)).toMatchObject({
      state:"ready",total:0,registeredAcademies:0,activeTrialCount:0,expiredTrialCount:0,academies:[],pages:1,
    });
    const notAvailable=service({onSnapshot:vi.fn(async()=>{throw Error("upstream down")})});
    expect(await notAvailable.reader.read(context)).toEqual({state:"unavailable"});
  });

  it("rejects stale source and never exposes historical trial counts as current", async()=>{
    const stale=snapshot();stale.as_of="2026-01-01T00:00:00.000Z";
    expect(await service({snapshot:stale}).reader.read(context)).toEqual({state:"unavailable"});
  });

  it("paginates complete real academies, including page 2 instead of truncation",()=>{
    const batch=snapshot();batch.trials=[];batch.customers=[];batch.subscriptions=[];
    for(let i=1;i<=53;i++){
      const suffix=String(i).padStart(12,"0"), gym="00000000-0000-4000-8000-"+suffix;
      const subscription="10000000-0000-4000-8000-"+suffix;
      batch.customers.push({tenant_id:gym,name:"Academia "+i,active:true,created_at:"2026-11-10T12:00:00.000Z"});
      batch.subscriptions.push({external_id:subscription,tenant_id:gym,status:"ACTIVE",plan_code:"IRON_V1_TRIAL"});
      batch.trials.push({external_id:"req-"+i,tenant_id:gym,subscription_id:subscription,status:"active",
        started_at:"2026-11-10T12:00:00.000Z",ends_at:"2026-12-10T12:00:00.000Z"});
    }
    const page1=projectIronTrialPortfolio(batch,source.id);
    const page2=projectIronTrialPortfolio(batch,source.id,2);
    expect(page1.total).toBe(53);
    expect(page1.registeredAcademies).toBe(53);
    expect(page1.activeTrialCount).toBe(53);
    expect(page1.expiredTrialCount).toBe(0);
    expect(page2.activeTrialCount).toBe(53);
    expect(page1.academies).toHaveLength(50);
    expect(page2.academies).toHaveLength(3);
    expect(new Set([...page1.academies,...page2.academies].map(x=>x.gymId)).size).toBe(53);
  });

  it("allows the existing member role only within its verified FM tenant and source",async()=>{
    const {reader,readSnapshot}=service();
    const memberContext={...context,role:"member" as const};
    expect((await reader.read(memberContext)).state).toBe("ready");
    expect((await reader.read({...memberContext,tenantId:other})).state).toBe("not_applicable");
    expect(readSnapshot).toHaveBeenCalledOnce();
  });
});
