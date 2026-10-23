import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {TenantContext} from "../src/domain/security/tenant-context";
const mocks=vi.hoisted(()=>({
  bindings:vi.fn(),authority:vi.fn(),sign:vi.fn(),
}));
vi.mock("../src/infrastructure/db/client",()=>({
  db:{select:()=>({from:()=>({innerJoin:()=>({where:()=>({limit:mocks.bindings})})})})},
}));
vi.mock("../src/application/billing/assistant-plan-catalog-service",
  ()=>({requireFMPlanAuthority:mocks.authority}));
vi.mock("../src/application/integration/fm-core-ai-recovery-jwt",
  ()=>({signCoreAIRecoveryAuthorization:mocks.sign}));
import {
  readFMFinopsOperationalOutbox,operateFMFinopsAlertOutbox,
} from "../src/application/billing/vende-core-finops-policy";

const productId="11111111-1111-4111-8111-111111111111";
const context:TenantContext={
  tenantId:"fm-corporate",userId:"corporate-admin",role:"owner",
  correlationId:"synthetic-f3-ops",
};
const scope={productId,externalTenantId:"tenant-a",unitId:"unit-a"};
const time=new Date("2026-10-22T12:00:00.000Z");
const proof={userId:context.userId,verifiedAt:time};
const eventId="a".repeat(64);
const config={
  FM_COMMAND_CORE_ALERT_POLICY_ENABLED:"true",
  FM_COMMAND_CORE_ALERT_POLICY_ORIGIN:"https://core.internal.example/",
  FM_COMMAND_CORE_ALERT_POLICY_READER_KEY:"reader-key-".repeat(4),
  FM_COMMAND_CORE_ALERT_POLICY_TRANSPORT_KEY:"command-key-".repeat(4),
  FM_COMMAND_CORE_ALERT_POLICY_PRIVATE_KEY_PEM:"test-key-".repeat(18),
  FM_COMMAND_CORE_ALERT_POLICY_ISSUER:"fm-command",
  FM_COMMAND_CORE_ALERT_POLICY_AUDIENCE:"fm-core-recovery",
  FM_COMMAND_PLATFORM_ORGANIZATION_ID:"fm-corporate",
};
function pending(){
  return {
    tenant_id:"tenant-a",unit_id:"unit-a",status:"pending_review",
    provider_invoice_verified:false,automated_dispatch_enabled:false,
    items:[{
      event_id:eventId,request_id:"req-a",policy_revision:1,
      reasons:["provider_cost_unverified"],
      known_cost_subtotal:"0",currency:null,
      unknown_attempts:1,observed_attempts:1,
      created_at:"2026-10-22T11:30:00+00:00",
    }],
  };
}
function httpMock(handler:(url:string,options:RequestInit)=>Response){
  return vi.fn(async (url:RequestInfo|URL,options?:RequestInit)=>
    handler(String(url),options??{})) as unknown as typeof fetch;
}
beforeEach(()=>{
  vi.resetAllMocks();
  for(const [key,value] of Object.entries(config))vi.stubEnv(key,value);
  mocks.bindings.mockResolvedValue([{id:"bound-fm-customer"}]);
  mocks.sign.mockReturnValue("synthetic-authorized-human-token");
});
afterEach(()=>vi.unstubAllEnvs());
describe("F3 Command operational alerts use authoritative Core and FM identity",()=>{
  it("reads only bounded, scoped, non-billable pending alerts",async()=>{
    const http=httpMock((url,options)=>{
      expect(url).toContain("/v1/admin/ai/usage/alerts/outbox?");
      expect(url).toContain("tenant_id=tenant-a");
      expect(url).toContain("unit_id=unit-a");
      expect((options.headers as Record<string,string>)["X-Core-Admin-Key"])
        .toBe(config.FM_COMMAND_CORE_ALERT_POLICY_READER_KEY);
      return Response.json(pending());
    });
    const result=await readFMFinopsOperationalOutbox(context,scope,http);
    expect(result.items).toHaveLength(1);
    expect(result.provider_invoice_verified).toBe(false);
    expect(result.automated_dispatch_enabled).toBe(false);
    expect(http).toHaveBeenCalledTimes(1);
  });
  it("scans one bounded Core page with signed FM admin token and cursor",async()=>{
    const http=httpMock((url,options)=>{
      expect(url).toBe("https://core.internal.example/internal/v1/command/ai/finops/alert-scan");
      expect(options.redirect).toBe("error");
      expect(options.cache).toBe("no-store");
      expect((options.headers as Record<string,string>).Authorization)
        .toBe("Bearer synthetic-authorized-human-token");
      expect((options.headers as Record<string,string>)["X-FM-Recovery-Service-Key"])
        .toBe(config.FM_COMMAND_CORE_ALERT_POLICY_TRANSPORT_KEY);
      expect(JSON.parse(String(options.body))).toEqual({
        tenant_id:"tenant-a",unit_id:"unit-a",start_date:"2026-10-01",
        end_date:"2026-10-22",limit:50,after_request_id:"req-previous",
      });
      return Response.json({
        created:2,scanned:50,next_cursor:"req-next",
        provider_invoice_verified:false,automated_dispatch_enabled:false,
      });
    });
    const result=await operateFMFinopsAlertOutbox(context,proof,"session-a",scope,{
      kind:"scan",startDate:"2026-10-01",endDate:"2026-10-22",
      afterRequestId:"req-previous",
    },http,time);
    expect(result).toEqual({
      status:"accepted",kind:"scan",created:2,scanned:50,nextCursor:"req-next",
    });
    expect(mocks.authority).toHaveBeenCalledWith(context,true);
    expect(mocks.sign).toHaveBeenCalledOnce();
  });
  it("reviews only event IDs present in the selected tenant/unit pending queue",async()=>{
    const http=httpMock((url,options)=>{
      if(url.includes("/usage/alerts/outbox"))return Response.json(pending());
      expect(url).toContain("/finops/alert-review");
      expect(JSON.parse(String(options.body))).toEqual({event_id:eventId});
      return new Response(null,{status:204});
    });
    expect(await operateFMFinopsAlertOutbox(context,proof,"session-a",scope,{
      kind:"review",eventId,
    },http,time)).toEqual({status:"accepted",kind:"review"});
  });
  it("denies cross-tenant hash review before sending a mutation",async()=>{
    const http=httpMock((url)=>{
      expect(url).toContain("/usage/alerts/outbox");
      return Response.json(pending());
    });
    await expect(operateFMFinopsAlertOutbox(context,proof,"session-a",scope,{
      kind:"review",eventId:"b".repeat(64),
    },http,time)).rejects.toThrow("vende.finops.alert_policy_unavailable");
    expect(http).toHaveBeenCalledTimes(1);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("blocks missing binding, expired reauth and invalid cursor before sending",async()=>{
    const http=vi.fn() as unknown as typeof fetch;
    mocks.bindings.mockResolvedValueOnce([]);
    await expect(operateFMFinopsAlertOutbox(context,proof,"session-a",scope,{
      kind:"scan",startDate:"2026-10-01",endDate:"2026-10-22",
    },http,time)).rejects.toThrow();
    await expect(operateFMFinopsAlertOutbox(context,{
      ...proof,verifiedAt:new Date("2026-10-22T11:50:00.000Z"),
    },"session-a",scope,{
      kind:"scan",startDate:"2026-10-01",endDate:"2026-10-22",
    },http,time)).rejects.toThrow();
    await expect(operateFMFinopsAlertOutbox(context,proof,"session-a",scope,{
      kind:"scan",startDate:"2026-10-01",endDate:"2026-10-22",
      afterRequestId:"../other-tenant",
    },http,time)).rejects.toThrow();
    expect(http).not.toHaveBeenCalled();
  });
  it("rejects unverifiable results instead of claiming a zero-cost settlement",async()=>{
    for(const response of [
      {...pending(),provider_invoice_verified:true},
      {...pending(),tenant_id:"foreign"},
      {...pending(),items:[{...pending().items[0],event_id:"forged"}]},
    ]){
      const http=httpMock(()=>Response.json(response));
      await expect(readFMFinopsOperationalOutbox(context,scope,http))
        .rejects.toThrow();
    }
    const http=httpMock(()=>Response.json({
      created:0,scanned:50,next_cursor:null,
      provider_invoice_verified:true,automated_dispatch_enabled:false,
    }));
    await expect(operateFMFinopsAlertOutbox(context,proof,"session-a",scope,{
      kind:"scan",startDate:"2026-10-01",endDate:"2026-10-22",
    },http,time)).rejects.toThrow();
  });
});
