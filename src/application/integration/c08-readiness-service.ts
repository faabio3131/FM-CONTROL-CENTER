import type { SourceRepository, SyncOperationalReader } from "@/domain/integration/contracts";
import type { ProductRepository } from "@/domain/products/contracts";
import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";
import { buildC08IntegrationReadiness } from "@/application/integration/c08-product-readiness";
import { assertC08SnapshotCapacity, readC08OperationalStates } from "@/application/integration/c08-operational-snapshot";

/**
 * Read-only C08 API use-case for Command/Core. Calls only tenant-scoped stores,
 * never a SaaS/gateway and never invents certification or successful syncs.
 */
export class C08ReadinessService {
  constructor(
    private readonly products: ProductRepository,
    private readonly sources: SourceRepository,
    private readonly sync: SyncOperationalReader,
  ) {}

  async snapshot(context: TenantContext, now = new Date()) {
    requirePermission(context, "source:read");
    requirePermission(context, "product:read");
    if (!context.tenantId.trim()) {
      throw new Error("integration.c08_tenant_missing");
    }
    const [products, sources] = await Promise.all([
      this.products.list(context.tenantId),
      this.sources.list(context.tenantId),
    ]);
    assertC08SnapshotCapacity(products, sources);
    const operational = await readC08OperationalStates(context.tenantId, sources, this.sync);
    return buildC08IntegrationReadiness(context.tenantId, products, sources, operational, now);
  }
}
