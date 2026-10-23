import {beforeEach,describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({
  context:vi.fn(),getSession:vi.fn(),stepUp:vi.fn(),read:vi.fn(),operate:vi.fn(),
}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",
  ()=>({resolveTenantContext:mocks.context}));
vi.mock("../src/infrastructure/auth/auth",
  ()=>({auth:{api:{getSession:mocks.getSession}}}));
vi.mock("../src/application/security/password-step-up",
  ()=>({verifyPasswordStepUp:mocks.stepUp}));
vi.mock("../src/application/billing/vende-core-finops-policy",()=>({
  readFMFinopsOperationalOutbox:mocks.read,
  operateFMFinopsAlertOutbox:mocks.operate,
}));
import {GET,POST}
  from "../src/app/api/billing/products/[productId]/vende-core-finops/alert-operations/route";

const productId="11111111-1111-4111-8111-111111111111";
const url="http://localhost/api/billing/products/"+productId+
  "/vende-core-finops/alert-operations";
const params={params:Promise.resolve({productId})};
const scope={productId,externalTenantId:"tenant-a",unitId:"unit-a"};
const scan={
  externalTenantId:"tenant-a",unitId:"unit-a",kind:"scan",
  startDate:"2026-10-01",endDate:"2026-10-22",password:"synthetic-password",
};
const review={
  externalTenantId:"tenant-a",unitId:"unit-a",kind:"review",
  eventId:"a".repeat(64),password:"synthetic-password",
};
const post=(body:unknown)=>new Request(url,{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify(body),
});
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({tenantId:"fm",userId:"fm-human",role:"owner"});
  mocks.getSession.mockResolvedValue({
    user:{id:"fm-human"},session:{id:"trusted-session"},
  });
  mocks.stepUp.mockResolvedValue({userId:"fm-human",verifiedAt:new Date()});
  mocks.read.mockResolvedValue({
    tenant_id:"tenant-a",unit_id:"unit-a",status:"no_queued_alerts",
    provider_invoice_verified:false,automated_dispatch_enabled:false,items:[],
  });
  mocks.operate.mockResolvedValue({status:"accepted",kind:"scan",
    created:0,scanned:0,nextCursor:null});
});
describe("FM persistent FinOps alert operations",()=>{
  it("reads strictly scoped queue without shared caching",async()=>{
    const res=await GET(new Request(url+"?externalTenantId=tenant-a&unitId=unit-a"),params);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mocks.read).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm"}),scope,
    );
  });
  it("requires live human FM session and step-up to scan",async()=>{
    const res=await POST(post(scan),params);
    expect(res.status).toBe(200);
    expect(mocks.stepUp).toHaveBeenCalledWith(
      expect.any(Headers),"synthetic-password",
    );
    expect(mocks.operate).toHaveBeenCalledWith(
      expect.objectContaining({userId:"fm-human"}),
      expect.objectContaining({userId:"fm-human"}),
      "trusted-session",scope,
      {kind:"scan",startDate:"2026-10-01",endDate:"2026-10-22"},
    );
  });
  it("passes an explicitly authorized scan cursor for the next page",async()=>{
    const res=await POST(post({...scan,afterRequestId:"req-previous"}),params);
    expect(res.status).toBe(200);
    expect(mocks.operate).toHaveBeenCalledWith(
      expect.anything(),expect.anything(),"trusted-session",scope,
      {kind:"scan",startDate:"2026-10-01",endDate:"2026-10-22",
       afterRequestId:"req-previous"},
    );
  });
  it("allows only bounded fingerprint review, not arbitrary billing actions",async()=>{
    mocks.operate.mockResolvedValueOnce({status:"accepted",kind:"review"});
    expect((await POST(post(review),params)).status).toBe(200);
    expect(mocks.operate).toHaveBeenCalledWith(
      expect.anything(),expect.anything(),"trusted-session",scope,
      {kind:"review",eventId:"a".repeat(64)},
    );
  });
  it("rejects spoofed scopes, unexpected fields, invalid IDs and body types",async()=>{
    for(const wrong of [
      {...scan,tenantId:"foreign"}, {...scan,action:"release_quota"},
      {...scan,afterRequestId:"../foreign"},
      {...scan,startDate:"2026/10/01"}, {...scan,unitId:"../foreign"},
      {...scan,password:""}, {...scan,password:"x".repeat(129)},
      {...scan,kind:"paid"}, {...review,eventId:"not-an-event"},
      {...review,providerCost:"0.00"},
    ])expect((await POST(post(wrong),params)).status).toBe(400);
    expect(mocks.operate).not.toHaveBeenCalled();
    expect(mocks.stepUp).not.toHaveBeenCalled();
  });
  it("rejects forged human sessions and never leaks Core secrets",async()=>{
    mocks.getSession.mockResolvedValueOnce({
      user:{id:"other"},session:{id:"trusted-session"},
    });
    expect((await POST(post(scan),params)).status).toBe(403);
    expect(mocks.operate).not.toHaveBeenCalled();
    mocks.operate.mockRejectedValueOnce(Error("PRIVATE_CORE_TRANSPORT_KEY"));
    const res=await POST(post(scan),params);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("PRIVATE_CORE_TRANSPORT_KEY");
  });
  it("rejects query injection and duplicate tenant GET filters",async()=>{
    expect((await GET(new Request(url+"?externalTenantId=tenant-a&unitId=unit-a"+
      "&externalTenantId=foreign"),params)).status).toBe(400);
    expect((await POST(new Request(url+"?force=true",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify(scan),
    }),params)).status).toBe(400);
  });
});
