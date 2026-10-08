/**
 * Billing Central domain foundation. No gateway, storage or production authority is enabled here.
 * The Command owns the commercial state; product SaaS applications only consume it.
 */
export const LICENSE_STATES = ["pending", "active", "past_due", "suspended", "canceled", "refunded", "expired"] as const;
export type LicenseState = (typeof LICENSE_STATES)[number];

export type CommercialLicense = Readonly<{
  customerId: string;
  subscriptionId: string;
  licenseId: string;
  productCode: string;
  planCode: string;
  version: number;
  state: LicenseState;
  validFrom: string;
  validUntil: string;
  graceEndsAt: string | null;
}>;

export type LicenseUpdate = Readonly<{
  eventId: string;
  occurredAt: string;
  license: CommercialLicense;
}>;

export type ApplicationResult =
  | Readonly<{ outcome: "applied"; license: CommercialLicense }>
  | Readonly<{ outcome: "duplicate" | "stale"; license: CommercialLicense }>
  | Readonly<{ outcome: "rejected"; reason: string }>;

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCommandId(id: string): boolean {
  return UUID_V7.test(id);
}

export function validateLicense(input: CommercialLicense): string | null {
  if (![input.customerId, input.subscriptionId, input.licenseId].every(isCommandId)) return "invalid_command_id";
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(input.productCode)) return "invalid_product_code";
  if (!input.planCode.trim()) return "missing_plan";
  if (!Number.isSafeInteger(input.version) || input.version < 1) return "invalid_version";
  if (!LICENSE_STATES.includes(input.state)) return "invalid_state";
  const from = Date.parse(input.validFrom), until = Date.parse(input.validUntil);
  if (!Number.isFinite(from) || !Number.isFinite(until) || from >= until) return "invalid_validity";
  if (input.graceEndsAt !== null) {
    const grace = Date.parse(input.graceEndsAt);
    if (!Number.isFinite(grace) || grace < until || input.state !== "past_due") return "invalid_grace";
  }
  return null;
}

export function applyLicenseUpdate(
  current: CommercialLicense | null,
  update: LicenseUpdate,
  processedEventIds: ReadonlySet<string>,
): ApplicationResult {
  if (!update.eventId.trim() || !Number.isFinite(Date.parse(update.occurredAt))) {
    return { outcome: "rejected", reason: "invalid_event" };
  }
  const reason = validateLicense(update.license);
  if (reason) return { outcome: "rejected", reason };
  if (processedEventIds.has(update.eventId)) {
    if (!current) return { outcome: "rejected", reason: "missing_current_license" };
    return { outcome: "duplicate", license: current };
  }
  if (current) {
    if (current.licenseId !== update.license.licenseId ||
        current.customerId !== update.license.customerId ||
        current.subscriptionId !== update.license.subscriptionId ||
        current.productCode !== update.license.productCode) {
      return { outcome: "rejected", reason: "license_identity_mismatch" };
    }
    if (update.license.version <= current.version) return { outcome: "stale", license: current };
  }
  return { outcome: "applied", license: update.license };
}

export function mayServeDuringOutage(args: {
  license: CommercialLicense;
  now: string;
  lastValidatedAt: string;
  contingencyStartedAt: string | null;
  contingencyUntil: string | null;
}): boolean {
  const { license } = args;
  if (["pending", "suspended", "canceled", "refunded", "expired"].includes(license.state)) return false;
  const now = Date.parse(args.now);
  const lastValidated = Date.parse(args.lastValidatedAt);
  if (!Number.isFinite(now) || !Number.isFinite(lastValidated) || lastValidated > now) return false;
  const normalEnd = Date.parse(license.state === "past_due" && license.graceEndsAt ? license.graceEndsAt : license.validUntil);
  if (now <= normalEnd) return true;
  if (!args.contingencyStartedAt || !args.contingencyUntil) return false;
  const start = Date.parse(args.contingencyStartedAt);
  const end = Date.parse(args.contingencyUntil);
  return Number.isFinite(start) && Number.isFinite(end) &&
    start >= normalEnd && end > start && end - start <= 72 * 60 * 60 * 1000 && now <= end;
}
