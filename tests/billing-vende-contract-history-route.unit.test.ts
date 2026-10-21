import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),authority:vi.fn(),history:vi.fn()}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",()=>({resolveTenantContext:m.session}));
vi.mock("../src/application/billing/assistant-plan-catalog-service",()=>({requireFMPlanAuthority:m.authority}));
vi.mock("../src/application/billing/vende-c06-governed-execution",()=>({GovernedVendeC06Service:class{contractHistory=m.history;}}));
import {GET} from "../src/app/api/billing/products/[productId]/vende-contract-history/route";
const productId="11111111-1111-4111-8111-111111111111",subscriptionId="22222222-2222-4222-8222-222222222222";
const params={params:Promise.resolve({productId})};
const request=(query:string)=>new Request("http://localhost/history?"+query);
beforeEach(()=>{vi.resetAllMocks();m.session.mockResolvedValue({tenantId:"fm",userId:"owner",role:"owner"});
  m.history.mockResolvedValue({items:[],nextBeforeRevision:null});});
describe("contract history ingress",()=>{
  it("bounds cursor and rejects duplicate or additional authority fields",async()=>{
    for(const q of ["",`subscriptionId=${subscriptionId}&tenantId=foreign`,
      `subscriptionId=${subscriptionId}&subscriptionId=${subscriptionId}`,
      ...["0","-1","1.5","9007199254740992","1&beforeRevision=2"].map(x=>`subscriptionId=${subscriptionId}&beforeRevision=${x}`)])
      expect((await GET(request(q),params)).status).toBe(400);
    expect(m.history).not.toHaveBeenCalled();
  });
  it("uses authenticated scope, numeric cursor and no-store",async()=>{
    const r=await GET(request(`subscriptionId=${subscriptionId}&beforeRevision=5`),params);
    expect(r.status).toBe(200);expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(m.history).toHaveBeenCalledWith({tenantId:"fm",userId:"owner",role:"owner"},{productId,subscriptionId,beforeRevision:5});
    expect(m.authority).toHaveBeenCalledWith(expect.objectContaining({tenantId:"fm"}),false);
  });
  it("denies unauthorized callers before reading and conceals service errors",async()=>{
    m.authority.mockImplementationOnce(()=>{throw Error("private");});
    expect((await GET(request(`subscriptionId=${subscriptionId}`),params)).status).toBe(403);
    expect(m.history).not.toHaveBeenCalled();m.history.mockRejectedValueOnce(Error("private-database-detail"));
    const r=await GET(request(`subscriptionId=${subscriptionId}`),params);
    expect(r.status).toBe(403);expect(await r.text()).not.toContain("private-database-detail");
  });
});
