import type { ProductDefinition } from "@/domain/products/contracts";
import type { SourceDefinition } from "@/domain/integration/contracts";
import {
  SAAS_ADAPTER_PROFILES, profileForProductSlug, sourceMatchesAdapter,
  type SaasAdapterProfile,
} from "@/application/integration/saas-adapter-profiles";

/**
 * Local admission preflight only: never performs network requests, resolves
 * secrets, authorizes billing actions or certifies authenticated SaaS E2E.
 */
export type SaasAdapterPreflightStatus =
  | "adapter_missing"
  | "source_missing"
  | "binding_mismatch"
  | "local_contract_ready";

export interface SaasAdapterPreflightRow {
  readonly productId: string;
  readonly productSlug: string;
  readonly sourceId: string | null;
  readonly status: SaasAdapterPreflightStatus;
  readonly authenticatedSaasE2eCertified: false;
}

export interface SaasAdapterPreflight {
  readonly contractVersion: "fmcc.c08.adapter-preflight.v1";
  readonly authority: "fmcc_local_product_source_adapter_registry";
  readonly rows: readonly SaasAdapterPreflightRow[];
  readonly verifiedExternalConnections: null;
}

/**
 * Reuse the exact Source Registry identity and adapter profile currently
 * installed in this build. Cross-tenant records are never surfaced.
 * Accepts injected profiles exclusively for isolated contract tests.
 */
export function buildSaasAdapterPreflight(
  tenantId: string,
  products: readonly ProductDefinition[],
  sources: readonly SourceDefinition[],
  profiles: readonly SaasAdapterProfile[] = SAAS_ADAPTER_PROFILES,
): SaasAdapterPreflight {
  if (!tenantId.trim()) throw new Error("integration.c08_tenant_missing");
  if (products.length > 256 || sources.length > 256) {
    throw new Error("integration.c08_snapshot_capacity_unverified");
  }
  const scopedSources = sources.filter(source => source.tenantId === tenantId);
  const rows = products
    .filter(product => product.tenantId === tenantId && product.status === "active")
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap<SaasAdapterPreflightRow>(product => {
      const profile = profileForProductSlug(product.slug, profiles);
      const matches = scopedSources.filter(source => source.productId === product.id)
        .sort((a, b) => a.id.localeCompare(b.id));
      if (!profile) return [{
        productId: product.id, productSlug: product.slug, sourceId: null,
        status: "adapter_missing", authenticatedSaasE2eCertified: false,
      }];
      if (!matches.length) return [{
        productId: product.id, productSlug: product.slug, sourceId: null,
        status: "source_missing", authenticatedSaasE2eCertified: false,
      }];
      return matches.map(source => ({
        productId: product.id, productSlug: product.slug, sourceId: source.id,
        status: sourceMatchesAdapter(source, profile)
          ? "local_contract_ready" as const : "binding_mismatch" as const,
        authenticatedSaasE2eCertified: false as const,
      }));
    });
  return {
    contractVersion: "fmcc.c08.adapter-preflight.v1",
    authority: "fmcc_local_product_source_adapter_registry",
    rows,
    verifiedExternalConnections: null,
  };
}
