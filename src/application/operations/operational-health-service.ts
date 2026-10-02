import { ProductRegistryService } from "@/application/products/product-registry-service";
import type { OperationalHealthRepository, ServiceHealthObservation } from "@/domain/operations/health";
import type { ProductRepository } from "@/domain/products/contracts";
import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";

export class OperationalHealthService {
  private readonly products?: ProductRegistryService;

  constructor(private readonly repository: OperationalHealthRepository, products?: ProductRepository) {
    this.products = products ? new ProductRegistryService(products) : undefined;
  }

  async overview(context: TenantContext) {
    requirePermission(context, "metric:read");
    const services = await this.repository.listServices(context.tenantId);
    const entries = await Promise.all(services.map(async (service) => ({
      service,
      observation: await this.repository.latestObservation(context.tenantId, service.id),
    })));
    return {
      services: entries,
      counts: {
        operational: entries.filter(({ observation }) => observation?.status === "operational").length,
        degraded: entries.filter(({ observation }) => observation?.status === "degraded").length,
        unavailable: entries.filter(({ observation }) => observation?.status === "unavailable").length,
        unknown: entries.filter(({ observation }) => !observation || observation.status === "unknown").length,
      },
      availability: {
        value: null as string | null,
        reason: "Disponibilidade consolidada exige política de janela e denominador aprovados.",
      },
    };
  }

  async registerService(context: TenantContext, input: {
    productId?: string; name: string; serviceType: string; authority: string; environment: string; expectedHealthContract: string;
  }) {
    requirePermission(context, "integration:write");
    if (input.productId && this.products) await this.products.get(context, input.productId);
    return this.repository.createService(context.tenantId, input);
  }

  async recordObservation(context: TenantContext, input: ServiceHealthObservation) {
    requirePermission(context, "integration:write");
    const services = await this.repository.listServices(context.tenantId);
    if (!services.some((service) => service.id === input.serviceId)) throw new Error("operations.service_not_found");
    if (!input.sourceAuthority.trim() || input.provenanceRefs.length < 1) throw new Error("operations.health_evidence_required");
    await this.repository.recordObservation(context.tenantId, input);
  }
}
