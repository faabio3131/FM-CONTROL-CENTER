import {describe,expect,it} from "vitest";
import {projectVendeHistoricalObservation}
  from "../src/domain/billing/vende-compensation-audit-projection";
const at=new Date("2026-10-21T22:00:00.000Z");
describe("P01 historical compensation evidence is non-authoritative",()=>{
  it("preserves only known categories, canonical audit time and flags",()=>{
    const x=projectVendeHistoricalObservation({
      result:"remote_applied_finance_reversed",
      metadata:{
        schema:"fm.vende.compensation-observation.v1",
        remediated:false,refundExecuted:false,entitlementMutated:false,
        reviewVersion:2,invoiceState:"paid",
        verifiedFinanceOutcome:"reversed_verified",
        observedAt:"2020-01-01T00:00:00Z",paymentSecret:"must-never-leak",
        remoteOperationId:"private",
      },occurredAt:at,
    });
    expect(x).toMatchObject({
      state:"remote_applied_finance_reversed",reviewVersion:2,
      financeState:"reversed_verified",invoiceState:"paid",
      observedAt:"2026-10-21T22:00:00.000Z",
      historicalOnly:true,currentLicenseVerified:false,remediationConfirmed:false,
    });
    expect(JSON.stringify(x)).not.toMatch(/must-never-leak|remoteOperationId|paymentSecret/);
  });
  it("fails closed for unknown and prototype-key audit values",()=>{
    const x=projectVendeHistoricalObservation({
      result:"<script>secret</script>",
      metadata:{
        reviewVersion:"2",invoiceState:"constructor",
        verifiedFinanceOutcome:"__proto__",
        remediated:true,refundExecuted:true,
      },occurredAt:at,
    });
    expect(x).toMatchObject({
      state:"unclassified",reviewVersion:null,
      financeState:"unavailable",invoiceState:"not_applicable",
      remediationConfirmed:false,
    });
  });
  it("never promotes legacy or inconsistent audit claims into verified history",()=>{
    const suspect=projectVendeHistoricalObservation({
      result:"remote_applied_finance_settled",
      metadata:{
        schema:"fm.vende.compensation-observation.v1",
        remediated:true,refundExecuted:false,entitlementMutated:false,
        reviewVersion:1,verifiedFinanceOutcome:"settled_verified",invoiceState:"paid",
      },occurredAt:at,
    });
    expect(suspect).toMatchObject({
      state:"unclassified",financeState:"unavailable",invoiceState:"not_applicable",
      remediationConfirmed:false,
    });
  });
  it("does not expose a purportedly resolved state",()=>{
    const x=projectVendeHistoricalObservation({
      result:"remote_operation_not_applied",
      metadata:{
        reviewVersion:0,verifiedFinanceOutcome:"unpaid_verified",
        invoiceState:"pending",caseResolved:true,
      },occurredAt:at,
    });
    expect(x.reviewVersion).toBeNull();
    expect(x.historicalOnly).toBe(true);
    expect(x.remediationConfirmed).toBe(false);
  });
});
