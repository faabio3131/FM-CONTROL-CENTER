import {beforeEach,describe,expect,it,vi} from "vitest";
import type {TenantContext} from "../src/domain/security/tenant-context";
const mocks=vi.hoisted(()=>({scope:vi.fn(),config:vi.fn(),sign:vi.fn()}));
vi.mock("@/application/billing/vende-core-finops-policy",()=>({
  checkScope:mocks.scope,commandCoreFinopsAlertPolicyConfig:mocks.config,
}));
vi.mock("@/application/integration/fm-core-ai-recovery-jwt",()=>({
  signCoreAIRecoveryAuthorization:mocks.sign,
}));
import {validateProviderFeedSyncRequest,syncProviderExportFeed,
  validProviderObservationTime,readProviderAttempts,
  readProviderComparison,importProviderExport}
  from "@/application/billing/vende-core-provider-exports";

const input={
  provider:"openai",accountRef:"fm-provider-account",
  startDate:"2026-10-01",endDate:"2026-10-23",page:0,limit:25,
};
describe("F3 governed provider report sync admission",()=>{
  it("permits bounded collection by configured source",()=>{
    const now=new Date("2026-10-23T12:00:00Z");
    expect(()=>validateProviderFeedSyncRequest(input,now)).not.toThrow();
    expect(()=>validateProviderFeedSyncRequest({...input,page:20000,limit:50},now))
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
    expect(()=>validateProviderFeedSyncRequest({...input,...change},
      new Date("2026-10-23T12:00:00Z")))
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
    {...counters,created:0,scanned:0,next_page:1}, // no-progress loop
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

describe("F9 supplier evidence ingress hardening",()=>{
  it("rejects future-only supplier feed dates even with valid chronology",()=>{
    const fixed=new Date("2026-10-23T12:00:00Z");
    expect(()=>validateProviderFeedSyncRequest({
      ...input,startDate:"2026-10-24",endDate:"2026-10-24",
    },fixed)).toThrow("vende.finops.provider_export_unavailable");
    expect(()=>validateProviderFeedSyncRequest({
      ...input,startDate:"2026-10-22",endDate:"2026-10-24",
    },fixed)).toThrow("vende.finops.provider_export_unavailable");
  });
  it("accepts authentic UTC observations but not future/rolled dates",()=>{
    expect(validProviderObservationTime(
      "2026-10-23T12:00:00.000Z",now)).toBe(true);
    expect(validProviderObservationTime(
      "2026-10-23T12:04:59Z",now)).toBe(true);
    for(const invalid of [
      "2026-10-23T12:05:01Z","2026-11-23T12:00:00Z",
      "2026-02-31T12:00:00Z","2026-10-23T24:00:00Z",
      "2026-10-23T12:00:00+03:00","2026-10-23T12:00:00",
      "2026-10-23","2020-01-00T00:00:00Z","not-a-date",
    ])expect(validProviderObservationTime(invalid,now)).toBe(false);
  });
  const attempt={event_id:"event-1",attempt_id:"attempt-1",
    provider:"openai",model:"chat-example",outcome:"completed",
    fallback:false,input_tokens:100,output_tokens:30,
    cost_known_subtotal_usd:"0.00125",cost_known:true};
  const source={attemptId:"attempt-1",provider:"openai",model:"chat-example",
    adapter:"openai_compatible" as const,accountRef:"fm-provider-account",
    sourceRef:"report-1",observedAt:"2026-10-23T12:00:00.000Z",
    usage:{prompt_tokens:100,completion_tokens:30},costUsd:"0.00125"};
  it("rejects nondecimal attempt costs supplied by a compromised Core response",async()=>{
    const good={tenant_id:scope.externalTenantId,unit_id:scope.unitId,
      request_id:"req-1",provider_invoice_verified:false,items:[attempt]};
    const ctx={...scope,requestId:"req-1"};
    expect(await readProviderAttempts(context,ctx,
      httpMock(Response.json(good)))).toHaveLength(1);
    for(const invalid of ["Infinity","NaN","USD 0.01","-1","1e100"]){
      const http=httpMock(Response.json({...good,items:[
        {...attempt,cost_known_subtotal_usd:invalid},
      ]}));
      await expect(readProviderAttempts(context,ctx,http))
        .rejects.toThrow("vende.finops.provider_export_unavailable");
    }
  });
  it("refuses forged amounts in comparison without confusing unknown with zero",async()=>{
    const base={tenant_id:scope.externalTenantId,unit_id:scope.unitId,
      request_id:"req-1",attempt_id:"attempt-1",
      status:"needs_attention",provider:"openai",source_ref:"report-1",
      input_tokens_reported:100,output_tokens_reported:30,
      report_cost_usd:"0.00125",internal_cost_usd:"0.00125",
      usage_matches:true,cost_matches:true,needs_attention:false,
      provider_invoice_verified:false,provider_signature_verified:false,
      quota_recovery_authorized:false};
    const ctx={...scope,requestId:"req-1"};
    expect((await readProviderComparison(context,ctx,"attempt-1",
      httpMock(Response.json(base)))).cost_matches).toBe(true);
    for(const k of ["report_cost_usd","internal_cost_usd"]){
      await expect(readProviderComparison(context,ctx,"attempt-1",
        httpMock(Response.json({...base,[k]:"not a decimal"}))))
        .rejects.toThrow("vende.finops.provider_export_unavailable");
    }
  });
  it("denies future or non-UTC imported observations before remote writes",async()=>{
    for(const invalid of [
      "2026-10-23T13:00:00Z","2026-02-31T12:00:00Z",
      "2026-10-23T12:00:00-03:00",
    ]){
      const http=vi.fn() as unknown as typeof fetch;
      await expect(importProviderExport(context,proof,"session-fm",
        {...scope,requestId:"req-1"},{...source,observedAt:invalid},
        http,now)).rejects.toThrow("vende.finops.provider_export_unavailable");
      expect(http).not.toHaveBeenCalled();
    }
  });
});
