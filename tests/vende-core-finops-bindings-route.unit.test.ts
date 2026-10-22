import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),list:vi.fn()}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",
  ()=>({resolveTenantContext:m.session}));
vi.mock("../src/application/billing/vende-core-finops-reader",
  ()=>({listVendeFinopsBoundTenants:m.list}));
import {GET} from "../src/app/api/billing/products/[productId]/vende-core-finops/bindings/route";
const productId="11111111-1111-4111-8111-111111111111";
const url="http://localhost/api/billing/products/"+productId+"/vende-core-finops/bindings";
const params={params:Promise.resolve({productId})};
beforeEach(()=>{
  vi.resetAllMocks();
  m.session.mockResolvedValue({tenantId:"fm",userId:"owner",role:"owner"});
  m.list.mockResolvedValue({items:["assistant-a","assistant-b"],truncated:false});
});
describe("FM corporate read-only bounded FinOps binding selector",()=>{
  it("returns no-store customer mappings owned by the product",async()=>{
    const r=await GET(new Request(url),params);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({items:["assistant-a","assistant-b"],truncated:false});
    expect(m.list).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm"}),productId,
    );
  });
  it("denies forged scopes and invalid product before DB use",async()=>{
    expect((await GET(new Request(url+"?tenantId=another"),params)).status).toBe(400);
    expect((await GET(new Request(url),{
      params:Promise.resolve({productId:"not-a-uuid"}),
    })).status).toBe(400);
    expect(m.session).not.toHaveBeenCalled();
    expect(m.list).not.toHaveBeenCalled();
  });
  it("fails closed without leaking source or authentication details",async()=>{
    m.session.mockRejectedValueOnce(Error("AUTH_SECRET"));
    const denied=await GET(new Request(url),params);
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain("AUTH_SECRET");
    m.list.mockRejectedValueOnce(Error("FOREIGN_CUSTOMER_ID"));
    const error=await GET(new Request(url),params);
    expect(error.status).toBe(403);
    expect(await error.text()).not.toContain("FOREIGN_CUSTOMER_ID");
  });
});
