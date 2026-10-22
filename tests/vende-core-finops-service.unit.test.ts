import {beforeEach,describe,expect,it,vi} from "vitest";
import type {TenantContext} from "../src/domain/security/tenant-context";
const m=vi.hoisted(()=>({bindings:vi.fn(),authority:vi.fn()}));
vi.mock("../src/infrastructure/db/client",()=>({
  db:{select:()=>({from:()=>({innerJoin:()=>({where:()=>({limit:m.bindings})})})})},
}));
vi.mock("../src/application/billing/assistant-plan-catalog-service",
  ()=>({requireFMPlanAuthority:m.authority}));
import {
  CORE_FINOPS_REPORT_PATH,CORE_FINOPS_REPORT_SCHEMA,
  readVendeCoreFinops,signCommandCoreFinops,
} from "../src/application/billing/vende-core-finops-reader";
const productId="11111111-1111-4111-8111-111111111111";
const context:TenantContext={
  tenantId:"fm",userId:"owner",role:"owner",correlationId:"fm-finops-test",
};
const input={
  productId,externalTenantId:"tenant-a",unitId:"unit-a",
  startDate:"2026-10-01",endDate:"2026-10-22",
};
const now=new Date("2026-10-22T12:00:00.000Z");
const config={origin:"https://core.example.test",secret:"synthetic-finops-shared-key-longer-than-32"};
function validReport(){
  return {
    schema:CORE_FINOPS_REPORT_SCHEMA,
    tenant_id:input.externalTenantId,unit_id:input.unitId,
    start_date:input.startDate,end_date:input.endDate,
    buckets:[],known_attempts:0,unknown_attempts:0,
    coverage:"no_observations",
    internal_fm_cost_only:true,actual_provider_spend_verified:false,
    commercial_revenue_included:false,
  };
}
beforeEach(()=>{
  vi.resetAllMocks();
  m.bindings.mockResolvedValue([{id:"trusted-binding"}]);
});
describe("VendeAtendeIA F9 canonical customer-to-Core transport",()=>{
  it("signs exact request body only after FM authority and product/tenant binding",async()=>{
    let observed=0;
    const http=(async (url:RequestInfo|URL,options?:RequestInit)=>{
      observed++;
      expect(String(url)).toBe(config.origin+CORE_FINOPS_REPORT_PATH);
      expect(options?.method).toBe("POST");
      expect(options?.cache).toBe("no-store");
      expect(options?.redirect).toBe("error");
      const raw=options?.body as string;
      const request=JSON.parse(raw) as Record<string,unknown>;
      expect(request).toMatchObject({
        tenant_id:input.externalTenantId,unit_id:input.unitId,
        start_date:input.startDate,end_date:input.endDate,
        issued_at:Math.floor(now.getTime()/1000),
        schema:CORE_FINOPS_REPORT_SCHEMA,
      });
      expect(request.nonce).toMatch(/^[A-Za-z0-9_-]{22,96}$/);
      expect((options?.headers as Record<string,string>)["X-FM-Command-FinOps-Signature"])
        .toBe(signCommandCoreFinops(config.secret,raw));
      return Response.json(validReport(),{status:200});
    }) as typeof fetch;
    const output=await readVendeCoreFinops(context,input,config,http,now);
    expect(output.coverage).toBe("no_observations");
    expect(observed).toBe(1);
    expect(m.bindings).toHaveBeenCalledWith(1);
    expect(m.authority).toHaveBeenCalledWith(context,false);
  });
  it("blocks unmapped or foreign customer before any network activity",async()=>{
    m.bindings.mockResolvedValueOnce([]);
    const http=vi.fn();
    await expect(readVendeCoreFinops(
      context,input,config,http as unknown as typeof fetch,now,
    )).rejects.toThrow("vende.finops.unavailable");
    expect(http).not.toHaveBeenCalled();
  });
  it("blocks untrusted identity before reading customer binding",async()=>{
    m.authority.mockImplementationOnce(()=>{throw Error("no_corporate_permission");});
    const http=vi.fn();
    await expect(readVendeCoreFinops(
      context,input,config,http as unknown as typeof fetch,now,
    )).rejects.toThrow("no_corporate_permission");
    expect(m.bindings).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
  });
  it("never converts a Core 503, malformed totals or transport outage into zero",async()=>{
    for(const fake of [
      (async()=>Response.json({error:"provider-secret"},{status:503})) as typeof fetch,
      (async()=>Response.json({...validReport(),coverage:"priced_internal_observations"})) as typeof fetch,
      (async()=>{throw Error("internal-secret");}) as typeof fetch,
    ]){
      await expect(readVendeCoreFinops(context,input,config,fake,now))
        .rejects.toThrow("vende.finops.unavailable");
    }
  });
});
