import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({
  session:vi.fn(),step:vi.fn(),close:vi.fn(),config:vi.fn(),
}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",
  ()=>({resolveTenantContext:m.session}));
vi.mock("../src/application/security/password-step-up",
  ()=>({verifyPasswordStepUp:m.step}));
vi.mock("../src/application/billing/assistant-plan-outbox-dispatcher",
  ()=>({planProjectionConfigFromEnvironment:m.config}));
vi.mock("../src/application/billing/vende-compensation-closure",
  ()=>({closeVendeCommercialCompensationCase:m.close}));
import {POST} from "../src/app/api/billing/products/[productId]/vende-compensation-intents/[intentId]/close/route";
const productId="11111111-1111-4111-8111-111111111111";
const intentId="22222222-2222-4222-8222-222222222222";
const closureId="33333333-3333-4333-8333-333333333333";
const url="http://localhost/api/billing/products/"+productId+
  "/vende-compensation-intents/"+intentId+"/close";
const params={params:Promise.resolve({productId,intentId})};
const valid={closureId,expectedRevision:2,unitId:"unit-a",password:"fm-step-up"};
const json=(value:unknown,path=url)=>new Request(path,{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify(value),
});
beforeEach(()=>{
  vi.resetAllMocks();
  m.session.mockResolvedValue({tenantId:"fm",userId:"operator-two",role:"owner"});
  m.step.mockResolvedValue({
    userId:"operator-two",verifiedAt:new Date("2026-10-23T11:59:00Z"),
  });
  m.config.mockReturnValue({organizationId:"fm"});
  m.close.mockResolvedValue({closureId,status:"recorded",
    commercialCaseClosed:true,caseResolved:true,allUnitsVerified:false,
    providerRefundExecuted:false,quotaCoverage:"one_unit_both_capabilities",
    futureAiAdmissionGuaranteed:false,unitId:"unit-a"});
});
describe("F9 governed commercial closure POST",()=>{
  it("requires bound identity and a separate fresh human step-up",async()=>{
    const response=await POST(json(valid),params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      caseResolved:true,allUnitsVerified:false,providerRefundExecuted:false,
    });
    expect(m.step).toHaveBeenCalledWith(expect.any(Headers),"fm-step-up");
    expect(m.close).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm",userId:"operator-two"}),
      expect.objectContaining({userId:"operator-two"}),
      {productId,intentId,closureId,expectedRevision:2,unitId:"unit-a"},
      expect.objectContaining({organizationId:"fm"}),
    );
  });
  it.each([
    {...valid,closureId:"forged"},
    {...valid,unitId:"../cross-tenant"},
    {...valid,expectedRevision:0},
    {...valid,expectedRevision:2.5},
    {...valid,password:""},
    {...valid,tenantId:"injected"},
    {...valid,password:"s".repeat(129)},
  ])("rejects forged or extra payload without authorization %j",async body=>{
    const res=await POST(json(body),params);
    expect(res.status).toBe(400);
    expect(m.session).not.toHaveBeenCalled();
    expect(m.close).not.toHaveBeenCalled();
  });
  it("refuses query scope and oversized input",async()=>{
    expect((await POST(json(valid,url+"?tenantId=foreign"),params)).status).toBe(400);
    const res=await POST(json({...valid,padding:"x".repeat(1500)}),params);
    expect(res.status).toBe(400);
    expect(m.close).not.toHaveBeenCalled();
  });
  it("does not claim closure when remote proof or human authority fails",async()=>{
    m.close.mockRejectedValueOnce(Error("FINANCIAL_SECRET"));
    const r=await POST(json(valid),params);
    expect(r.status).toBe(403);
    expect(await r.text()).not.toContain("FINANCIAL_SECRET");
    expect(m.close).toHaveBeenCalledOnce();
  });
});
