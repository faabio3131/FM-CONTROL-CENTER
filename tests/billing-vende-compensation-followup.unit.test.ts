import {describe,expect,it,vi} from "vitest";
vi.mock("../src/infrastructure/db/client",()=>({db:{}}));
import {evaluateVendeFollowupApproval,projectVendeCompensationFollowup}
  from "../src/application/billing/vende-compensation-review";
const base={
  action:"SUSPEND_DELINQUENCY",
  reason:"delinquency_paid_after_delivery",
  reviewStep:"unreviewed",intentId:null,
  independentReviewComplete:false,approvalCurrent:true,correctionState:null,
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
    [{intentId:"prepared-intent",approvalCurrent:false,independentReviewComplete:true},
      "refresh_current_evidence"],
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
  it("does not use an unspecified freshness assertion to advertise queueing",()=>{
    const outcome=projectVendeCompensationFollowup({
      ...base,intentId:"prepared-intent",independentReviewComplete:true,
      approvalCurrent:undefined,
    });
    expect(outcome.nextAction).toBe("refresh_current_evidence");
    expect(projectVendeCompensationFollowup({
      ...base,intentId:"prepared-intent",approvalCurrent:false,
      correctionState:"delivered",
    }).nextAction).toBe("remote_readback_required");
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

describe("F9 current two-person compensation approval projection",()=>{
  const productId="11111111-1111-4111-8111-111111111111";
  const commandId="22222222-2222-4222-8222-222222222222";
  const intentId="33333333-3333-4333-8333-333333333333";
  const observationId="44444444-4444-4444-8444-444444444444";
  const now=new Date("2026-10-23T05:00:00.000Z");
  const review={version:2,decision:"escalated" as const};
  const observation={
    id:observationId,occurredAt:new Date(now.getTime()-60_000),
    metadata:{schema:"fm.vende.compensation-observation.v1",
      productId,reviewVersion:2,operationId:"suspend-op"},
  };
  const prepared={
    id:intentId,actorId:"operator-one",
    occurredAt:new Date(now.getTime()-40_000),
    metadata:{schema:"fm.vende.compensation-intent.v1",productId,
      commandId,reviewVersion:2,observationId,operationId:"suspend-op",
      preparedBy:"operator-one",approvedForDispatch:false,
      remediationDispatched:false},
  };
  const reviewed={
    actorId:"operator-two",occurredAt:new Date(now.getTime()-20_000),
    metadata:{schema:"fm.vende.compensation-second-review.v1",
      productId,intentId,observationId,reviewVersion:2,
      preparerId:"operator-one",reviewerId:"operator-two",
      approvedForDispatch:false,remediationDispatched:false,
      caseResolved:false},
  };
  const verify=(delta:Record<string,unknown>={})=>
    evaluateVendeFollowupApproval({
      productId,commandId,review,observation,prepared,reviewed,now,
      ...delta,
    });
  it("allows only current independently reviewed evidence as an advisory state",()=>{
    expect(verify()).toEqual({
      currentPreparation:true,currentIndependentReview:true,
    });
  });
  it("rejects expired preparation and future-dated evidence",()=>{
    expect(verify({prepared:{
      ...prepared,occurredAt:new Date(now.getTime()-121_000),
    }}).currentPreparation).toBe(false);
    expect(verify({observation:{
      ...observation,occurredAt:new Date(now.getTime()+1_000),
    }}).currentPreparation).toBe(false);
  });
  it("invalidates old intents after new observations or review versions",()=>{
    expect(verify({observation:{
      ...observation,id:"55555555-5555-4555-8555-555555555555",
    }}).currentPreparation).toBe(false);
    expect(verify({review:{...review,version:3}})
      .currentIndependentReview).toBe(false);
    expect(verify({prepared:{
      ...prepared,metadata:{...prepared.metadata,productId:"foreign"},
    }}).currentPreparation).toBe(false);
  });
  it("rejects identical operators and foreign or stale second reviews",()=>{
    expect(verify({reviewed:{...reviewed,actorId:"operator-one"}})
      .currentIndependentReview).toBe(false);
    expect(verify({reviewed:{
      ...reviewed,metadata:{...reviewed.metadata,intentId:
        "66666666-6666-4666-8666-666666666666"},
    }}).currentIndependentReview).toBe(false);
    expect(verify({reviewed:{
      ...reviewed,occurredAt:new Date(now.getTime()-121_000),
    }}).currentIndependentReview).toBe(false);
    expect(verify({reviewed:undefined})).toEqual({
      currentPreparation:true,currentIndependentReview:false,
    });
  });
});
