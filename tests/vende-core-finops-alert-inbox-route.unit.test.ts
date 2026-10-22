import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({context:vi.fn(),read:vi.fn()}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",
  ()=>({resolveTenantContext:mocks.context}));
vi.mock("../src/application/billing/vende-core-finops-policy",
  ()=>({readFMFinopsAlertInbox:mocks.read}));
import {GET} from "../src/app/api/billing/products/[productId]/vende-core-finops/alert-inbox/route";

const productId="11111111-1111-4111-8111-111111111111";
const path="http://localhost/api/billing/products/"+productId+"/vende-core-finops/alert-inbox";
const params={params:Promise.resolve({productId})};
const allowed={
  externalTenantId:"tenant-a",unitId:"unit-a",
  startDate:"2026-10-22",endDate:"2026-10-22",
};
const get=(query:Record<string,string>)=>new Request(path+"?"+new URLSearchParams(query));
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({tenantId:"fm",userId:"fm-admin",role:"owner"});
  mocks.read.mockResolvedValue({
    tenant_id:"tenant-a",unit_id:"unit-a",policy_revision:1,
    policy_enabled:true,has_more:false,next_cursor:null,
    provider_invoice_verified:false,items:[],
  });
});
describe("FM Core FinOps alert inbox HTTP boundary",()=>{
  it("requires exactly corporate scoped filters, never caches, no provider proof",async()=>{
    const response=await GET(get(allowed),params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).provider_invoice_verified).toBe(false);
    expect(mocks.read).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm"}),
      {productId,...allowed,afterRequestId:undefined},
    );
  });
  it("forwards only explicit bounded cursor",async()=>{
    const response=await GET(get({...allowed,afterRequestId:"req-12"}),params);
    expect(response.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith(
      expect.anything(),{productId,...allowed,afterRequestId:"req-12"},
    );
  });
  it("denies unknown scope, filter injection, and duplicate tenant",async()=>{
    for(const filters of [
      {...allowed,tenantId:"other"},
      {...allowed,unitId:"../foreign"},
      {...allowed,externalTenantId:"foreign tenant"},
      {...allowed,afterRequestId:" "},
      {...allowed,afterRequestId:"X".repeat(129)},
      {...allowed,limit:"999999"},
    ])expect((await GET(get(filters),params)).status).toBe(400);
    const duplicate=new Request(path+"?"+new URLSearchParams(allowed)+
      "&externalTenantId=foreign");
    expect((await GET(duplicate,params)).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("fails closed and never returns private connector secrets",async()=>{
    mocks.read.mockRejectedValueOnce(Error("PRIVATE_FM_READER_KEY"));
    const response=await GET(get(allowed),params);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("PRIVATE_FM_READER_KEY");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
