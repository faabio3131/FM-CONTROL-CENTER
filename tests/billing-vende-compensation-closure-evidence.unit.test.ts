import {describe,expect,it,vi} from "vitest";
vi.mock("@/infrastructure/db/client",()=>({db:{}}));
vi.mock("@/application/billing/assistant-plan-catalog-service",
  ()=>({requireFMPlanAuthority:vi.fn()}));
vi.mock("@/application/billing/vende-compensation-outcome",
  ()=>({readVendeCorrectionOutcome:vi.fn()}));
vi.mock("@/application/billing/vende-core-quota-readback",
  ()=>({readVendeCoreQuotaEvidence:vi.fn()}));
import {assertVendeCommercialClosureEvidence,
  projectVendeCommercialClosureStatus,validVendeClosureReview}
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

describe("F9 closing operator provenance cannot be replaced by third party",()=>{
  const valid={
    operatorId:"reviewer-b",reviewerId:"reviewer-b",preparedBy:"preparer-a",
    productId:"11111111-1111-4111-8111-111111111111",intentId,
    reviewVersion:2,observationId:"44444444-4444-4444-8444-444444444444",
    metadata:{
      schema:"fm.vende.compensation-second-review.v1",
      productId:"11111111-1111-4111-8111-111111111111",intentId,
      reviewVersion:2,observationId:"44444444-4444-4444-8444-444444444444",
      preparerId:"preparer-a",reviewerId:"reviewer-b",
      approvedForDispatch:false,remediationDispatched:false,
      entitlementMutated:false,refundExecuted:false,caseResolved:false,
    },
  };
  it("allows only the human who performed the distinct second review",()=>{
    expect(validVendeClosureReview(valid)).toBe(true);
  });
  it.each([
    {operatorId:"preparer-a"},
    {operatorId:"third-operator"},
    {reviewerId:"preparer-a"},
    {preparedBy:"reviewer-b"},
    {reviewVersion:3},
    {observationId:"older-observation"},
    {productId:"foreign"},
    {intentId:"foreign"},
  ])("rejects caller or case mismatch %j",changes=>{
    expect(validVendeClosureReview({...valid,...changes})).toBe(false);
  });
  it.each([
    {reviewerId:"impostor"},
    {preparerId:"other"},
    {remediationDispatched:true},
    {approvedForDispatch:true},
    {caseResolved:true},
    {refundExecuted:true},
    {entitlementMutated:true},
    {schema:"unknown"},
    {reviewVersion:1},
  ])("rejects malformed second-review audit %j",changes=>{
    expect(validVendeClosureReview({
      ...valid,metadata:{...valid.metadata,...changes},
    })).toBe(false);
  });
});
describe("F9 closure status never hides historical audit after reversal",()=>{
  const scope={productId:"11111111-1111-4111-8111-111111111111",intentId};
  const row={
    id:"33333333-3333-4333-8333-333333333333",
    metadata:{
      schema:"fm.vende.compensation-commercial-closure.v1",
      productId:scope.productId,intentId,
      operationId:"p01.correction."+intentId,revision:4,
      capabilities:["atendimento_interpretacao","atendimento_transcricao"],
      unitId:"unit-a",quotaCoverage:"one_unit_both_capabilities",
      commercialCaseClosed:true,caseResolved:true,
      allUnitsVerified:false,providerRefundExecuted:false,
      futureAiAdmissionGuaranteed:false,
    },
  };
  it("returns a currently closed commercial case only with fresh live proof",()=>{
    expect(projectVendeCommercialClosureStatus(scope,status,row,4)).toMatchObject({
      closureRecorded:true,commercialCaseClosed:true,caseResolved:true,
      historicalOnly:false,closureId:row.id,allUnitsVerified:false,
      correctionRevision:4,
    });
  });
  it.each([
    {state:"needs_reconciliation"},
    {state:"queued"},
    {remoteEntitlementConfirmed:false},
    {financialSettlementCurrentlyVerified:false},
  ])("preserves audit but reopens status after adverse conditions %j",diff=>{
    expect(projectVendeCommercialClosureStatus(scope,
      {...status,...diff} as Status,row,4)).toMatchObject({
      closureRecorded:true,commercialCaseClosed:false,caseResolved:false,
      historicalOnly:true,closureId:row.id,closureUnitId:"unit-a",
    });
  });
  it("never accepts stale revision, wrong product or untrusted audit",()=>{
    for(const sample of [
      {scope,row,revision:5},
      {scope:{...scope,productId:"foreign"},row,revision:4},
      {scope,row:{...row,metadata:{...row.metadata,
        capabilities:["atendimento_interpretacao"]}},revision:4},
      {scope,row:{...row,metadata:{...row.metadata,
        futureAiAdmissionGuaranteed:true}},revision:4},
    ]){
      expect(projectVendeCommercialClosureStatus(
        sample.scope,status,sample.row,sample.revision)).toMatchObject({
          closureRecorded:false,commercialCaseClosed:false,caseResolved:false,
          closureId:null,
      });
    }
  });
  it("returns no fabricated historical record for an unclosed case",()=>{
    expect(projectVendeCommercialClosureStatus(scope,status,undefined,4))
      .toMatchObject({closureRecorded:false,caseResolved:false});
  });
});
