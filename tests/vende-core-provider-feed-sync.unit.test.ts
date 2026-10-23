import {beforeEach,describe,expect,it,vi} from "vitest";
import type {TenantContext} from "../src/domain/security/tenant-context";
const mocks=vi.hoisted(()=>({scope:vi.fn(),config:vi.fn(),sign:vi.fn()}));
vi.mock("@/application/billing/vende-core-finops-policy",()=>({
  checkScope:mocks.scope,commandCoreFinopsAlertPolicyConfig:mocks.config,
}));
vi.mock("@/application/integration/fm-core-ai-recovery-jwt",()=>({
  signCoreAIRecoveryAuthorization:mocks.sign,
}));
import {validateProviderFeedSyncRequest,syncProviderExportFeed}
  from "@/application/billing/vende-core-provider-exports";

const input={
  provider:"openai",accountRef:"fm-provider-account",
  startDate:"2026-10-01",endDate:"2026-10-23",page:0,limit:25,
};
describe("F3 governed provider report sync admission",()=>{
  it("permits bounded collection by configured source",()=>{
    expect(()=>validateProviderFeedSyncRequest(input)).not.toThrow();
    expect(()=>validateProviderFeedSyncRequest({...input,page:20000,limit:50}))
      .not.toThrow();
  });
  it.each([
    {provider:"https://evil.example"},
    {accountRef:"../secret"},
    {startDate:"2026-02-30"},
    {startDate:"2026-10-24"},
    {endDate:"2027-12-25"},
    {page:-1},
    {page:20001},
    {page:0.1},
    {limit:0},
    {limit:51},
    {limit:NaN},
  ])("rejects malformed or unbounded scope %j",change=>{
    expect(()=>validateProviderFeedSyncRequest({...input,...change}))
      .toThrow("vende.finops.provider_export_unavailable");
  });
});

const context:TenantContext={
  tenantId:"fm-corporate",userId:"fm-admin",role:"owner",
  correlationId:"synthetic-f9-feed",
};
const scope={productId:"11111111-1111-4111-8111-111111111111",
  externalTenantId:"customer-a",unitId:"unit-a"};
const now=new Date("2026-10-23T12:00:00.000Z");
const proof={userId:"fm-admin",verifiedAt:now};
const counters={created:1,already_recorded:0,unreported:0,scanned:1,
  next_page:1,provider_invoice_verified:false,quota_recovery_authorized:false};
function httpMock(response:Response){
  return vi.fn(async()=>response) as unknown as typeof fetch;
}
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.scope.mockResolvedValue(undefined);
  mocks.config.mockReturnValue({
    origin:"https://core.fm.example",
    privateKeyPem:"synthetic-private-key",
    issuer:"fm-command",audience:"core-ai",
    corporateOrganizationId:"fm-corporate",
    transport:"synthetic-transport-key",
  });
  mocks.sign.mockReturnValue("signed-human-jwt");
});
describe("F9 Command to configured Core provider feed: signed and bounded",()=>{
  it("sends only allowed scope and admits complete observational accounting",async()=>{
    const http=httpMock(Response.json(counters));
    const result=await syncProviderExportFeed(
      context,proof,"session-fm",scope,input,http,now,
    );
    expect(result).toEqual({
      created:1,alreadyRecorded:0,unreported:0,scanned:1,
      nextPage:1,providerInvoiceVerified:false,quotaRecoveryAuthorized:false,
    });
    expect(mocks.scope).toHaveBeenCalledWith(context,scope,true);
    expect(mocks.sign).toHaveBeenCalledOnce();
    expect(http).toHaveBeenCalledOnce();
    const [url,opts]=vi.mocked(http).mock.calls[0];
    expect(url).toBe("https://core.fm.example/internal/v1/command/ai/finops/provider-export/sync");
    expect(opts?.redirect).toBe("error");
    expect(opts?.cache).toBe("no-store");
    expect(opts?.headers).toMatchObject({
      Authorization:"Bearer signed-human-jwt",
      "X-FM-Recovery-Service-Key":"synthetic-transport-key",
    });
    expect(JSON.parse(String(opts?.body))).toEqual({
      tenant_id:"customer-a",unit_id:"unit-a",provider:"openai",
      account_ref:"fm-provider-account",start_date:"2026-10-01",
      end_date:"2026-10-23",page:0,limit:25,
    });
  });
  it("blocks missing binding, expired or foreign human step-up before network",async()=>{
    const http=vi.fn() as unknown as typeof fetch;
    mocks.scope.mockRejectedValueOnce(Error("foreign tenant"));
    await expect(syncProviderExportFeed(
      context,proof,"session-fm",scope,input,http,now,
    )).rejects.toThrow();
    await expect(syncProviderExportFeed(
      context,{...proof,userId:"foreign"},"session-fm",scope,input,http,now,
    )).rejects.toThrow();
    await expect(syncProviderExportFeed(
      context,{...proof,verifiedAt:new Date("2026-10-23T11:50:00Z")},
      "session-fm",scope,input,http,now,
    )).rejects.toThrow();
    expect(http).not.toHaveBeenCalled();
  });
  it.each([
    {...counters,created:0}, // missing counted attempt
    {...counters,created:2}, // impossible count exceeds scan
    {...counters,next_page:0}, // replay current page
    {...counters,next_page:2}, // skip next page
    {...counters,provider_invoice_verified:true},
    {...counters,quota_recovery_authorized:true},
    {...counters,created:true},
  ])("rejects forged or incomplete Core reconciliation %j",async response=>{
    const http=httpMock(Response.json(response));
    await expect(syncProviderExportFeed(
      context,proof,"session-fm",scope,input,http,now,
    )).rejects.toThrow("vende.finops.provider_export_unavailable");
  });
  it("rejects oversized Core bodies without reading unbounded text",async()=>{
    const http=httpMock(new Response("x".repeat(4096),{
      status:200,headers:{"Content-Type":"application/json"},
    }));
    await expect(syncProviderExportFeed(
      context,proof,"session-fm",scope,input,http,now,
    )).rejects.toThrow("vende.finops.provider_export_unavailable");
    expect(http).toHaveBeenCalledOnce();
  });
  it("rejects nonnumeric announced body length before decoding",async()=>{
    const http=httpMock(new Response(JSON.stringify(counters),{
      status:200,headers:{"Content-Length":"invalid"},
    }));
    await expect(syncProviderExportFeed(
      context,proof,"session-fm",scope,input,http,now,
    )).rejects.toThrow("vende.finops.provider_export_unavailable");
  });
});
