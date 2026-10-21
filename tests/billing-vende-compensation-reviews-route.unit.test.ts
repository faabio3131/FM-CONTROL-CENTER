import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),password:vi.fn(),read:vi.fn(),write:vi.fn()}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",()=>({resolveTenantContext:m.session}));
vi.mock("../src/application/security/password-step-up",()=>({verifyPasswordStepUp:m.password}));
vi.mock("../src/application/billing/vende-compensation-review",()=>({
  readVendeCompensationReviews:m.read,triageVendeCompensationRisk:m.write,
}));
import {GET,POST} from "../src/app/api/billing/products/[productId]/vende-compensation-reviews/route";
const productId="11111111-1111-4111-8111-111111111111";
const commandId="22222222-2222-4222-8222-222222222222";
const url="http://localhost/api/billing/products/"+productId+"/vende-compensation-reviews";
const params={params:Promise.resolve({productId})};
const post=(body:unknown)=>new Request(url,{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const valid={commandId,password:"fm-review-password",decision:"investigating",
  expectedVersion:0,reasonCode:"investigation_open"};
beforeEach(()=>{
  vi.resetAllMocks();
  m.session.mockResolvedValue({tenantId:"fm",userId:"owner",role:"owner"});
  m.password.mockResolvedValue({userId:"owner",verifiedAt:new Date()});
  m.read.mockResolvedValue({historicalTotal:1,truncated:false,items:[],
    entitlementVerified:false,automaticCompensationAuthorized:false,
    remoteRemediationCompleted:false});
  m.write.mockResolvedValue({commandId,reviewVersion:1,reviewStep:"investigating",
    remediationDispatched:false,currentAssistantLicenseVerified:false});
});
describe("P01 human-governed financial compensation triage API",()=>{
  it("offers no-store read-only cases with explicit unknown remote license",async()=>{
    const r=await GET(new Request(url),params);
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(await r.json()).toMatchObject({
      entitlementVerified:false,automaticCompensationAuthorized:false});
    expect(m.read).toHaveBeenCalledWith(expect.objectContaining({tenantId:"fm"}),productId);
  });
  it("requires fresh corporate step-up and never dispatches license/PSP",async()=>{
    const r=await POST(post(valid),params);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({remediationDispatched:false});
    expect(m.password).toHaveBeenCalledWith(expect.any(Headers),"fm-review-password");
    expect(m.write).toHaveBeenCalledWith(expect.objectContaining({tenantId:"fm"}),
      expect.objectContaining({userId:"owner"}),{
        productId,commandId,expectedVersion:0,
        decision:"investigating",reasonCode:"investigation_open",
      });
  });
  it("rejects injection and arbitrary closure or refund requests before authentication",async()=>{
    const corrupted=[
      {...valid,tenantId:"foreign"},{...valid,licenseStatus:"active"},
      {...valid,decision:"resolved"},{...valid,decision:"refund"},{...valid,amount:1},
      {...valid,expectedVersion:-1},{...valid,expectedVersion:"1"},
      {...valid,reasonCode:"secrets go here"},{...valid,reasonCode:""},
      {...valid,password:""},{...valid,commandId:"bogus"},
    ];
    for(const b of corrupted)expect((await POST(post(b),params)).status).toBe(400);
    expect(m.password).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();
    expect((await GET(new Request(url+"?tenantId=foreign"),params)).status).toBe(400);
  });
  it("sanitizes authentication errors, denies cross tenant and limits request size",async()=>{
    m.session.mockRejectedValueOnce(Error("secret database password"));
    const r=await POST(post(valid),params);
    expect(r.status).toBe(403);
    expect(await r.text()).not.toContain("secret database password");
    m.write.mockRejectedValueOnce(Error("cross_tenant_credentials"));
    const s=await POST(post(valid),params);
    expect(s.status).toBe(403);expect(await s.text()).not.toContain("credentials");
    const huge=post({...valid,reasonCode:"a".repeat(3000)});
    expect((await POST(huge,params)).status).toBe(400);
  });
});
