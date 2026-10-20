/**
 * FM-owned VendeAtendeIA V1 lifecycle decisions, never a billing executor.
 * Distinguishes suspension from FINAL cancellation; an ex-customer returns
 * with three distinct identities, not by silently reactivating a closed ID.
 */
import {
  VENDE_COMMERCIAL_POLICY_V1, VendeCommercialPolicyDenied,
  type RecordedContractState, type VerifiedPaymentState,
} from "./vende-commercial-policy-v1";

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/;
const DATE = /^(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const asDate = (value:string) => {
  if(!DATE.test(value) || new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value)
    throw new VendeCommercialPolicyDenied("vende.contract_date_invalid");
  return value;
};
export interface VendeCurrentContract {
  readonly customerId:string;readonly tenantId:string;readonly subscriptionId:string;
  readonly status:RecordedContractState;readonly paidThrough:string|null;
  readonly planCode:string;readonly planRevision:number;
}
export type VendeLifecycleChoice = Readonly<{
  policyVersion:typeof VENDE_COMMERCIAL_POLICY_V1.version;
  next:"schedule_end_of_paid_period"|"renew_after_verified_settlement"|
    "schedule_downgrade"|"upgrade_after_proportional_settlement"|
    "reactivate_suspended_same_identity"|"new_contract_new_id"|
    "refund_manual_compliance_review"|"chargeback_manual_reconciliation"|"blocked";
  reason:string;
  effectiveDate:string|null;
  preservesCurrentIdentity:boolean;
  permitsTrialReuse:false;
  /** Plan/business decision only; monetary & entitlement mutation must go
   * through canonical Command ledger, CAS, outbox, signed ACK and audit. */
  executionAuthorized:false;
}>;
const output=(next:VendeLifecycleChoice["next"],reason:string,effectiveDate:string|null,preserve:boolean):VendeLifecycleChoice=>({
  policyVersion:VENDE_COMMERCIAL_POLICY_V1.version,next,reason,effectiveDate,
  preservesCurrentIdentity:preserve,permitsTrialReuse:false,
  executionAuthorized:false,
});
function requireIdentity(contract:VendeCurrentContract):void {
  if(![contract.customerId,contract.tenantId,contract.subscriptionId,contract.planCode]
    .every(x=>ID.test(x)) ||
    !Number.isSafeInteger(contract.planRevision) || contract.planRevision<1)
    throw new VendeCommercialPolicyDenied("vende.contract_identity_invalid");
}
const blocked=(reason:string)=>output("blocked",reason,null,false);

/** Operates only on a trusted Command state snapshot. No network operations. */
export function assessVendeCommercialChange(input:
  | {readonly action:"cancel";readonly contract:VendeCurrentContract;
    readonly nowDate:string;readonly customerConsent:boolean}
  | {readonly action:"renew";readonly contract:VendeCurrentContract;
    readonly nowDate:string;readonly paymentState:VerifiedPaymentState;
    readonly renewalConsent:boolean}
  | {readonly action:"upgrade";readonly contract:VendeCurrentContract;
    readonly nowDate:string;readonly targetPlanCode:string;
    readonly targetRevision:number;readonly proportionalPayment:VerifiedPaymentState;
    readonly customerAcceptedProportionalDifference:boolean}
  | {readonly action:"downgrade";readonly contract:VendeCurrentContract;
    readonly nowDate:string;readonly targetPlanCode:string;
    readonly targetRevision:number;readonly customerConsent:boolean}
  | {readonly action:"regularize";readonly contract:VendeCurrentContract;
    readonly nowDate:string;readonly paymentState:VerifiedPaymentState;
    readonly chargebackOpen:boolean}
  | {readonly action:"return_after_cancel";readonly contract:VendeCurrentContract;
    readonly nowDate:string;readonly newCustomerId:string;
    readonly newTenantId:string;readonly newSubscriptionId:string;
    readonly newContractAccepted:boolean;
    readonly newPaymentState:VerifiedPaymentState}
  | {readonly action:"refund"|"chargeback";readonly contract:VendeCurrentContract;
    readonly nowDate:string},
):VendeLifecycleChoice {
  const {contract,nowDate}=input;
  requireIdentity(contract);
  asDate(nowDate);
  const through=contract.paidThrough === null?null:asDate(contract.paidThrough);
  switch(input.action) {
    case "cancel":
      if(!input.customerConsent)return blocked("customer_cancellation_consent_missing");
      if(!["active","past_due","suspended"].includes(contract.status))
        return blocked("contract_not_cancelable");
      return through && through>=nowDate
        ?output("schedule_end_of_paid_period","stop_future_renewal_preserve_paid_access",through,true)
        :blocked("paid_period_unavailable_or_expired");
    case "renew":
      if(contract.status!=="active"||!input.renewalConsent)
        return blocked("renewal_not_authorized");
      return input.paymentState==="settled_by_authorized_gateway"
        ?output("renew_after_verified_settlement","new_period_and_price_must_be_reconciled",null,true)
        :blocked("renewal_payment_not_verified");
    case "upgrade":
      if(contract.status!=="active" || !ID.test(input.targetPlanCode) ||
         !Number.isSafeInteger(input.targetRevision) || input.targetRevision<1 ||
         input.targetPlanCode===contract.planCode && input.targetRevision===contract.planRevision)
        return blocked("upgrade_target_or_contract_invalid");
      if(!input.customerAcceptedProportionalDifference ||
          input.proportionalPayment!=="settled_by_authorized_gateway")
        return blocked("proportional_upgrade_not_paid_and_accepted");
      return output("upgrade_after_proportional_settlement",
        "preserve_existing_renewal_date_and_verify_entitlement",nowDate,true);
    case "downgrade":
      if(contract.status!=="active" || !input.customerConsent ||
         !ID.test(input.targetPlanCode) ||
         !Number.isSafeInteger(input.targetRevision) || input.targetRevision<1 ||
         input.targetPlanCode===contract.planCode && input.targetRevision===contract.planRevision)
        return blocked("downgrade_target_or_consent_invalid");
      return through && through>nowDate
        ?output("schedule_downgrade","preserve_current_limits_until_next_cycle",through,true)
        :blocked("current_paid_period_missing");
    case "regularize":
      if(!["past_due","suspended"].includes(contract.status) ||
         input.chargebackOpen || input.paymentState!=="settled_by_authorized_gateway")
        return blocked("existing_contract_reactivation_not_verified");
      return output("reactivate_suspended_same_identity",
        "same_customer_tenant_subscription_after_settlement",nowDate,true);
    case "return_after_cancel": {
      if(contract.status!=="cancelled"||!input.newContractAccepted ||
         input.newPaymentState!=="settled_by_authorized_gateway" ||
         ![input.newCustomerId,input.newTenantId,input.newSubscriptionId].every(x=>ID.test(x)) ||
         input.newCustomerId===contract.customerId ||
         input.newTenantId===contract.tenantId ||
         input.newSubscriptionId===contract.subscriptionId ||
         new Set([input.newCustomerId,input.newTenantId,input.newSubscriptionId]).size!==3)
        return blocked("new_contract_distinct_identity_or_payment_missing");
      return output("new_contract_new_id",
        "fresh_customer_tenant_subscription_no_trial_reset",nowDate,false);
    }
    case "refund":
      return output("refund_manual_compliance_review",
        "mandatory_consumer_rights_and_authorized_gateway_procedure",null,true);
    case "chargeback":
      return output("chargeback_manual_reconciliation",
        "separate_security_hold_from_financial_dispute",null,true);
  }
}
