import {createHmac} from "node:crypto";
import {beforeEach,describe,expect,it,vi} from "vitest";
import type {PlanProjectionConfig} from "../src/application/billing/assistant-plan-outbox-dispatcher";
import type {TenantContext} from "../src/domain/security/tenant-context";

const mocks=vi.hoisted(()=>({selected:vi.fn(),authority:vi.fn(),outcome:vi.fn()}));
vi.mock("../src/infrastructure/db/client",()=>({
  db:{select:()=>({from:()=>({where:()=>({limit:mocks.selected})})})},
}));
vi.mock("../src/application/billing/assistant-plan-catalog-service",
  ()=>({requireFMPlanAuthority:mocks.authority}));
vi.mock("../src/application/billing/vende-compensation-outcome",
  ()=>({readVendeCorrectionOutcome:mocks.outcome}));
import {
  CORE_QUOTA_READBACK_PATH,CORE_QUOTA_READBACK_SCHEMA,coreQuotaReadbackConfig,
  parseCoreQuotaReadback,readVendeCoreQuotaEvidence,signCoreQuotaReadback,
} from "../src/application/billing/vende-core-quota-readback";

const productId="11111111-1111-4111-8111-111111111111";
const intentId="22222222-2222-4222-8222-222222222222";
const input={productId,intentId,unitId:"unit-a",
  capability:"atendimento_interpretacao" as const};
const now=new Date();
const context={tenantId:"fm",userId:"owner",role:"owner",
  correlationId:"synthetic-correlation"} as TenantContext;
const config={organizationId:"fm"} as PlanProjectionConfig;
const bridge={origin:"https://core.example.test",secret:"synthetic-core-command-proof-transport-secret-12345"};
const metric=(name:string,limit:number,reserved:number)=>({
  metric:name,scope:"tenant",limit_units:limit,window_seconds:86400,
  reserved_units:reserved,consumed_units:0,remaining_units:limit-reserved,policy_revision:1,
});
const coreResult=()=>({
  schema:CORE_QUOTA_READBACK_SCHEMA,tenant_id:"assistant-tenant",
  unit_id:"unit-a",capability:input.capability,
  plan_code:"BASE",plan_revision:1,
  grant_expires_at:Math.floor(Date.now()/1000)+40,
  license_freshly_verified:true,core_policy_matches_signed_grant:true,
  reservation_created:false,provider_called:false,case_resolved:false,
  quota_metrics:[metric("ai.requests",10,2),metric("ai.total_tokens",500,80)],
});
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.selected.mockResolvedValue([{externalTenantId:"assistant-tenant",
    deliveryTarget:{schema:"fm.vende.reactivation-target.v1",planCode:"BASE",
      planRevision:1},state:"delivered"}]);
  mocks.outcome.mockResolvedValue({operationId:"p01.correction."+intentId,
    state:"assistant_active_payment_verified",remoteEntitlementConfirmed:true,
    financialSettlementCurrentlyVerified:true,coreQuotaVerified:false,
    caseResolved:false});
});
describe("P01 authenticated and scoped Command-to-Core quota attestation",()=>{
  it("signs exact bytes with the same S2S domain separator as Core Python",()=>{
    const body='{"schema":"fm.core.ai.quota-readback.v1"}';
    expect(signCoreQuotaReadback(bridge.secret,body)).toBe(
      createHmac("sha256",bridge.secret)
        .update("POST\n"+CORE_QUOTA_READBACK_PATH+"\n"+body).digest("hex"));
  });
  it("keeps integration OFF without explicit trusted HTTPS configuration",()=>{
    expect(()=>coreQuotaReadbackConfig({FM_COMMAND_CORE_QUOTA_READBACK_ENABLED:"false"}))
      .toThrow();
    for(const origin of [
      "http://core.test/","https://user:password@core.test/",
      "https://core.test/path","https://core.test/?token=secret",
      "https://localhost/","https://core.local/",
    ])expect(()=>coreQuotaReadbackConfig({
      FM_COMMAND_CORE_QUOTA_READBACK_ENABLED:"true",
      FM_COMMAND_CORE_QUOTA_READBACK_ORIGIN:origin,
      FM_COMMAND_CORE_QUOTA_READBACK_SECRET:"s".repeat(32),
    })).toThrow();
  });
  it("rejects tampered policy revisions, unknown metrics and partial Core evidence",()=>{
    const scope={tenantId:"assistant-tenant",unitId:"unit-a",
      capability:input.capability,planCode:"BASE",planRevision:1};
    expect(parseCoreQuotaReadback(coreResult(),scope,now)).toHaveLength(2);
    for(const bad of [
      {...coreResult(),tenant_id:"foreign"},
      {...coreResult(),plan_revision:2},
      {...coreResult(),license_freshly_verified:false},
      {...coreResult(),core_policy_matches_signed_grant:false},
      {...coreResult(),reservation_created:true},
      {...coreResult(),case_resolved:true},
      {...coreResult(),quota_metrics:[metric("ai.requests",10,2)]},
      {...coreResult(),quota_metrics:[metric("ai.requests",10,2),metric("ai.requests",10,2)]},
      {...coreResult(),quota_metrics:[metric("ai.requests",10,2),
        metric("ai.total_tokens",500,501)]},
      {...coreResult(),quota_metrics:[metric("ai.requests",10,2),
        {...metric("ai.total_tokens",500,80),policy_revision:2}]},
      {...coreResult(),quota_metrics:[metric("ai.requests",10,2),
        {...metric("ai.total_tokens",500,80),remaining_units:500}]},
      {...coreResult(),grant_expires_at:Math.floor(now.getTime()/1000)-1},
      null,[],false,
    ])expect(()=>parseCoreQuotaReadback(bad,scope,now)).toThrow();
    const withSecrets=parseCoreQuotaReadback({
      ...coreResult(),providerApiKey:"NEVER_PRINT",
      quota_metrics:[{...metric("ai.requests",10,2),secret:"SECRET_BUCKET"},
        metric("ai.total_tokens",500,80)],
    },scope,now);
    expect(JSON.stringify(withSecrets)).not.toMatch(/NEVER_PRINT|SECRET_BUCKET/);
  });
  it("requires verified correction first and after Core read, without consuming quota",async()=>{
    let calls=0;
    const http=(async(_url:RequestInfo|URL,opts?:RequestInit)=>{
      calls++;
      const body=opts?.body as string;
      expect((opts?.headers as Record<string,string>)["X-FM-Command-Quota-Signature"])
        .toBe(signCoreQuotaReadback(bridge.secret,body));
      expect(JSON.parse(body)).toMatchObject({
        schema:CORE_QUOTA_READBACK_SCHEMA,tenant_id:"assistant-tenant",
        unit_id:"unit-a",capability:input.capability,
      });
      return Response.json(coreResult());
    }) as typeof fetch;
    const result=await readVendeCoreQuotaEvidence(context,input,config,bridge,http,http,now);
    expect(result).toMatchObject({
      coreQuotaVerified:true,licenseFreshlyVerified:true,
      caseResolved:false,allUnitsVerified:false,futureAiAdmissionGuaranteed:false,
      providerCalled:false,reservationCreated:false,
    });
    expect(mocks.outcome).toHaveBeenCalledTimes(2);
    expect(calls).toBe(1);
  });
  it("never sends a Core request before commercial settlement is proven",async()=>{
    mocks.outcome.mockResolvedValueOnce({state:"queued"});
    const network=vi.fn();
    await expect(readVendeCoreQuotaEvidence(context,input,config,bridge,
      network as unknown as typeof fetch,network as unknown as typeof fetch,now))
      .rejects.toThrow();
    expect(mocks.selected).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });
  it("rejects second Assistant/PSP readback reversal after Core responded",async()=>{
    mocks.outcome.mockResolvedValueOnce({state:"assistant_active_payment_verified",
      operationId:"p01.correction."+intentId,
      remoteEntitlementConfirmed:true,financialSettlementCurrentlyVerified:true});
    mocks.outcome.mockResolvedValueOnce({state:"needs_reconciliation"});
    const http=(async()=>Response.json(coreResult())) as typeof fetch;
    await expect(readVendeCoreQuotaEvidence(context,input,config,bridge,http,http,now))
      .rejects.toThrow();
  });
  it("does not cross tenant or disclose a Core transport failure as zero usage",async()=>{
    mocks.selected.mockResolvedValueOnce([]);
    const noTransport=vi.fn();
    await expect(readVendeCoreQuotaEvidence(context,input,config,bridge,
      noTransport as unknown as typeof fetch,noTransport as unknown as typeof fetch,now))
      .rejects.toThrow();
    expect(noTransport).not.toHaveBeenCalled();
    const bad=(async()=>Response.json({error:"CORE_SECRET"},{status:503})) as typeof fetch;
    await expect(readVendeCoreQuotaEvidence(context,input,config,bridge,bad,bad,now))
      .rejects.toThrow();
  });
});
