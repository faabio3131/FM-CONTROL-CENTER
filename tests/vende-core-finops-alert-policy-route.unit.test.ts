import {beforeEach,describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({
  context:vi.fn(),getSession:vi.fn(),stepUp:vi.fn(),
  read:vi.fn(),update:vi.fn(),
}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",
  ()=>({resolveTenantContext:mocks.context}));
vi.mock("../src/infrastructure/auth/auth",
  ()=>({auth:{api:{getSession:mocks.getSession}}}));
vi.mock("../src/application/security/password-step-up",
  ()=>({verifyPasswordStepUp:mocks.stepUp}));
vi.mock("../src/application/billing/vende-core-finops-policy",
  ()=>({readFMFinopsAlertPolicy:mocks.read,updateFMFinopsAlertPolicy:mocks.update}));
import {GET,POST} from "../src/app/api/billing/products/[productId]/vende-core-finops/alert-policy/route";

const productId="11111111-1111-4111-8111-111111111111";
const url="http://localhost/api/billing/products/"+productId+"/vende-core-finops/alert-policy";
const params={params:Promise.resolve({productId})};
const scope={productId,externalTenantId:"tenant-a",unitId:"unit-a"};
const body={
  externalTenantId:"tenant-a",unitId:"unit-a",expectedRevision:0,
  enabled:true,currency:"USD",maximumKnownCost:"0.05",password:"synthetic-only",
};
const post=(value:unknown)=>new Request(url,{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify(value),
});
const get=()=>new Request(url+"?externalTenantId=tenant-a&unitId=unit-a");

beforeEach(()=>{
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({tenantId:"fm",role:"owner",userId:"fm-human"});
  mocks.getSession.mockResolvedValue({
    user:{id:"fm-human"},session:{id:"trusted-session-id"},
  });
  mocks.stepUp.mockResolvedValue({userId:"fm-human",verifiedAt:new Date()});
  mocks.read.mockResolvedValue({
    tenant_id:"tenant-a",unit_id:"unit-a",configured:false,
    revision:null,enabled:false,currency:null,maximum_known_cost:null,
  });
  mocks.update.mockResolvedValue({status:"accepted",expectedNextRevision:1});
});

describe("FM governed FinOps alert policy endpoint",()=>{
  it("reads only the bound FM-selected tenant and unit, never caches",async()=>{
    const response=await GET(get(),params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.read).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm"}),scope,
    );
  });
  it("requires live session, password step-up and exact human-scoped write",async()=>{
    const response=await POST(post(body),params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.stepUp).toHaveBeenCalledWith(expect.any(Headers),"synthetic-only");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({userId:"fm-human"}),
      expect.objectContaining({userId:"fm-human"}),
      "trusted-session-id",scope,{
        expectedRevision:0,enabled:true,currency:"USD",maximumKnownCost:"0.05",
      },
    );
  });
  it("rejects tenant spoofing, unsafe financial instructions and forged revisions",async()=>{
    for(const malformed of [
      {...body,tenantId:"foreign"},
      {...body,sourceInvoiceId:"fake"},
      {...body,refund:true},
      {...body,enabled:"true"},
      {...body,expectedRevision:TrueValue()},
      {...body,expectedRevision:1.25},
      {...body,unitId:"../foreign"},
      {...body,password:"x".repeat(130)},
      {...body,maximumKnownCost:2},
      {...body,currency:"BRL"},
      {...body,externalTenantId:""},
    ]){
      expect((await POST(post(malformed),params)).status).toBe(400);
    }
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.stepUp).not.toHaveBeenCalled();
  });
  it("fails closed when human session mismatches or service is unavailable",async()=>{
    mocks.getSession.mockResolvedValueOnce({
      user:{id:"foreign"},session:{id:"trusted-session-id"},
    });
    expect((await POST(post(body),params)).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.update.mockRejectedValueOnce(Error("PRIVATE_CORE_SECRET"));
    const denied=await POST(post(body),params);
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain("PRIVATE_CORE_SECRET");
  });
  it("rejects unexpected GET filters and POST query strings",async()=>{
    const badGet=new Request(url+"?externalTenantId=tenant-a&unitId=unit-a&tenantId=other");
    expect((await GET(badGet,params)).status).toBe(400);
    const badPost=new Request(url+"?tenantId=other",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body),
    });
    expect((await POST(badPost,params)).status).toBe(400);
  });
});

function TrueValue(){return true;}
