import {describe,expect,it,vi} from "vitest";
vi.mock("@/infrastructure/db/client",()=>({db:{}}));
vi.mock("@/application/billing/assistant-plan-catalog-service",
  ()=>({requireFMPlanAuthority:vi.fn()}));
vi.mock("@/application/billing/vende-compensation-outcome",
  ()=>({readVendeCorrectionOutcome:vi.fn()}));
vi.mock("@/application/billing/vende-core-quota-readback",
  ()=>({readVendeCoreQuotaEvidence:vi.fn()}));
import {assertVendeCommercialClosureEvidence}
  from "@/application/billing/vende-compensation-closure";
type Status=Parameters<typeof assertVendeCommercialClosureEvidence>[1];
type Quotas=Parameters<typeof assertVendeCommercialClosureEvidence>[2];
const intentId="22222222-2222-4222-8222-222222222222";
const status={
  intentId,operationId:"p01.correction."+intentId,
  state:"assistant_active_payment_verified",
  remoteEntitlementConfirmed:true,
  financialSettlementCurrentlyVerified:true,
  providerRefundExecuted:false,coreQuotaVerified:false,caseResolved:false,
} as Status;
const unitId="unit-a";
const metric=(name:string)=>({
  metric:name,scope:"unit",limitUnits:100,windowSeconds:3600,
  reservedUnits:0,consumedUnits:25,remainingUnits:75,
});
const quotas=[
  {intentId,unitId,capability:"atendimento_interpretacao",
    state:"core_unit_policy_verified",licenseFreshlyVerified:true,
    coreQuotaVerified:true,quotaMetrics:[metric("ai.requests"),metric("ai.total_tokens")],
    caseResolved:false,providerCalled:false,reservationCreated:false,
    allUnitsVerified:false,futureAiAdmissionGuaranteed:false},
  {intentId,unitId,capability:"atendimento_transcricao",
    state:"core_unit_policy_verified",licenseFreshlyVerified:true,
    coreQuotaVerified:true,quotaMetrics:[metric("ai.requests"),metric("ai.total_tokens")],
    caseResolved:false,providerCalled:false,reservationCreated:false,
    allUnitsVerified:false,futureAiAdmissionGuaranteed:false},
] as Quotas;
const validate=(s:Status=status,q:Quotas=quotas)=>
  assertVendeCommercialClosureEvidence({intentId,unitId},s,q);
describe("F9 governed closure admission uses both Core capability proofs",()=>{
  it("admits only the current verified financial case and both Core capabilities",()=>{
    expect(()=>validate()).not.toThrow();
  });
  it.each([
    {state:"needs_reconciliation"},
    {remoteEntitlementConfirmed:false},
    {financialSettlementCurrentlyVerified:false},
    {caseResolved:true},
    {coreQuotaVerified:true},
    {operationId:"p01.correction.foreign"},
  ])("blocks noncurrent or inconsistent commercial status %j",change=>{
    expect(()=>validate({...status,...change} as Status)).toThrow(
      "vende.compensation_closure_denied",
    );
  });
  it("denies missing or repeated Core capability checks",()=>{
    expect(()=>validate(status,[quotas[0]] as Quotas)).toThrow();
    expect(()=>validate(status,[quotas[0],quotas[0]] as Quotas)).toThrow();
  });
  it.each([
    {unitId:"foreign-unit"},
    {licenseFreshlyVerified:false},
    {coreQuotaVerified:false},
    {providerCalled:true},
    {reservationCreated:true},
    {allUnitsVerified:true},
    {futureAiAdmissionGuaranteed:true},
    {quotaMetrics:[metric("ai.requests")]},
  ])("denies untrusted or incomplete Core status %j",change=>{
    expect(()=>validate(status,[quotas[0],
      {...quotas[1],...change}] as Quotas)).toThrow();
  });
});
