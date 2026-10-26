import type { SourceDefinition } from "@/domain/integration/contracts";

/**
 * Temporary, explicit runtime routing for a canonical FM-owned S2S source.
 * Does not mutate source definitions, tenants, secrets, or the database.
 * Opt-in by environment only; an invalid override always fails closed.
 */
export function commercialOriginOverride(
  source: SourceDefinition,
  settings: {
    enabled: boolean;
    controlTenantId: string | undefined;
    sourceType: string;
    secretRef: string;
    configuredBaseUrl: string | undefined;
    allowedOrigins: readonly string[];
  },
): string | null {
  if (!settings.enabled) return null;

  if (
    !settings.controlTenantId ||
    source.tenantId !== settings.controlTenantId ||
    !source.productId ||
    source.sourceType !== settings.sourceType ||
    source.secretRef !== settings.secretRef ||
    source.authoritativeDomain !== "commercial"
  ) {
    throw new Error("integration.commercial_origin_override_scope_denied");
  }

  const raw = settings.configuredBaseUrl?.trim();
  if (!raw) throw new Error("integration.commercial_origin_override_url_missing");

  let destination: URL;
  try {
    destination = new URL(raw);
  } catch {
    throw new Error("integration.commercial_origin_override_url_invalid");
  }
  if (
    destination.protocol !== "https:" ||
    destination.username ||
    destination.password ||
    destination.pathname !== "/" ||
    destination.search ||
    destination.hash ||
    destination.port
  ) {
    throw new Error("integration.commercial_origin_override_url_insecure");
  }
  const allowed = new Set(settings.allowedOrigins.map(origin => new URL(origin).origin));
  if (!allowed.has(destination.origin)) {
    throw new Error("integration.commercial_origin_override_not_allowlisted");
  }

  return destination.origin;
}

export function commercialOriginOverrideEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}
