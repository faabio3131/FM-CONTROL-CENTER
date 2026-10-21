import { describe, expect, it } from "vitest";
import {
  VENDE_COMMERCIAL_POLICY_V1, VendeCommercialPolicyDenied,
  assessVendeDelinquency, fmLocalCivilDate,
  scheduleVendeDelinquency, type FmApprovedBusinessCalendar,
} from "../src/domain/billing/vende-commercial-policy-v1";
import {
  assessVendeCommercialChange, type VendeCurrentContract,
} from "../src/domain/billing/vende-contract-decisions-v1";

const calendar: FmApprovedBusinessCalendar = {
  authority:"fm_governed_business_calendar",
  revision:"fm-calendar-br-sp-v1",
  timezone:"America/Sao_Paulo",
  validFrom:"2026-10-01",validThrough:"2026-12-31",
  holidays:[],
};
const c: VendeCurrentContract={
  customerId:"customer-old",tenantId:"tenant-old",
  subscriptionId:"subscription-old",planCode:"BASE",
  planRevision:1,status:"active",paidThrough:"2026-11-15",
};
const nowDate="2026-10-20";
describe("FM VendeAtendeIA commercial policy V1, no financial side effects",()=>{
  it("encodes user's approved terms and preserves every feature in every plan",()=>{
    expect(VENDE_COMMERCIAL_POLICY_V1.suspensionCalendarDays).toBe(5);
    expect(VENDE_COMMERCIAL_POLICY_V1.minimumCompletedBusinessDays).toBe(3);
    expect(VENDE_COMMERCIAL_POLICY_V1.timezone).toBe("America/Sao_Paulo");
    expect(VENDE_COMMERCIAL_POLICY_V1.plansDifferByGovernedConsumptionCeilings).toBe(true);
    expect(VENDE_COMMERCIAL_POLICY_V1.allProductFeaturesAvailable).toBe(true);
    expect(VENDE_COMMERCIAL_POLICY_V1.automaticUnmeteredOverages).toBe(false);
  });
  it("suspends at calendar D5 when 3 COMPLETE business days have elapsed",()=>{
    // Monday due: Tue, Wed, Thu business days; Saturday is calendar D5.
    expect(scheduleVendeDelinquency("2026-10-19",calendar)).toMatchObject({
      fifthCalendarDay:"2026-10-24",thirdBusinessDay:"2026-10-22",
      earliestSuspensionDate:"2026-10-24",daysLateAtEarliest:5,
    });
    const input={dueDate:"2026-10-19",contractState:"past_due" as const,
      paymentState:"unpaid_verified_by_authorized_gateway" as const,calendar};
    expect(assessVendeDelinquency({...input,asOfDate:"2026-10-23"})).toMatchObject({
      decision:"not_due",executionAuthorized:false,
    });
    expect(assessVendeDelinquency({...input,asOfDate:"2026-10-24"})).toMatchObject({
      decision:"candidate_for_governed_suspension",
      earliestSuspensionDate:"2026-10-24",executionAuthorized:false,
    });
  });
  it("does not suspend on fifth calendar day while third working day is still in progress",()=>{
    // Friday due: Mon+Tue+Wed are 3 working days. The third day only
    // COMPLETES at Wednesday 23:59:59 local; Thursday is first safe date.
    expect(scheduleVendeDelinquency("2026-10-23",calendar)).toMatchObject({
      fifthCalendarDay:"2026-10-28",thirdBusinessDay:"2026-10-28",
      earliestSuspensionDate:"2026-10-29",daysLateAtEarliest:6,
    });
  });
  it("considers verified regional holidays, including a holiday delaying the third day",()=>{
    const local={...calendar,holidays:["2026-10-26"]};
    expect(scheduleVendeDelinquency("2026-10-23",local)).toMatchObject({
      thirdBusinessDay:"2026-10-29",
      earliestSuspensionDate:"2026-10-30",daysLateAtEarliest:7,
    });
  });
  it("never guesses a business-day calendar, claims a paid invoice is overdue or suspends a canceled account",()=>{
    const input={dueDate:"2026-10-19",asOfDate:"2026-10-30",
      contractState:"active" as const,
      paymentState:"unpaid_verified_by_authorized_gateway" as const,calendar};
    expect(assessVendeDelinquency({...input,calendar:null}).reason)
      .toBe("verified_business_calendar_required");
    expect(assessVendeDelinquency({...input,paymentState:"unverified"}).decision)
      .toBe("blocked");
    expect(assessVendeDelinquency({
      ...input,paymentState:"settled_by_authorized_gateway",
    }).reason).toBe("invoice_already_settled");
    expect(assessVendeDelinquency({...input,contractState:"cancelled"}).decision)
      .toBe("blocked");
  });
  it("rejects fabricated/underspecified calendar, invalid dates and missing coverage",()=>{
    expect(()=>scheduleVendeDelinquency("2026-02-30",calendar))
      .toThrow(VendeCommercialPolicyDenied);
    expect(()=>scheduleVendeDelinquency("2026-10-23",
      {...calendar,holidays:["2026-10-26","2026-10-26"]}))
      .toThrow("vende.calendar_holidays_invalid");
    expect(()=>scheduleVendeDelinquency("2026-10-23",
      {...calendar,validThrough:"2026-10-26"}))
      .toThrow("vende.calendar_coverage_incomplete");
    expect(()=>scheduleVendeDelinquency("2026-10-23",
      {...calendar,authority:"fm_governed_business_calendar",revision:"bad"}))
      .toThrow("vende.calendar_authority_unavailable");
  });
  it("uses the Sao Paulo civil day, never UTC implicitly or 24h rolling clock",()=>{
    expect(fmLocalCivilDate(new Date("2026-10-24T02:30:00Z"))).toBe("2026-10-23");
    expect(fmLocalCivilDate(new Date("2026-10-24T03:00:00Z"))).toBe("2026-10-24");
  });
});
describe("FM VendeAtendeIA full-functions and subscription lifecycle",()=>{
  it("cancellation immediately disables future renewal but preserves paid days",()=>{
    const assessment=assessVendeCommercialChange({
      action:"cancel",contract:c,nowDate,customerConsent:true,
    });
    expect(assessment).toMatchObject({
      next:"schedule_end_of_paid_period",effectiveDate:"2026-11-15",
      preservesCurrentIdentity:true,executionAuthorized:false,
    });
    expect(assessVendeCommercialChange({
      action:"cancel",contract:c,nowDate,customerConsent:false,
    }).next).toBe("blocked");
  });
  it("only reactivates an existing suspended/past-due contract after verified payment",()=>{
    const contract={...c,status:"suspended" as const};
    expect(assessVendeCommercialChange({
      action:"regularize",contract,nowDate,
      paymentState:"settled_by_authorized_gateway",chargebackOpen:false,
    })).toMatchObject({next:"reactivate_suspended_same_identity",
      preservesCurrentIdentity:true,executionAuthorized:false});
    for(const paymentState of ["unverified","unpaid_verified_by_authorized_gateway"] as const){
      expect(assessVendeCommercialChange({
        action:"regularize",contract,nowDate,paymentState,chargebackOpen:false,
      }).next).toBe("blocked");
    }
    expect(assessVendeCommercialChange({
      action:"regularize",contract:{...contract,status:"cancelled"},nowDate,
      paymentState:"settled_by_authorized_gateway",chargebackOpen:false,
    }).next).toBe("blocked");
    expect(assessVendeCommercialChange({
      action:"regularize",contract,nowDate,
      paymentState:"settled_by_authorized_gateway",chargebackOpen:true,
    }).next).toBe("blocked");
  });
  it("return after final cancellation requires NEW independent IDs and new contract/payment, no trial reset",()=>{
    const returned={action:"return_after_cancel" as const,contract:{...c,status:"cancelled" as const},
      nowDate,newCustomerId:"customer-new",newTenantId:"tenant-new",
      newSubscriptionId:"subscription-new",newContractAccepted:true,
      newPaymentState:"settled_by_authorized_gateway" as const};
    expect(assessVendeCommercialChange(returned)).toMatchObject({
      next:"new_contract_new_id",preservesCurrentIdentity:false,
      permitsTrialReuse:false,executionAuthorized:false,
    });
    expect(assessVendeCommercialChange({...returned,newCustomerId:"customer-old"}).next)
      .toBe("blocked");
    expect(assessVendeCommercialChange({...returned,newTenantId:"tenant-old"}).next)
      .toBe("blocked");
    expect(assessVendeCommercialChange({...returned,newSubscriptionId:"subscription-old"}).next)
      .toBe("blocked");
    expect(assessVendeCommercialChange({...returned,newTenantId:"customer-new"}).next)
      .toBe("blocked");
    expect(assessVendeCommercialChange({...returned,newPaymentState:"unverified"}).next)
      .toBe("blocked");
    expect(assessVendeCommercialChange({...returned,newContractAccepted:false}).next)
      .toBe("blocked");
  });
  it("upgrade requires accepted proportional confirmed charge, downgrade defers to next cycle",()=>{
    const upgrade={action:"upgrade" as const,contract:c,nowDate,
      targetPlanCode:"PLUS",targetRevision:2,
      proportionalPayment:"settled_by_authorized_gateway" as const,
      customerAcceptedProportionalDifference:true};
    expect(assessVendeCommercialChange(upgrade)).toMatchObject({
      next:"upgrade_after_proportional_settlement",effectiveDate:nowDate,
      preservesCurrentIdentity:true,executionAuthorized:false,
    });
    expect(assessVendeCommercialChange({...upgrade,
      proportionalPayment:"unverified"}).next).toBe("blocked");
    expect(assessVendeCommercialChange({...upgrade,
      customerAcceptedProportionalDifference:false}).next).toBe("blocked");
    expect(assessVendeCommercialChange({
      action:"downgrade",contract:c,nowDate,targetPlanCode:"MINI",
      targetRevision:1,customerConsent:true,
    })).toMatchObject({next:"schedule_downgrade",
      effectiveDate:"2026-11-15",executionAuthorized:false});
  });
  it("no implicit renewal or automatic refund/chargeback financial mutation",()=>{
    expect(assessVendeCommercialChange({
      action:"renew",contract:c,nowDate,renewalConsent:true,
      paymentState:"unverified",
    }).next).toBe("blocked");
    expect(assessVendeCommercialChange({
      action:"renew",contract:c,nowDate,renewalConsent:true,
      paymentState:"settled_by_authorized_gateway",
    }).next).toBe("renew_after_verified_settlement");
    expect(assessVendeCommercialChange({
      action:"refund",contract:c,nowDate,
    })).toMatchObject({next:"refund_manual_compliance_review",
      executionAuthorized:false});
    expect(assessVendeCommercialChange({
      action:"chargeback",contract:c,nowDate,
    })).toMatchObject({next:"chargeback_manual_reconciliation",
      executionAuthorized:false});
  });
});
