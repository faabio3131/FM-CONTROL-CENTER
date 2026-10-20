import type { SourceDefinition, SyncOperationalState } from "@/domain/integration/contracts";
import type { ProductDefinition } from "@/domain/products/contracts";

/**
 * C08 is a read-only evidence matrix; neither source.status="healthy" nor a
 * locally completed pull proves an end-to-end authenticated SaaS integration.
 */
export type C08EvidenceState =
  | "not_configured"
  | "unverified"
  | "persisted_unavailable"
  | "sync_running"
  | "sync_failed"
  | "freshness_undefined"
  | "sync_stale"
  | "sync_recent";

export interface C08IntegrationEvidence {
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly sourceId: string | null;
  readonly sourceType: string | null;
  readonly mappingVersion: string | null;
  readonly sourceStatus: SourceDefinition["status"] | null;
  readonly lastAttemptStatus: SyncOperationalState["lastAttemptStatus"] | null;
  readonly lastSuccessfulAt: string | null;
  readonly state: C08EvidenceState;
  readonly authenticatedSaasE2eCertified: false;
  readonly externallyHomologated: false;
}
export interface C08ReadinessMatrix {
  readonly contractVersion: "fmcc.c08.integration-readiness.v1";
  readonly authority: "fmcc_source_registry_and_local_sync_history";
  readonly asOf: string;
  readonly tenantId: string;
  readonly rows: readonly C08IntegrationEvidence[];
  readonly unboundSourceCount: number;
  readonly certifiedIntegrations: null;
}

function dateOrNull(value?: Date): Date | null {
  return value && Number.isFinite(value.getTime()) ? value : null;
}

function classify(source: SourceDefinition, operational: SyncOperationalState | undefined, now: Date): C08EvidenceState {
  const latest = dateOrNull(operational?.lastAttemptAt);
  const success = dateOrNull(operational?.lastSuccessfulAt);
  // A failed or running attempt *after* success must not be hidden by old data.
  const newerAttempt = latest && (!success || latest.getTime() >= success.getTime());
  if (newerAttempt && operational?.lastAttemptStatus === "failed") return "sync_failed";
  if (newerAttempt && operational?.lastAttemptStatus === "running") return "sync_running";
  if (source.status === "unavailable") return "persisted_unavailable";
  if (!success || success.getTime() > now.getTime()) return "unverified";
  const age = now.getTime() - success.getTime();
  if (typeof source.freshnessSeconds !== "number" ||
      !Number.isFinite(source.freshnessSeconds) ||
      source.freshnessSeconds < 1) return "freshness_undefined";
  return age <= source.freshnessSeconds * 1000 ? "sync_recent" : "sync_stale";
}

/**
 * The caller must already obtain products and sources through tenant-scoped
 * repositories with RBAC. Defensive binding checks prevent accidental mixing
 * of a foreign source or a source pointed at another product.
 */
export function buildC08IntegrationReadiness(
  tenantId: string,
  products: readonly ProductDefinition[],
  sources: readonly SourceDefinition[],
  operationalStates: ReadonlyMap<string, SyncOperationalState>,
  now = new Date(),
): C08ReadinessMatrix {
  if (!tenantId.trim() || !Number.isFinite(now.getTime())) {
    throw new Error("integration.c08_scope_or_time_invalid");
  }
  const active = products
    .filter(p => p.tenantId === tenantId && p.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const knownProductIds = new Set(active.map(p => p.id));
  const scoped = sources.filter(s => s.tenantId === tenantId);
  const rows = active.flatMap(product => {
    const matches = scoped
      .filter(s => s.productId === product.id)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id));
    if (matches.length === 0) return [{
      productId: product.id, productName: product.name, productSlug: product.slug,
      sourceId: null, sourceType: null, mappingVersion: null,
      sourceStatus: null, lastAttemptStatus: null, lastSuccessfulAt: null,
      state: "not_configured" as const,
      authenticatedSaasE2eCertified: false as const,
      externallyHomologated: false as const,
    }];
    return matches.map(source => {
      const operational = operationalStates.get(source.id);
      const success = dateOrNull(operational?.lastSuccessfulAt);
      return {
        productId: product.id, productName: product.name, productSlug: product.slug,
        sourceId: source.id, sourceType: source.sourceType,
        mappingVersion: source.mappingVersion,
        sourceStatus: source.status,
        lastAttemptStatus: operational?.lastAttemptStatus ?? null,
        lastSuccessfulAt: success?.toISOString() ?? null,
        state: classify(source, operational, now),
        authenticatedSaasE2eCertified: false as const,
        externallyHomologated: false as const,
      };
    });
  });
  return {
    contractVersion: "fmcc.c08.integration-readiness.v1",
    authority: "fmcc_source_registry_and_local_sync_history",
    asOf: now.toISOString(),
    tenantId,
    rows,
    unboundSourceCount: scoped.filter(source =>
      !source.productId || !knownProductIds.has(source.productId)).length,
    certifiedIntegrations: null,
  };
}
