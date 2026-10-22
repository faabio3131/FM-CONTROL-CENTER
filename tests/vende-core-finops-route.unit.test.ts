import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),read:vi.fn()}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",
  ()=>({resolveTenantContext:mocks.session}));
vi.mock("../src/application/billing/vende-core-finops-reader",
  ()=>({readVendeCoreFinops:mocks.read}));
import {POST} from "../src/app/api/billing/products/[productId]/vende-core-finops/route";
const productId="11111111-1111-4111-8111-111111111111";
const url="http://localhost/api/billing/products/"+productId+"/vende-core-finops";
const params={params:Promise.resolve({productId})};
const request=(body:unknown)=>new Request(url,{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const input={externalTenantId:"customer-a",unitId:"unit-a",
  startDate:"2026-10-01",endDate:"2026-10-22"};
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({tenantId:"fm",userId:"owner",role:"owner"});
  mocks.read.mockResolvedValue({schema:"fm.core.finops.read.v1",
    tenant_id:"customer-a",unit_id:"unit-a",buckets:[],
    known_attempts:0,unknown_attempts:0,coverage:"no_observations",
    internal_fm_cost_only:true,actual_provider_spend_verified:false,
    commercial_revenue_included:false});
});
describe("VendeAtendeIA F9 corporate FinOps endpoint",()=>{
  it("serves only a no-store result under signed corporate server authority",async()=>{
    const r=await POST(request(input),params);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect((await r.json()).actual_provider_spend_verified).toBe(false);
    expect(mocks.read).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm"}),
      {productId,...input},
    );
  });
  it("rejects spoofed corporate scopes and arbitrary billing instructions",async()=>{
    for(const invalid of [
      {...input,tenantId:"other"},
      {...input,paymentStatus:"paid"},
      {...input,refund:true},
      {...input,coreApiKey:"attacker"},
      {...input,externalTenantId:"../other"},
      {...input,unitId:""},
      {...input,startDate:"10/22/2026"},
      {...input,endDate:"2026/10/22"},
      {...input,unitId:"x".repeat(200)},
    ])expect((await POST(request(invalid),params)).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("fails closed without exposing Core secrets or foreign customer identifiers",async()=>{
    mocks.session.mockRejectedValueOnce(Error("SESSION_SECRET"));
    const denied=await POST(request(input),params);
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain("SESSION_SECRET");
    mocks.read.mockRejectedValueOnce(Error("REMOTE_PROVIDER_SECRET"));
    const result=await POST(request(input),params);
    expect(result.status).toBe(403);
    expect(await result.text()).not.toContain("REMOTE_PROVIDER_SECRET");
  });
  it("rejects URL parameters and oversized body",async()=>{
    const urlParam=new Request(url+"?tenantId=victim",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify(input),
    });
    expect((await POST(urlParam,params)).status).toBe(400);
    expect((await POST(request({...input,additional:"x".repeat(3000)}),params)).status)
      .toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
