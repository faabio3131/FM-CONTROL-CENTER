import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({
  context:vi.fn(),session:vi.fn(),stepUp:vi.fn(),
  sync:vi.fn(),validate:vi.fn(),
}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",
  ()=>({resolveTenantContext:m.context}));
vi.mock("../src/infrastructure/auth/auth",
  ()=>({auth:{api:{getSession:m.session}}}));
vi.mock("../src/application/security/password-step-up",
  ()=>({verifyPasswordStepUp:m.stepUp}));
vi.mock("../src/application/billing/vende-core-provider-exports",
  ()=>({syncProviderExportFeed:m.sync,validateProviderFeedSyncRequest:m.validate}));
import {POST} from "../src/app/api/billing/products/[productId]/vende-core-finops/provider-feed-sync/route";
const productId="11111111-1111-4111-8111-111111111111";
const base="http://localhost/api/billing/products/"+productId+
  "/vende-core-finops/provider-feed-sync";
const params={params:Promise.resolve({productId})};
const data={
  externalTenantId:"customer-a",unitId:"unit-a",
  provider:"openai",accountRef:"fm-provider-account",
  startDate:"2026-10-01",endDate:"2026-10-23",
  page:0,limit:25,password:"test-secret",
};
const request=(body:unknown,url=base)=>new Request(url,{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify(body),
});
beforeEach(()=>{
  vi.resetAllMocks();
  m.context.mockResolvedValue({
    tenantId:"fm-corporate",userId:"fm-human",role:"owner",
  });
  m.session.mockResolvedValue({
    user:{id:"fm-human"},session:{id:"session-a"},
  });
  m.stepUp.mockResolvedValue({
    userId:"fm-human",verifiedAt:new Date(),
  });
  m.sync.mockResolvedValue({
    created:1,alreadyRecorded:0,unreported:0,scanned:1,
    nextPage:null,providerInvoiceVerified:false,quotaRecoveryAuthorized:false,
  });
});
describe("F9 provider feed sync corporate API boundary",()=>{
  it("sends trusted session and exact bounded scope to Core orchestrator",async()=>{
    const result=await POST(request(data),params);
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect((await result.json()).providerInvoiceVerified).toBe(false);
    expect(m.stepUp).toHaveBeenCalledWith(expect.any(Headers),"test-secret");
    expect(m.sync).toHaveBeenCalledWith(
      expect.objectContaining({userId:"fm-human",tenantId:"fm-corporate"}),
      expect.objectContaining({userId:"fm-human"}),"session-a",
      {productId,externalTenantId:"customer-a",unitId:"unit-a"},
      {provider:"openai",accountRef:"fm-provider-account",
        startDate:"2026-10-01",endDate:"2026-10-23",page:0,limit:25},
    );
  });
  it("refuses forged writes, cross scopes and extra body keys before login",async()=>{
    for(const item of [
      {...data,tenantId:"other"},{...data,refund:true},
      {...data,secret:"external-provider-key"},
      {...data,provider:"https://evil.example"},
      {...data,accountRef:"../foreign"},{...data,unitId:"../foreign"},
      {...data,password:""},{...data,password:"x".repeat(129)},
      {...data,page:"0"},{...data,limit:"25"},
      {...data,externalTenantId:""},
      {...data,amount:500},
    ])expect((await POST(request(item),params)).status).toBe(400);
    expect(m.stepUp).not.toHaveBeenCalled();
    expect(m.sync).not.toHaveBeenCalled();
    expect(m.context).not.toHaveBeenCalled();
  });
  it("rejects oversized payload, URL changes and invalid product IDs",async()=>{
    expect((await POST(request({...data,garbage:"x".repeat(3000)}),params))
      .status).toBe(400);
    expect((await POST(request(data,base+"?tenantId=foreign"),params))
      .status).toBe(400);
    expect((await POST(request(data),{
      params:Promise.resolve({productId:"not-a-uuid"}),
    })).status).toBe(400);
    expect(m.sync).not.toHaveBeenCalled();
  });
  it("blocks mismatched authenticated users and requires step-up",async()=>{
    m.session.mockResolvedValueOnce({
      user:{id:"foreign-user"},session:{id:"session-a"},
    });
    expect((await POST(request(data),params)).status).toBe(403);
    expect(m.stepUp).not.toHaveBeenCalled();
    expect(m.sync).not.toHaveBeenCalled();
    m.stepUp.mockRejectedValueOnce(Error("VERY_PRIVATE_PASSWORD"));
    const denied=await POST(request(data),params);
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain("VERY_PRIVATE_PASSWORD");
    expect(m.sync).not.toHaveBeenCalled();
  });
  it("fails closed without leaking Core provider secrets",async()=>{
    m.sync.mockRejectedValueOnce(Error("PRIVATE_CORE_TOKEN"));
    const res=await POST(request(data),params);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("PRIVATE_CORE_TOKEN");
  });
  it("rejects invalid provider date window if domain validation refuses",async()=>{
    m.validate.mockImplementationOnce(()=>{throw Error("bad period");});
    const res=await POST(request({...data,endDate:"2027-01-01"}),params);
    expect(res.status).toBe(400);
    expect(m.sync).not.toHaveBeenCalled();
  });
});
