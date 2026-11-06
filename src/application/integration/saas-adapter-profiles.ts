import {
  UNIVERSAL_SAAS_SOURCE_TYPE, isValidSaasSlug, universalSaasSecretRef,
} from "@/domain/integration/universal-saas-contract";
import { NFCORE_COGNITIVE_SECRET_REF, NFCORE_COGNITIVE_SOURCE_TYPE } from "@/infrastructure/integration/nfcore-cognitive-connector";
import type { ConnectorSyncMode, SourceDefinition } from "@/domain/integration/contracts";
import { KORDENA_COMMERCIAL_SECRET_REF, KORDENA_COMMERCIAL_SOURCE_TYPE } from "@/infrastructure/integration/kordena-commercial-connector";
import { IRON_COMMERCIAL_SECRET_REF, IRON_COMMERCIAL_SOURCE_TYPE } from "@/infrastructure/integration/iron-commercial-connector";

/**
 * Adapters actually implemented in this FMCC build, not evidence of live
 * connectivity or approval. Every new profile must have a real runtime adapter.
 */
export interface SaasAdapterProfile {
  readonly productSlug: string;
  readonly title: string;
  readonly name: string;
  readonly sourceType: string;
  readonly mappingVersion: string;
  readonly authoritativeDomain: "commercial" | "cognitive" | "operational";
  readonly syncMode: ConnectorSyncMode;
  readonly secretRef: string; // reference only, never credential material
  readonly urlLabel: string;
  readonly placeholder: string;
}
export const SAAS_ADAPTER_PROFILES: readonly SaasAdapterProfile[] = Object.freeze([
  Object.freeze({
    productSlug: "kordena",
    title: "Conectar Kordena",
    name: "Kordena Commercial",
    sourceType: KORDENA_COMMERCIAL_SOURCE_TYPE,
    mappingVersion: KORDENA_COMMERCIAL_SOURCE_TYPE,
    authoritativeDomain: "commercial",
    syncMode: "pull",
    secretRef: KORDENA_COMMERCIAL_SECRET_REF,
    urlLabel: "URL HTTPS do Kordena",
    placeholder: "https://seu-kordena.exemplo.com",
  }),
  Object.freeze({
    productSlug: "nfcore",
    title: "Conectar NFCore",
    name: "NFCore Cognitive Operational Telemetry",
    sourceType: NFCORE_COGNITIVE_SOURCE_TYPE,
    mappingVersion: NFCORE_COGNITIVE_SOURCE_TYPE,
    authoritativeDomain: "cognitive",
    syncMode: "pull",
    secretRef: NFCORE_COGNITIVE_SECRET_REF,
    urlLabel: "URL HTTPS do NFCore",
    placeholder: "https://api.nfcore.com.br",
  }),
  Object.freeze({
    productSlug: "iron",
    title: "Conectar IRON FIT CORE",
    name: "IRON FIT CORE Commercial",
    sourceType: IRON_COMMERCIAL_SOURCE_TYPE,
    mappingVersion: IRON_COMMERCIAL_SOURCE_TYPE,
    authoritativeDomain: "commercial",
    syncMode: "pull",
    secretRef: IRON_COMMERCIAL_SECRET_REF,
    urlLabel: "URL HTTPS do backend IRON",
    placeholder: "https://seu-iron.exemplo.com",
  }),
]);
/**
 * Universal consumption reader for ANY FM SaaS implementing usage/v1.
 * Existing bespoke adapters remain authoritative for commercial/billing data.
 * Each SaaS needs its OWN env key and registered product; profile does not
 * grant credentials, perform handshakes or certify integration.
 */
export function universalSaasProfileForProduct(slug: string): SaasAdapterProfile | null {
  if (!isValidSaasSlug(slug)) return null;
  return Object.freeze({
    productSlug: slug,
    title: `Conectar consumo SaaS · ${slug}`,
    name: `SaaS Usage v1 · ${slug}`,
    sourceType: UNIVERSAL_SAAS_SOURCE_TYPE,
    mappingVersion: UNIVERSAL_SAAS_SOURCE_TYPE,
    authoritativeDomain: "operational" as const,
    syncMode: "pull" as const,
    secretRef: universalSaasSecretRef(slug),
    urlLabel: `Origem HTTPS de ${slug}`,
    placeholder: "https://api.seu-saas.com.br",
  });
}

export function availableSaasProfiles(
  products: readonly { readonly slug: string; readonly status?: string }[],
): readonly SaasAdapterProfile[] {
  const unique = new Set<string>();
  const universal = products.filter(p => p.status === undefined || p.status === "active")
    .map(p => p.slug)
    .filter(slug => {
      if (unique.has(slug)) return false;
      unique.add(slug);
      return true;
    })
    .map(universalSaasProfileForProduct).filter((p): p is SaasAdapterProfile => p !== null);
  return [...SAAS_ADAPTER_PROFILES, ...universal];
}

export function profileForSourceType(
  sourceType: string, profiles: readonly SaasAdapterProfile[] = SAAS_ADAPTER_PROFILES,
): SaasAdapterProfile | undefined {
  return profiles.find(profile => profile.sourceType === sourceType);
}
export function profileForProductSlug(
  slug: string, profiles: readonly SaasAdapterProfile[] = SAAS_ADAPTER_PROFILES,
): SaasAdapterProfile | undefined {
  return profiles.find(profile => profile.productSlug === slug);
}
export function sourceMatchesAdapter(
  source: SourceDefinition, profile: SaasAdapterProfile,
): boolean {
  return source.sourceType === profile.sourceType &&
    source.mappingVersion === profile.mappingVersion &&
    source.authoritativeDomain === profile.authoritativeDomain &&
    source.syncMode === profile.syncMode &&
    source.secretRef === profile.secretRef &&
    (profile.sourceType !== UNIVERSAL_SAAS_SOURCE_TYPE ||
      source.config.productSlug === profile.productSlug);
}
/** Sanitized, read-only metadata for the authenticated C08 API. */
export function publicAdapterCatalog(profiles: readonly SaasAdapterProfile[] = SAAS_ADAPTER_PROFILES) {
  return profiles.map(profile => ({
    productSlug: profile.productSlug,
    sourceType: profile.sourceType,
    mappingVersion: profile.mappingVersion,
    syncMode: profile.syncMode,
    authoritativeDomain: profile.authoritativeDomain,
    integrationState: "adapter_implemented_not_connected" as const,
  }));
}
