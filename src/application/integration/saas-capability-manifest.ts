import type { Connector } from "@/domain/integration/contracts";
import type { SaasAdapterProfile } from "@/application/integration/saas-adapter-profiles";

/** Candidate inspection format, NOT an authorization or remote handshake. */
export const SAAS_CAPABILITY_MANIFEST_VERSION = "fmcc.saas-capabilities.v1" as const;
const MAX_VALIDITY_MS = 10 * 60 * 1000;
const ALLOWED_KEYS = new Set([
  "schema_version", "product_slug", "source_type",
  "mapping_version", "valid_from", "valid_until", "capabilities",
]);

export interface SaasCapabilityManifest {
  readonly schema_version: typeof SAAS_CAPABILITY_MANIFEST_VERSION;
  readonly product_slug: string;
  readonly source_type: string;
  readonly mapping_version: string;
  readonly valid_from: string;
  readonly valid_until: string;
  readonly capabilities: readonly string[];
}

export class SaasCapabilityManifestRejected extends Error {
  constructor(code: string) {
    super(code);
    this.name = "SaasCapabilityManifestRejected";
  }
}
function reject(code: string): never {
  throw new SaasCapabilityManifestRejected(code);
}

/**
 * Parse an untrusted candidate capability declaration against a specific
 * locally installed connector. This NEVER grants permissions. The future
 * caller must separately authenticate transport, tenant and service identity.
 */
export function inspectSaasCapabilityManifest(
  raw: unknown,
  profile: SaasAdapterProfile,
  connector: Connector,
  now: Date = new Date(),
): SaasCapabilityManifest {
  if (!Number.isFinite(now.getTime())) reject("integration.manifest_clock_invalid");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    reject("integration.manifest_structure_invalid");
  }
  const obj = raw as Record<string, unknown>;
  if (Object.keys(obj).some(key => !ALLOWED_KEYS.has(key))) {
    reject("integration.manifest_unexpected_field");
  }
  if (obj.schema_version !== SAAS_CAPABILITY_MANIFEST_VERSION) {
    reject("integration.manifest_version_unsupported");
  }
  if (obj.product_slug !== profile.productSlug ||
      obj.source_type !== profile.sourceType ||
      obj.mapping_version !== profile.mappingVersion ||
      connector.sourceType !== profile.sourceType) {
    reject("integration.manifest_identity_mismatch");
  }
  if (typeof obj.valid_from !== "string" || typeof obj.valid_until !== "string") {
    reject("integration.manifest_validity_invalid");
  }
  const from = Date.parse(obj.valid_from);
  const until = Date.parse(obj.valid_until);
  if (!Number.isFinite(from) || !Number.isFinite(until) ||
      from > now.getTime() + 30_000 || until <= now.getTime() ||
      from >= until || until - from > MAX_VALIDITY_MS) {
    reject("integration.manifest_validity_invalid");
  }
  if (!Array.isArray(obj.capabilities) ||
      obj.capabilities.length < 2 || obj.capabilities.length > 32) {
    reject("integration.manifest_capabilities_invalid");
  }
  const capabilities = obj.capabilities as unknown[];
  if (!capabilities.every(value =>
    typeof value === "string" && /^[a-z][a-z0-9.-]{2,63}$/.test(value))) {
    reject("integration.manifest_capabilities_invalid");
  }
  const declared = capabilities as string[];
  if (new Set(declared).size !== declared.length ||
      !declared.includes("commercial.snapshot") ||
      !declared.includes("commercial.facts") ||
      declared.some(value => !connector.capabilities.includes(value))) {
    reject("integration.manifest_capabilities_mismatch");
  }
  return {
    schema_version: SAAS_CAPABILITY_MANIFEST_VERSION,
    product_slug: profile.productSlug,
    source_type: profile.sourceType,
    mapping_version: profile.mappingVersion,
    valid_from: obj.valid_from as string,
    valid_until: obj.valid_until as string,
    capabilities: Object.freeze([...declared]),
  };
}
