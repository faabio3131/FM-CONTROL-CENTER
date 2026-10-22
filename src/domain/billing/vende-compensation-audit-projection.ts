/** Safe presentation of past compensation observations from append-only audit.
 * Values in audit metadata must never be treated as live provider evidence.
 */
const STATES = [
  "remote_suspended_after_finance_settled",
  "remote_applied_finance_reversed",
  "remote_applied_finance_settled",
  "remote_operation_not_applied",
  "human_reconciliation_required",
] as const;
const FINANCE = ["settled_verified","reversed_verified","unpaid_verified","unavailable"] as const;
const INVOICE = ["paid","pending","other","not_applicable"] as const;
type State = typeof STATES[number] | "unclassified";
type Finance = typeof FINANCE[number] | "unavailable";
type Invoice = typeof INVOICE[number] | "not_applicable";
const choose = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "string" && values.some(code=>code===value) ? value as T : fallback;

export type HistoricalVendeObservation = {
  state:State;
  financeState:Finance;
  invoiceState:Invoice;
  reviewVersion:number|null;
  observedAt:string;
  historicalOnly:true;
  currentLicenseVerified:false;
  remediationConfirmed:false;
};
export function projectVendeHistoricalObservation(
  row:{result:string;metadata:Record<string,unknown>;occurredAt:Date},
):HistoricalVendeObservation {
  const meta=row.metadata;
  const version=meta.reviewVersion;
  const reviewVersion=typeof version==="number"&&Number.isSafeInteger(version)&&version>0
    ?version:null;
  // Audit occurrence time is canonical: metadata timestamps are untrusted.
  const observedAt=row.occurredAt.toISOString();
  // The signed observation recorded only non-authoritative history.
  const state=choose(STATES,row.result,"unclassified" as State);
  const financeState=choose(FINANCE,meta.verifiedFinanceOutcome,"unavailable");
  const invoiceState=choose(INVOICE,meta.invoiceState,"not_applicable");
  return {
    state,financeState,invoiceState,reviewVersion,observedAt,
    historicalOnly:true,currentLicenseVerified:false,remediationConfirmed:false,
  };
}
