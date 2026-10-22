import {describe,expect,it} from "vitest";
import {describeVendeCompensationObservation} from "../src/domain/billing/vende-compensation-observation-view";
const base={
  remoteObserved:true,remediationDispatched:false,
  automaticCompensationAuthorized:false,caseResolved:false,
  financeState:"settled_verified",invoiceState:"paid",
};
describe("P01 compensation observation view is presentation-only",()=>{
  it("flags a settlement after remote suspension without claiming repair",()=>{
    const view=describeVendeCompensationObservation({
      ...base,state:"remote_suspended_after_finance_settled",
    });
    expect(view).toMatchObject({
      level:"critical",financeLabel:"Liquidação verificada",
      invoiceLabel:"Fatura paga no Command",
    });
    expect(view?.heading).toContain("suspensão");
    expect(view?.notice).toContain("permanece aberto");
  });
  it("distinguishes reversal and other read-only outcomes",()=>{
    expect(describeVendeCompensationObservation({
      ...base,state:"remote_applied_finance_reversed",
      financeState:"reversed_verified",
    })?.level).toBe("critical");
    expect(describeVendeCompensationObservation({
      ...base,state:"remote_applied_finance_settled",
    })?.level).toBe("attention");
    expect(describeVendeCompensationObservation({
      ...base,state:"remote_operation_not_applied",
      financeState:"unavailable",invoiceState:"not_applicable",
    })?.heading).toContain("não aplicada");
    expect(describeVendeCompensationObservation({
      ...base,state:"human_reconciliation_required",
      financeState:"unpaid_verified",invoiceState:"pending",
    })?.level).toBe("review");
  });
  it("rejects mutated, alleged-resolved or unverified responses",()=>{
    for(const variant of [
      {...base,state:"remote_applied_finance_settled",caseResolved:true},
      {...base,state:"remote_applied_finance_settled",remediationDispatched:true},
      {...base,state:"remote_applied_finance_settled",automaticCompensationAuthorized:true},
      {...base,state:"remote_applied_finance_settled",remoteObserved:false},
      {...base,state:"remote_applied_finance_settled",remediationDispatched:undefined},
      {...base,state:"remote_suspended_after_finance_settled",financeState:"unavailable"},
      {...base,state:"remote_applied_finance_reversed",financeState:"settled_verified"},
      {...base,state:"remote_applied_finance_settled",financeState:"__proto__"},
      {...base,state:"remote_applied_finance_settled",invoiceState:"constructor"},
      {...base,state:"<script>alert('secret')</script>"},
      {...base,state:"unknown",financeState:"unknown"},
      null,[],"raw text",
    ])expect(describeVendeCompensationObservation(variant)).toBeNull();
  });
  it("never echoes arbitrary provider or financial references",()=>{
    const view=describeVendeCompensationObservation({
      ...base,state:"remote_operation_not_applied",
      providerResponse:"SECRET-PSP-REF",customerId:"PII-123",
    });
    expect(JSON.stringify(view)).not.toContain("SECRET-PSP-REF");
    expect(JSON.stringify(view)).not.toContain("PII-123");
  });
});
