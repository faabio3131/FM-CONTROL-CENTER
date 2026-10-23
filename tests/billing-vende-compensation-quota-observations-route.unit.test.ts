import {beforeEach,describe,expect,it,vi} from "vitest";

const m=vi.hoisted(()=>({
  session:vi.fn(),stepUp:vi.fn(),read:vi.fn(),record:vi.fn(),config:vi.fn(),
}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",
  ()=>({resolveTenantContext:m.session}));
vi.mock("../src/application/security/password-step-up",
  ()=>({verifyPasswordStepUp:m.stepUp}));
vi.mock("../src/application/billing/assistant-plan-outbox-dispatcher",
  ()=>({planProjectionConfigFromEnvironment:m.config}));
vi.mock("../src/application/billing/vende-compensation-quota-observation",
  ()=>({
    readVendeCorrectionQuotaObservations:m.read,
    recordVendeCorrectionQuotaObservation:m.record,
  }));
import {GET,POST}
  from "../src/app/api/billing/products/[productId]/vende-compensation-intents/[intentId]/quota-observations/route";

const productId="11111111-1111-4111-8111-111111111111";
const intentId="22222222-2222-4222-8222-222222222222";
const observationId="33333333-3333-4333-8333-333333333333";
const url="http://localhost/api/billing/products/"+productId+
  "/vende-compensation-intents/"+intentId+"/quota-observations";
const params={params:Promise.resolve({productId,intentId})};
const body={
  observationId,unitId:"unit-a",capability:"atendimento_interpretacao",
  password:"synthetic-step-up-password",
};
const post=(data:unknown)=>new Request(url,{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify(data),
});
beforeEach(()=>{
  vi.resetAllMocks();
  m.session.mockResolvedValue({
    tenantId:"fm-corporate",userId:"operator",role:"owner",
  });
  m.stepUp.mockResolvedValue({userId:"operator",verifiedAt:new Date()});
  m.config.mockReturnValue({organizationId:"fm-corporate"});
  m.read.mockResolvedValue({
    intentId,historicalOnly:true,currentCoreQuotaVerified:false,
    caseResolved:false,allUnitsVerified:false,truncated:false,items:[],
  });
  m.record.mockResolvedValue({
    observationId,status:"recorded",unitId:"unit-a",
    capability:"atendimento_interpretacao",historicalOnly:true,
    caseResolved:false,allUnitsVerified:false,providerRefundExecuted:false,
  });
});
describe("F9 audited quota verification for compensated contract",()=>{
  it("reads historical observations only for exact product and intent",async()=>{
    const res=await GET(new Request(url),params);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).caseResolved).toBe(false);
    expect(m.read).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm-corporate"}),{productId,intentId},
    );
  });
  it("requires a fresh human password and recomputes Core evidence in service",async()=>{
    const res=await POST(post(body),params);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(m.stepUp).toHaveBeenCalledWith(
      expect.any(Headers),"synthetic-step-up-password",
    );
    expect(m.record).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm-corporate"}),
      expect.objectContaining({userId:"operator"}),
      {productId,intentId,observationId,unitId:"unit-a",
       capability:"atendimento_interpretacao"},
      {organizationId:"fm-corporate"},
    );
  });
  it("rejects fake paid/refunded/closed claims, foreign scopes and invalid id",async()=>{
    for(const invalid of [
      {...body,caseResolved:true},{...body,refundExecuted:true},
      {...body,providerInvoicePaid:true},{...body,externalTenantId:"foreign"},
      {...body,observationId:"not-valid"},{...body,unitId:"../unit"},
      {...body,capability:"unknown"},{...body,password:""},
      {...body,password:"x".repeat(150)},
    ]){
      const res=await POST(post(invalid),params);
      expect(res.status).toBe(400);
    }
    expect(m.record).not.toHaveBeenCalled();
    expect(m.stepUp).not.toHaveBeenCalled();
  });
  it("does not accept unexpected filters or expose S2S secrets on errors",async()=>{
    expect((await GET(new Request(url+"?tenantId=other"),params)).status)
      .toBe(400);
    expect((await POST(new Request(url+"?retry=true",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body),
    }),params)).status).toBe(400);
    m.record.mockRejectedValueOnce(Error("PRIVATE_CORE_SECRET_VALUE"));
    const res=await POST(post(body),params);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("PRIVATE_CORE_SECRET_VALUE");
  });
  it("rejects invalid URL identifiers before any tenant-context access",async()=>{
    const result=await GET(new Request(url),{
      params:Promise.resolve({productId,intentId:"invalid"}),
    });
    expect(result.status).toBe(400);
    expect(m.session).not.toHaveBeenCalled();
  });
});
