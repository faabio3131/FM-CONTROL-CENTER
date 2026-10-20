import type { SourceDefinition, SyncOperationalReader, SyncOperationalState } from "@/domain/integration/contracts";
import type { ProductDefinition } from "@/domain/products/contracts";

/**
 * C08 is only a local operational observation. Bounded queries prevent an
 * operator page or Core read from exhausting the PostgreSQL connection pool.
 * The caller owns authentication and must pass the session-authorized tenant.
 */
const MAX_SNAPSHOT_ITEMS = 256;
const MAX_CONCURRENT_STATES = 8;

export function assertC08SnapshotCapacity(
  products: readonly ProductDefinition[],
  sources: readonly SourceDefinition[],
): void {
  // Never truncate: missing bindings cannot be interpreted as unconfigured.
  if (products.length > MAX_SNAPSHOT_ITEMS || sources.length > MAX_SNAPSHOT_ITEMS) {
    throw new Error("integration.c08_snapshot_capacity_unverified");
  }
}

export async function readC08OperationalStates(
  tenantId: string,
  sources: readonly SourceDefinition[],
  sync: SyncOperationalReader,
): Promise<ReadonlyMap<string, SyncOperationalState>> {
  if (!tenantId.trim()) throw new Error("integration.c08_tenant_missing");
  if (sources.length > MAX_SNAPSHOT_ITEMS) {
    throw new Error("integration.c08_snapshot_capacity_unverified");
  }
  const scoped = sources.filter(source => source.tenantId === tenantId);
  const seen = new Set<string>();
  for (const source of scoped) {
    if (!source.id.trim() || seen.has(source.id)) {
      throw new Error("integration.c08_source_identity_ambiguous");
    }
    seen.add(source.id);
  }

  const states = new Map<string, SyncOperationalState>();
  // A rejected read rejects the entire snapshot; never return partial truth.
  for (let index = 0; index < scoped.length; index += MAX_CONCURRENT_STATES) {
    const batch = scoped.slice(index, index + MAX_CONCURRENT_STATES);
    const results = await Promise.all(batch.map(async source => [
      source.id,
      await sync.operationalState(tenantId, source.id),
    ] as const));
    for (const [sourceId, state] of results) states.set(sourceId, state);
  }
  return states;
}
