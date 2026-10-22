/** VendeAtendeIA: 100% das funcionalidades em todos os planos.
 * Only measurable consumption and FM-owned commercial price may vary.
 */
export type PlanResource =
  | "ai.requests" | "ai.total_tokens" | "ai.input_tokens"
  | "ai.output_tokens" | "ai.cached_tokens" | "ai.cost_usd_microunits"
  | "audio.seconds" | "whatsapp.messages" | "automation.executions"
  | "storage.bytes" | "crm.leads" | "users.seats" | "units.active";

export type PlanAllowance = Readonly<{
  resource: PlanResource;
  scope: "tenant" | "unit";
  limitUnits: number;
  windowSeconds: number;
}>;

export type ConsumptionPlanDraft = Readonly<{
  planCode: string;
  label: string;
  billingInterval: "monthly" | "yearly";
  amountMinor: number;
  allowances: readonly PlanAllowance[];
}>;

export class ConsumptionPlanInvalid extends Error {
  constructor(public readonly reason: string) {
    super(`plans.${reason}`);
  }
}

// These five consumption metrics are signed by Assistant and enforced by
// the Core's transacted PlanQuotaPolicy. A published FM plan cannot declare
// values that the Core would reject after successful commercial delivery.
const CORE_METRICS: ReadonlySet<string> = new Set([
  "ai.requests", "ai.total_tokens", "ai.input_tokens",
  "ai.output_tokens", "ai.cached_tokens",
]);
const CORE_MAX_LIMIT_UNITS = 2_000_000_000;
const CORE_MAX_WINDOW_SECONDS = 31_536_000;

const METRICS: ReadonlySet<string> = new Set([
  "ai.requests", "ai.total_tokens", "ai.input_tokens",
  "ai.output_tokens", "ai.cached_tokens", "ai.cost_usd_microunits",
  "audio.seconds", "whatsapp.messages", "automation.executions",
  "storage.bytes", "crm.leads", "users.seats", "units.active",
]);

export function parseConsumptionPlanDraft(value: unknown): ConsumptionPlanDraft {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ConsumptionPlanInvalid("payload_invalid");
  const record = value as Record<string, unknown>;
  // Reject feature flags, BYOK secrets, arbitrary capability lists and
  // other unknown fields instead of silently admitting tier feature gating.
  const expected = new Set(["planCode", "label", "billingInterval", "amountMinor", "allowances"]);
  if (Object.keys(record).some((key) => !expected.has(key)))
    throw new ConsumptionPlanInvalid("feature_gating_forbidden");
  if (typeof record.planCode !== "string" ||
      !/^[A-Z][A-Z0-9._-]{1,63}$/.test(record.planCode))
    throw new ConsumptionPlanInvalid("plan_code_invalid");
  if (typeof record.label !== "string" || record.label.trim().length < 2 ||
      record.label.trim().length > 120)
    throw new ConsumptionPlanInvalid("label_invalid");
  if (record.billingInterval !== "monthly" && record.billingInterval !== "yearly")
    throw new ConsumptionPlanInvalid("interval_invalid");
  if (typeof record.amountMinor !== "number" ||
      !Number.isSafeInteger(record.amountMinor) || record.amountMinor <= 0)
    throw new ConsumptionPlanInvalid("price_invalid");
  if (!Array.isArray(record.allowances) ||
      record.allowances.length === 0 || record.allowances.length > 32)
    throw new ConsumptionPlanInvalid("allowances_invalid");
  const seen = new Set<string>();
  const allowances: PlanAllowance[] = record.allowances.map((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new ConsumptionPlanInvalid("allowance_invalid");
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some((key) =>
      !["resource", "scope", "limitUnits", "windowSeconds"].includes(key)))
      throw new ConsumptionPlanInvalid("feature_gating_forbidden");
    if (typeof item.resource !== "string" || !METRICS.has(item.resource))
      throw new ConsumptionPlanInvalid("metric_invalid");
    if (item.scope !== "tenant" && item.scope !== "unit")
      throw new ConsumptionPlanInvalid("scope_invalid");
    if (typeof item.limitUnits !== "number" || !Number.isSafeInteger(item.limitUnits) ||
        item.limitUnits <= 0 || item.limitUnits > 9_000_000_000_000_000)
      throw new ConsumptionPlanInvalid("limit_invalid");
    if (typeof item.windowSeconds !== "number" || !Number.isSafeInteger(item.windowSeconds) ||
        item.windowSeconds < 60 || item.windowSeconds > 366 * 86400)
      throw new ConsumptionPlanInvalid("window_invalid");
    // Fail before publication or billing. Assistant/Core signed plan grants
    // have narrower numeric bounds than unrelated commercial allowances.
    if (CORE_METRICS.has(item.resource)) {
      if (item.limitUnits > CORE_MAX_LIMIT_UNITS)
        throw new ConsumptionPlanInvalid("core_quota_limit_invalid");
      if (item.windowSeconds > CORE_MAX_WINDOW_SECONDS)
        throw new ConsumptionPlanInvalid("core_quota_window_invalid");
    }
    const key = item.resource; // one quota scope per resource in Assistant license v1
    if (seen.has(key)) throw new ConsumptionPlanInvalid("duplicate_allowance");
    seen.add(key);
    return {
      resource: item.resource as PlanResource,
      scope: item.scope,
      limitUnits: item.limitUnits,
      windowSeconds: item.windowSeconds,
    };
  });
  // Denying missing AI request + token quota prevents unlimited access
  // through a legitimate but incomplete plan configuration.
  if (!allowances.some(x => x.resource === "ai.requests") ||
      !allowances.some(x => x.resource === "ai.total_tokens"))
    throw new ConsumptionPlanInvalid("ai_limits_required");
  return Object.freeze({
    planCode: record.planCode,
    label: record.label.trim(),
    billingInterval: record.billingInterval,
    amountMinor: record.amountMinor,
    allowances: Object.freeze(allowances),
  });
}

/** Cross-product isolation: VendeAtendeIA plan authority must never
 * accidentally import quotas belonging to Kordena or another FM SaaS.
 */
export function isVendeAtendeProductSlug(value: string): boolean {
  return value === "vendeatendeia" || value === "atendevendeia";
}
