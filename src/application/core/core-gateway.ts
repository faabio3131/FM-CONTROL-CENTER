import type { FmccVerticalCognitiveCore } from "@/application/core/fmcc-vertical-cognitive-core";
import type { MetricService, MetricView } from "@/application/metrics/metric-service";
import { ProductRegistryService } from "@/application/products/product-registry-service";
import type { CoreAnswer, CoreEvidence, CoreOperationalContext } from "@/domain/core/contracts";
import type { ProductDefinition, ProductRepository } from "@/domain/products/contracts";
import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";
import type { CoreContextReader } from "@/infrastructure/core/audit-core-context-reader";

export class CoreArgumentError extends Error {
  constructor() { super("core.argument_invalid"); }
}

function metricEvidence(metricId: string, value: MetricView, product?: ProductDefinition): CoreEvidence {
  return {
    kind: "metric", ref: metricId,
    productId: product?.id, productSlug: product?.slug,
    sourceAuthority: value.sourceAuthority, freshnessStatus: value.freshnessStatus,
    qualityStatus: value.qualityStatus, provenanceRefs: value.provenanceRefs,
    periodStart: value.periodStart?.toISOString(), periodEnd: value.periodEnd?.toISOString(), asOf: value.asOf?.toISOString(),
  };
}

function metricFact(metricId: string, value: MetricView, product?: ProductDefinition): Record<string, unknown> {
  return {
    metricId, productId: product?.id ?? null, productSlug: product?.slug ?? null, productName: product?.name ?? null,
    value: value.value, unit: value.unit, currency: value.currency ?? null,
    periodStart: value.periodStart?.toISOString() ?? null, periodEnd: value.periodEnd?.toISOString() ?? null,
    asOf: value.asOf?.toISOString() ?? null, computedAt: value.computedAt.toISOString(),
    sourceTimestamp: value.sourceTimestamp?.toISOString() ?? null,
    freshnessStatus: value.freshnessStatus, qualityStatus: value.qualityStatus, provenanceRefs: value.provenanceRefs,
  };
}

export class CoreGateway {
  constructor(
    private readonly core: FmccVerticalCognitiveCore,
    private readonly metrics: MetricService,
    private readonly contextReader?: CoreContextReader,
    private readonly products?: ProductRepository,
  ) {}

  async ask(context: TenantContext, question: string): Promise<CoreAnswer> {
    requirePermission(context, "metric:read");
    const normalized = question.trim();
    if (!normalized || normalized.length > 4000) throw new CoreArgumentError();

    const operationalContext = await this.loadOperationalContext(context);
    const productCatalog = this.products
      ? (await new ProductRegistryService(this.products).list(context)).filter((product) => product.status === "active")
      : [];
    const plan = await this.core.plan({
      question: normalized,
      operationalContext,
      productCatalog: productCatalog.map(({ slug, name }) => ({ slug, name })),
    });

    if (plan.metricIds.length < 1 || plan.metricIds.length > 8 || plan.productSlugs.length > 4) throw new CoreArgumentError();
    const bySlug = new Map(productCatalog.map((product) => [product.slug, product]));
    const selectedProducts = plan.productSlugs.map((slug) => bySlug.get(slug));
    if (selectedProducts.some((product) => !product)) throw new CoreArgumentError();
    const productScopes = selectedProducts.length ? selectedProducts as ProductDefinition[] : [undefined];
    if (productScopes.length * plan.metricIds.length > 16) throw new CoreArgumentError();

    const resolved = await Promise.all(productScopes.flatMap((product) => plan.metricIds.map(async (metricId) => {
      try {
        return { metricId, product, value: await this.metrics.query(context, metricId, product?.id) };
      } catch {
        throw new CoreArgumentError();
      }
    })));

    const available = resolved.filter((entry) => entry.value !== null) as Array<{
      metricId: string; product: ProductDefinition | undefined; value: MetricView;
    }>;

    if (available.length === 0) {
      return {
        answer: "As métricas solicitadas estão indisponíveis porque ainda não existem valores governados para as fontes autorizadas.",
        evidence: resolved.map(({ metricId, product }) => ({
          kind: "metric" as const, ref: metricId, productId: product?.id, productSlug: product?.slug,
        })),
        factualStatus: "unavailable",
      };
    }

    const evidence = available.map(({ metricId, product, value }) => metricEvidence(metricId, value, product));
    const facts = available.map(({ metricId, product, value }) => metricFact(metricId, value, product));

    return this.core.synthesize({ question: normalized, facts, evidence, operationalContext });
  }

  private async loadOperationalContext(context: TenantContext): Promise<readonly CoreOperationalContext[]> {
    if (!this.contextReader) return [];
    try { return await this.contextReader.recent({ tenantId: context.tenantId, userId: context.userId, limit: 6 }); }
    catch { return []; }
  }
}
