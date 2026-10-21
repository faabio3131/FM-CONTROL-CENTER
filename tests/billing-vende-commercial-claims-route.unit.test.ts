import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),monitor:vi.fn()}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",()=>({resolveTenantContext:m.session}));
vi.mock("../src/application/billing/vende-commercial-claims-supervisor",()=>({readVendeClaimsMonitor:m.monitor}));
import {GET} from "../src/app/api/billing/products/[productId]/vende-commercial-claims/route";
const productId="11111111-1111-4111-8111-111111111111";
const params={params:Promise.resolve({productId})};
const url="http://localhost/api/billing/products/"+productId+"/vende-commercial-claims";
beforeEach(()=>{
  vi.resetAllMocks();
  m.session.mockResolvedValue({tenantId:"fm",userId:"owner",role:"owner"});
  m.monitor.mockResolvedValue({totals:{pending:1,processing:0,unknown:1,blocked:0,delivered:0},
    staleProcessing:0,expiredApprovals:1,alert:"critical",items:[],truncated:false,
    runtimeEntitlementVerified:false});
});
describe("B1.10 C06 read-only claims monitor API",()=>{
  it("serves scoped aggregate status, never claiming SaaS entitlement",async()=>{
    const response=await GET(new Request(url),params);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const data=await response.json();
    expect(data.runtimeEntitlementVerified).toBe(false);
    expect(data.totals.unknown).toBe(1);
    expect(m.monitor).toHaveBeenCalledWith(expect.objectContaining({tenantId:"fm"}),productId);
  });
  it("rejects arbitrary parameters before querying claims",async()=>{
    const response=await GET(new Request(url+"?tenantId=other"),params);
    expect(response.status).toBe(400);expect(m.monitor).not.toHaveBeenCalled();
  });
  it("sanitizes unauthorized tenant and internal errors",async()=>{
    m.session.mockRejectedValueOnce(Error("internal-secret"));
    const response=await GET(new Request(url),params);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("internal-secret");
    m.monitor.mockRejectedValueOnce(Error("database-connection-string"));
    const second=await GET(new Request(url),params);
    expect(second.status).toBe(403);
    expect(await second.text()).not.toContain("database-connection-string");
  });
});
