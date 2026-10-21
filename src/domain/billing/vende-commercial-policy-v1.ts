/**
 * FM Tecnologia-approved VendeAtendeIA commercial policy V1 (2026-10-20).
 * PURE domain decisions only. NEVER issues invoices, changes subscription
 * state, extends entitlements, or authorizes a network command.
 *
 * "Fifth calendar day, never before three COMPLETE business days" means:
 * D0 = due date; D1 = next local calendar day; earliest suspension begins
 * at local midnight on max(D0+5, day AFTER the third business day).
 * Weekends and holidays MUST come from an FM-reviewed calendar proof.
 */
export const VENDE_COMMERCIAL_POLICY_V1 = Object.freeze({
  version: "fm.vende.commercial.v1.2026-10-20",
  timezone: "America/Sao_Paulo",
  suspensionCalendarDays: 5,
  minimumCompletedBusinessDays: 3,
  allProductFeaturesAvailable: true,
  plansDifferByGovernedConsumptionCeilings: true,
  automaticUnmeteredOverages: false,
  voluntaryCancellation: "end_of_paid_period",
  renewal: "auto_only_if_authorized_and_payment_reconciled",
  upgrade: "confirmed_proportional_payment_or_schedule_later",
  downgrade: "next_billing_cycle",
  reinstatement: "same_ids_only_if_current_contract_was_suspended",
  returnAfterFinalCancellation: "new_customer_tenant_subscription_ids",
  newFreeTrialOnReturn: false,
  chargeback: "governed_hold_and_manual_financial_reconciliation",
  refund: "consumer_rights_plus_manual_governed_review",
} as const);

export type CivilDate = string & { readonly __brand: "America/Sao_Paulo civil day" };
export class VendeCommercialPolicyDenied extends Error {
  constructor(code: string) { super(code); }
}
const DATE = /^(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const DAY = 86_400_000;
const UTC_DATE = (date: Date) => date.toISOString().slice(0,10);
function dateValue(value: string): number {
  const m=DATE.exec(value);
  if(!m)throw new VendeCommercialPolicyDenied("vende.calendar_date_invalid");
  const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
  const number=Date.UTC(year,month-1,day);
  if (UTC_DATE(new Date(number))!==value)
    throw new VendeCommercialPolicyDenied("vende.calendar_date_invalid");
  return number;
}
function datePlus(value: string, days: number): string {
  return UTC_DATE(new Date(dateValue(value)+days*DAY));
}
export function fmLocalCivilDate(at: Date): string {
  if(!Number.isFinite(at.getTime()))
    throw new VendeCommercialPolicyDenied("vende.clock_invalid");
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:VENDE_COMMERCIAL_POLICY_V1.timezone,
    year:"numeric",month:"2-digit",day:"2-digit",hourCycle:"h23",
  }).formatToParts(at);
  const find=(type:string)=>parts.find(x=>x.type===type)?.value;
  return `${find("year")}-${find("month")}-${find("day")}`;
}
/**
 * A trusted backend/calendar registry MUST supply this record; client
 * headers/body are not acceptable calendar evidence. Format verification
 * below prevents impossible dates, duplicates, gaps and early suspension,
 * but alone cannot authenticate the issuing registry.
 */
export interface FmApprovedBusinessCalendar {
  readonly authority: "fm_governed_business_calendar";
  readonly revision: string;
  readonly timezone: "America/Sao_Paulo";
  readonly validFrom: string;
  readonly validThrough: string;
  readonly holidays: readonly string[];
}
export function validateVendeBusinessCalendar(calendar: FmApprovedBusinessCalendar | null): {
  readonly from: number; readonly through: number; readonly holidays: ReadonlySet<string>;
} {
  if (!calendar || calendar.authority!=="fm_governed_business_calendar" ||
      calendar.timezone!=="America/Sao_Paulo" ||
      !/^[A-Za-z0-9][A-Za-z0-9_.:-]{3,95}$/.test(calendar.revision) ||
      !Array.isArray(calendar.holidays) || calendar.holidays.length>400)
    throw new VendeCommercialPolicyDenied("vende.calendar_authority_unavailable");
  const from=dateValue(calendar.validFrom),through=dateValue(calendar.validThrough);
  if(from>through || (through-from)/DAY>730)
    throw new VendeCommercialPolicyDenied("vende.calendar_coverage_invalid");
  const holidays=new Set(calendar.holidays);
  if(holidays.size!==calendar.holidays.length)
    throw new VendeCommercialPolicyDenied("vende.calendar_holidays_invalid");
  for(const holiday of calendar.holidays) {
    const date=dateValue(holiday);
    if(date<from || date>through)
      throw new VendeCommercialPolicyDenied("vende.calendar_holidays_invalid");
  }
  return {from,through,holidays};
}
function isWorkingDay(day:string, holidays:ReadonlySet<string>):boolean {
  const weekday=new Date(dateValue(day)).getUTCDay();
  return weekday!==0 && weekday!==6 && !holidays.has(day);
}
export interface DelinquencySchedule {
  readonly policyVersion: typeof VENDE_COMMERCIAL_POLICY_V1.version;
  readonly dueDate: string;
  readonly fifthCalendarDay: string;
  readonly thirdBusinessDay: string;
  readonly earliestSuspensionDate: string;
  readonly calendarRevision: string;
  readonly timezone: "America/Sao_Paulo";
  readonly completedBusinessDays: 3;
  readonly daysLateAtEarliest: number;
}
/** A date-only schedule; no service writes, wall-clock guessing or provider calls. */
export function scheduleVendeDelinquency(
  dueDate: string, calendar: FmApprovedBusinessCalendar | null,
): DelinquencySchedule {
  const evidence=validateVendeBusinessCalendar(calendar);
  const due=dateValue(dueDate);
  if(due<evidence.from || due>evidence.through)
    throw new VendeCommercialPolicyDenied("vende.calendar_coverage_incomplete");
  const fifthCalendarDay=datePlus(dueDate,5);
  let completed=0, day=dueDate;
  for(let n=0;n<366 && completed<3;n++){
    day=datePlus(day,1);
    if(dateValue(day)>evidence.through)
      throw new VendeCommercialPolicyDenied("vende.calendar_coverage_incomplete");
    if(isWorkingDay(day,evidence.holidays))completed++;
  }
  if(completed!==3)throw new VendeCommercialPolicyDenied("vende.calendar_coverage_incomplete");
  // The third *full* business day must finish before suspension is allowed.
  const completedAtStart=datePlus(day,1);
  const earliestSuspensionDate=dateValue(fifthCalendarDay)>dateValue(completedAtStart)
    ?fifthCalendarDay:completedAtStart;
  if(dateValue(earliestSuspensionDate)>evidence.through)
    throw new VendeCommercialPolicyDenied("vende.calendar_coverage_incomplete");
  return {
    policyVersion:VENDE_COMMERCIAL_POLICY_V1.version,dueDate,
    fifthCalendarDay,thirdBusinessDay:day,earliestSuspensionDate,
    calendarRevision:calendar!.revision,timezone:"America/Sao_Paulo",
    completedBusinessDays:3,daysLateAtEarliest:
      (dateValue(earliestSuspensionDate)-due)/DAY,
  };
}
export type VerifiedPaymentState =
  | "settled_by_authorized_gateway"
  | "unpaid_verified_by_authorized_gateway"
  | "unverified";
export type RecordedContractState = "pending"|"active"|"past_due"|"suspended"|"cancelled";
export interface GovernedLifecycleAssessment {
  readonly policyVersion: typeof VENDE_COMMERCIAL_POLICY_V1.version;
  readonly decision: "not_due"|"candidate_for_governed_suspension"|"blocked";
  readonly reason: string;
  readonly dueDate: string;
  readonly earliestSuspensionDate: string | null;
  /** Never permission for an external entitlement or financial mutation. */
  readonly executionAuthorized: false;
}
export function assessVendeDelinquency(input:{
  readonly dueDate:string;
  readonly asOfDate:string;
  readonly contractState:RecordedContractState;
  readonly paymentState:VerifiedPaymentState;
  readonly calendar:FmApprovedBusinessCalendar|null;
}):GovernedLifecycleAssessment {
  dateValue(input.asOfDate);
  const base={policyVersion:VENDE_COMMERCIAL_POLICY_V1.version,
    dueDate:input.dueDate,executionAuthorized:false as const};
  if(input.paymentState!=="unpaid_verified_by_authorized_gateway")
    return {...base,decision:"blocked",reason:input.paymentState==="unverified"
      ?"payment_not_authoritatively_reconciled":"invoice_already_settled",
      earliestSuspensionDate:null};
  if(input.contractState!=="active" && input.contractState!=="past_due")
    return {...base,decision:"blocked",reason:"contract_state_not_suspensible",
      earliestSuspensionDate:null};
  let schedule:DelinquencySchedule;
  try {schedule=scheduleVendeDelinquency(input.dueDate,input.calendar);}
  catch {
    return {...base,decision:"blocked",reason:"verified_business_calendar_required",
      earliestSuspensionDate:null};
  }
  const ready=dateValue(input.asOfDate)>=dateValue(schedule.earliestSuspensionDate);
  return {...base,decision:ready?"candidate_for_governed_suspension":"not_due",
    reason:ready?"grace_period_completed":"grace_period_not_completed",
    earliestSuspensionDate:schedule.earliestSuspensionDate};
}
