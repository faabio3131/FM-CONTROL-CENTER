import {describe,expect,it,vi} from "vitest";
vi.mock("../src/infrastructure/db/client",()=>({db:{}}));
import {projectVendeCompensationFollowup}
  from "../src/application/billing/vende-compensation-review";
const base={
  action:"SUSPEND_DELINQUENCY",
  reason:"delinquency_paid_after_delivery",
  reviewStep:"unreviewed",intentId:null,
  independentReviewComplete:false,correctionState:null,
};
describe("F9 per-case compensation operational followup",()=>{
  const cases=[
    [{}, "initial_review_required"],
    [{reviewStep:"investigating"}, "refresh_current_evidence"],
    [{reviewStep:"escalated"}, "correction_preparation_required"],
    [{reviewStep:"escalated",action:"RENEW_VERIFIED"},
      "other_risk_investigation"],
    [{intentId:"prepared-intent"}, "independent_review_required"],
    [{intentId:"prepared-intent",independentReviewComplete:true},
      "queue_authorization_required"],
    [{intentId:"prepared-intent",correctionState:"pending"},
      "correction_queued"],
    [{intentId:"prepared-intent",correctionState:"processing"},
      "correction_processing"],
    [{intentId:"prepared-intent",correctionState:"unknown"},
      "manual_reconciliation_required"],
    [{intentId:"prepared-intent",correctionState:"blocked"},
      "manual_reconciliation_required"],
    [{intentId:"prepared-intent",correctionState:"delivered"},
      "remote_readback_required"],
  ] as const;
  it.each(cases)("maps %j only to %s", (delta,status)=>{
    const row=projectVendeCompensationFollowup({...base,...delta});
    expect(row.nextAction).toBe(status);
    expect(row).toMatchObject({
      currentEntitlementVerified:false,financialRepairExecuted:false,
      caseResolved:false,automaticRemediationAuthorized:false,
    });
  });
  it("never treats non-correctable reversal as safe automatic repair",()=>{
    const row=projectVendeCompensationFollowup({
      ...base,action:"APPLY_UPGRADE",
      reason:"plan_change_payment_reversed_after_delivery",
      reviewStep:"escalated",
    });
    expect(row.nextAction).toBe("other_risk_investigation");
    expect(row.intentId).toBeNull();
    expect(row.caseResolved).toBe(false);
  });
});
