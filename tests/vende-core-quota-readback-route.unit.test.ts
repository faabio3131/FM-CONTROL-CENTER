import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),read:vi.fn(),config:vi.fn()}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",
  ()=>({resolveTenantContext:mocks.session}));
vi.mock("../src/application/billing/assistant-plan-outbox-dispatcher",
  ()=>({planProjectionConfigFromEnvironment:mocks.config}));
vi.mock("../src/application/billing/vende-core-quota-readback",
  ()=>({readVendeCoreQuotaEvidence:mocks.read}));
import {POST} from "../src/app/api/billing/products/[productId]/vende-compensation-intents/[intentId]/core-quota/route";
const productId="11111111-1111-4111-8111-111111111111";
const intentId="22222222-2222-4222-8222-222222222222";
const url="http://localhost/api/billing/products/"+productId+
  "/vende-compensation-intents/"+intentId+"/core-quota";
const params={params:Promise.resolve({productId,intentId})};
const post=(body:unknown)=>new Request(url,{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({tenantId:"fm",userId:"owner",role:"owner"});
  mocks.config.mockReturnValue({organizationId:"fm"});
  mocks.read.mockResolvedValue({intentId,unitId:"unit-a",
    capability:"atendimento_interpretacao",state:"core_unit_policy_verified",
    licenseFreshlyVerified:true,coreQuotaVerified:true,quotaMetrics:[],
    reservationCreated:false,providerCalled:false,allUnitsVerified:false,
    futureAiAdmissionGuaranteed:false,caseResolved:false});
});
describe("P01 FM Core quota proof API",()=>{
  it("requires the corporate session and explicit unit/capability",async()=>{
    const res=await POST(post({unitId:"unit-a",
      capability:"atendimento_interpretacao"}),params);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).caseResolved).toBe(false);
    expect(mocks.read).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm"}),
      {productId,intentId,unitId:"unit-a",capability:"atendimento_interpretacao"},
      expect.objectContaining({organizationId:"fm"}),
    );
  });
  it("denies arbitrary payment, tenant, unit or dispatch commands early",async()=>{
    for(const bad of [
      {unitId:"unit-a",capability:"atendimento_interpretacao",tenantId:"victim"},
      {unitId:"unit-a",capability:"atendimento_interpretacao",amountMinor:100},
      {unitId:"unit-a",capability:"atendimento_interpretacao",dispatch:true},
      {unitId:"../../foreign",capability:"atendimento_interpretacao"},
      {unitId:"unit-a",capability:"unknown"},
      {unitId:"",capability:"atendimento_transcricao"},
      {unitId:"x".repeat(130),capability:"atendimento_interpretacao"},
    ])expect((await POST(post(bad),params)).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("denies compromised authority and redacts Core secrets",async()=>{
    mocks.session.mockRejectedValueOnce(Error("CORPORATE_SECRET"));
    const denied=await POST(post({unitId:"unit-a",
      capability:"atendimento_interpretacao"}),params);
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain("CORPORATE_SECRET");
    mocks.read.mockRejectedValueOnce(Error("CORE_S2S_KEY"));
    const err=await POST(post({unitId:"unit-a",
      capability:"atendimento_interpretacao"}),params);
    expect(err.status).toBe(403);
    expect(await err.text()).not.toContain("CORE_S2S_KEY");
  });
  it("refuses malformed identifiers and oversized requests",async()=>{
    expect((await POST(new Request(url+"?tenant=other",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({unitId:"unit-a",capability:"atendimento_interpretacao"}),
    }),params)).status).toBe(400);
    expect((await POST(post({unitId:"unit-a",capability:"atendimento_interpretacao",
      padding:"x".repeat(3000)}),params)).status).toBe(400);
    expect((await POST(post({unitId:"unit-a",capability:"atendimento_interpretacao"}),{
      params:Promise.resolve({productId,intentId:"not-uuid"}),
    })).status).toBe(400);
  });
});
