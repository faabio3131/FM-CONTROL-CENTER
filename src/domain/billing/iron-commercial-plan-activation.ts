import type { IronVersionedPlanMapping } from "@/domain/billing/iron-versioned-plan-mapping";
/** Structural contract of the IRON-owned PUBLISHED plan projection. */
type PublishedIronPlanIdentity = {
  readonly planCode: string;
  readonly displayName: string;
  readonly version: number;
  readonly publishedAt: string;
};

/**
 * Command-owned offer publication, not IRON entitlement publication.
 * The canonical IRON plan must already be PUBLISHED and its immutable
 * version mapping must exist before the FM price can become selectable.
 */
export interface IronCommercialPlanActivationInput {
  readonly commercialPlanCode: string;
  readonly expectedAmountMinor: number;
  readonly expectedIronPlanCode: string;
  readonly expectedIronPlanVersion: number;
  readonly expectedMappingRevision: number;
}

export class IronCommercialPlanActivationError extends Error {
  constructor(code: string) { super(code); }
}

const FM_PLAN_CODE = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const IRON_PLAN_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;

export function parseIronPlanActivationInput(value: unknown): IronCommercialPlanActivationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IronCommercialPlanActivationError("billing.iron_activation_input_invalid");
  }
  const row = value as Record<string, unknown>;
  if (typeof row.commercialPlanCode !== "string" ||
      !FM_PLAN_CODE.test(row.commercialPlanCode) ||
      typeof row.expectedIronPlanCode !== "string" ||
      !IRON_PLAN_CODE.test(row.expectedIronPlanCode) ||
      !Number.isSafeInteger(row.expectedAmountMinor) ||
      (row.expectedAmountMinor as number) <= 0 ||
      !Number.isSafeInteger(row.expectedIronPlanVersion) ||
      (row.expectedIronPlanVersion as number) < 1 ||
      !Number.isSafeInteger(row.expectedMappingRevision) ||
      (row.expectedMappingRevision as number) < 1) {
    throw new IronCommercialPlanActivationError("billing.iron_activation_input_invalid");
  }
  return {
    commercialPlanCode: row.commercialPlanCode,
    expectedAmountMinor: row.expectedAmountMinor as number,
    expectedIronPlanCode: row.expectedIronPlanCode,
    expectedIronPlanVersion: row.expectedIronPlanVersion as number,
    expectedMappingRevision: row.expectedMappingRevision as number,
  };
}

export function assertIronCommercialPlanActivation(
  input: IronCommercialPlanActivationInput,
  plan: { planCode: string; amountMinor: number; currency: string; status: string },
  mapping: IronVersionedPlanMapping,
  published: PublishedIronPlanIdentity,
): void {
  // Every assertion is repeated inside the transaction after taking the
  // same advisory lock used by invoice preparation and mapping registration.
  if (plan.planCode !== input.commercialPlanCode ||
      plan.currency !== "BRL" || !Number.isSafeInteger(plan.amountMinor) ||
      plan.amountMinor !== input.expectedAmountMinor) {
    throw new IronCommercialPlanActivationError("billing.iron_activation_price_changed");
  }
  if (plan.status !== "inactive" && plan.status !== "active") {
    throw new IronCommercialPlanActivationError("billing.iron_activation_plan_state_invalid");
  }
  if (mapping.commercialPlanCode !== input.commercialPlanCode ||
      mapping.ironPlanCode !== input.expectedIronPlanCode ||
      mapping.ironPlanVersion !== input.expectedIronPlanVersion ||
      mapping.revision !== input.expectedMappingRevision) {
    throw new IronCommercialPlanActivationError("billing.iron_activation_mapping_changed");
  }
  if (published.planCode !== mapping.ironPlanCode ||
      published.version !== mapping.ironPlanVersion ||
      !published.displayName.trim() ||
      !Number.isFinite(Date.parse(published.publishedAt))) {
    throw new IronCommercialPlanActivationError("billing.iron_activation_published_version_unverified");
  }
}
