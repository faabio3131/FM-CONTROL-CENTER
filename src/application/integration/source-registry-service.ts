import type { NewSourceDefinition, SourceDefinition, SourceRepository } from "@/domain/integration/contracts";
import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";

export class InvalidSecretReferenceError extends Error {
  constructor() { super("integration.secret_reference_invalid"); }
}

function validateSecretRef(secretRef?: string): void {
  if (!secretRef) return;
  if (!/^[a-z][a-z0-9+.-]*:[^\s]+$/i.test(secretRef)) throw new InvalidSecretReferenceError();
}

export class SourceRegistryService {
  constructor(private readonly sources: SourceRepository) {}

  async list(context: TenantContext): Promise<readonly SourceDefinition[]> {
    requirePermission(context, "source:read");
    return this.sources.list(context.tenantId);
  }

  async register(context: TenantContext, input: NewSourceDefinition): Promise<SourceDefinition> {
    requirePermission(context, "source:write");
    validateSecretRef(input.secretRef);
    if (!input.name.trim() || !input.sourceType.trim() || !input.authoritativeDomain.trim()) {
      throw new Error("integration.source_definition_invalid");
    }
    if (input.freshnessSeconds !== undefined && (!Number.isInteger(input.freshnessSeconds) || input.freshnessSeconds < 1)) {
      throw new Error("integration.freshness_invalid");
    }
    return this.sources.create(context.tenantId, {
      ...input,
      name: input.name.trim(),
      sourceType: input.sourceType.trim(),
      authoritativeDomain: input.authoritativeDomain.trim(),
      mappingVersion: input.mappingVersion?.trim() || "v1",
    });
  }
}
