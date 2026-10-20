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
  readonly authoritativeDomain: "commercial";
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
    source.secretRef === profile.secretRef;
}
/** Sanitized, read-only metadata for the authenticated C08 API. */
export function publicAdapterCatalog() {
  return SAAS_ADAPTER_PROFILES.map(profile => ({
    productSlug: profile.productSlug,
    sourceType: profile.sourceType,
    mappingVersion: profile.mappingVersion,
    syncMode: profile.syncMode,
    authoritativeDomain: profile.authoritativeDomain,
    integrationState: "adapter_implemented_not_connected" as const,
  }));
}
