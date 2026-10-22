import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),read:vi.fn()}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",
  ()=>({resolveTenantContext:m.session}));
vi.mock("../src/application/billing/vende-compensation-observation-history",
  ()=>({readVendeCompensationObservationHistory:m.read}));
import {GET} from "../src/app/api/billing/products/[productId]/vende-compensation-evidence/[commandId]/history/route";
const productId="11111111-1111-4111-8111-111111111111";
const commandId="22222222-2222-4222-8222-222222222222";
const url="http://localhost/api/billing/products/"+productId+
  "/vende-compensation-evidence/"+commandId+"/history";
const params={params:Promise.resolve({productId,commandId})};
beforeEach(()=>{
  vi.resetAllMocks();
  m.session.mockResolvedValue({tenantId:"fm",userId:"owner",role:"owner"});
  m.read.mockResolvedValue({items:[],truncated:false,historicalOnly:true,
    currentLicenseVerified:false,currentFinanceVerified:false,
    remediationConfirmed:false,caseResolved:false});
});
describe("P01 FM compensation observation history HTTP",()=>{
  it("returns no-store, read-only scoped history",async()=>{
    const r=await GET(new Request(url),params);
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(await r.json()).toMatchObject({
      historicalOnly:true,currentFinanceVerified:false,
      remediationConfirmed:false,caseResolved:false,
    });
    expect(m.read).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm"}),productId,commandId,
    );
  });
  it("rejects malformed identifiers and query parameters without reading data",async()=>{
    expect((await GET(new Request(url+"?tenantId=other"),params)).status).toBe(400);
    expect((await GET(new Request(url),{
      params:Promise.resolve({productId,commandId:"bogus"}),
    })).status).toBe(400);
    expect(m.read).not.toHaveBeenCalled();
  });
  it("fails closed and redacts backend errors",async()=>{
    m.session.mockRejectedValueOnce(Error("SECRET_S2S_TOKEN"));
    const denied=await GET(new Request(url),params);
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain("SECRET_S2S_TOKEN");
    m.read.mockRejectedValueOnce(Error("CROSS_TENANT_PII"));
    const failed=await GET(new Request(url),params);
    expect(failed.status).toBe(403);
    expect(await failed.text()).not.toContain("CROSS_TENANT_PII");
  });
});
