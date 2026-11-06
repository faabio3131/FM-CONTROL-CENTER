/**
 * Contract shared by FM Command SaaS onboarding adapters.
 * A future SaaS implements the read-only endpoint and gets C08 integration
 * without a product-specific connector, migrations or billing authority.
 */
export const UNIVERSAL_SAAS_SOURCE_TYPE = "fmcc-saas-usage-v1" as const;
export const UNIVERSAL_SAAS_SCHEMA_VERSION = "fmcc.saas.usage/v1" as const;
export const UNIVERSAL_SAAS_USAGE_PATH = "/v1/fmcc/saas/usage" as const;

/** Avoid punctuation in environment variable keys, path traversal and collisions. */
export function isValidSaasSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 128;
}

export function saasEnvKey(productSlug: string): string {
  if (!isValidSaasSlug(productSlug)) throw new Error("integration.universal_slug_invalid");
  return productSlug.toUpperCase().replaceAll("-", "_");
}

export function universalSaasSecretRef(productSlug: string): string {
  return `env:FMCC_SAAS_${saasEnvKey(productSlug)}_CONTROL_TOKEN`;
}

export function universalSaasOriginEnvKey(productSlug: string): string {
  return `FMCC_SAAS_${saasEnvKey(productSlug)}_ALLOWED_ORIGINS`;
}

export function universalSaasTenantEnvKey(productSlug: string): string {
  return `FMCC_SAAS_${saasEnvKey(productSlug)}_COMMAND_TENANT_ID`;
}

export type UniversalUsageUnit = "count" | "tokens";
export type UniversalLimitStatus = "bounded" | "unlimited" | "unknown";

export interface UniversalUsageMetric {
  readonly metricId: string;
  readonly unit: UniversalUsageUnit;
  readonly quantity: number;
  readonly limitStatus: UniversalLimitStatus;
  readonly limit: number | null;
}
export interface UniversalUsageSnapshot {
  readonly externalTenantRef: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly metrics: readonly UniversalUsageMetric[];
}

/** No payment, MRR, price or subscription authority in this usage-only v1. */
export interface UniversalUsageEnvelope {
  readonly schemaVersion: typeof UNIVERSAL_SAAS_SCHEMA_VERSION;
  readonly productSlug: string;
  readonly productId: string;
  readonly commandTenantId: string;
  readonly correlationId: string;
  readonly authority: "saas-runtime";
  readonly observedAt: string;
  readonly snapshots: readonly UniversalUsageSnapshot[];
}
