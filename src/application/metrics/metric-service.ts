import { computeMetric, type MetricFact } from "@/domain/metrics/metric-engine";
import { getMetricDefinition, METRIC_REGISTRY } from "@/domain/metrics/registry";
import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";

export interface MetricStore {
  factsForMetric(input: { tenantId: string; factType: string; periodStart?: Date; periodEnd?: Date }): Promise<readonly MetricFact[]>;
  saveValue(input: {
    tenantId: string; metricId: string; metricVersion: number; value: string | null; unit: string; currency?: string;
    periodStart?: Date; periodEnd?: Date; computedAt: Date; sourceTimestamp?: Date; freshnessStatus: string;
    qualityStatus: string; sourceAuthority: string; provenanceRefs: readonly string[];
  }): Promise<void>;
  latestValue(tenantId: string, metricId: string): Promise<MetricView | null>;
}

export interface MetricView {
  readonly metricId: string;
  readonly metricVersion: number;
  readonly value: string | null;
  readonly unit: string;
  readonly currency?: string;
  readonly computedAt: Date;
  readonly sourceTimestamp?: Date;
  readonly freshnessStatus: string;
  readonly qualityStatus: string;
  readonly sourceAuthority: string;
  readonly provenanceRefs: readonly string[];
}

export class MetricService {
  constructor(private readonly store: MetricStore) {}

  async recompute(context: TenantContext, input: { metricId: string; periodStart?: Date; periodEnd?: Date }): Promise<MetricView> {
    requirePermission(context, "metric:read");
    const definition = getMetricDefinition(input.metricId);
    if (!definition) throw new Error(`metrics.definition_not_found:${input.metricId}`);
    const facts = await this.store.factsForMetric({ tenantId: context.tenantId, factType: definition.factType, periodStart: input.periodStart, periodEnd: input.periodEnd });
    const computed = computeMetric(definition, facts);
    const now = new Date();
    const value: MetricView = {
      metricId: definition.metricId, metricVersion: definition.version, value: computed.value,
      unit: computed.unit, currency: computed.status === "available" ? computed.currency : undefined,
      computedAt: now, sourceTimestamp: computed.status === "available" ? computed.sourceTimestamp : undefined,
      freshnessStatus: computed.status === "available" ? "unknown" : "unavailable",
      qualityStatus: computed.qualityStatus, sourceAuthority: definition.sourceAuthority,
      provenanceRefs: computed.provenanceRefs,
    };
    await this.store.saveValue({ tenantId: context.tenantId, ...value, periodStart: input.periodStart, periodEnd: input.periodEnd });
    return value;
  }

  async query(context: TenantContext, metricId: string): Promise<MetricView | null> {
    requirePermission(context, "metric:read");
    if (!getMetricDefinition(metricId)) throw new Error(`metrics.definition_not_found:${metricId}`);
    return this.store.latestValue(context.tenantId, metricId);
  }

  async overview(context: TenantContext): Promise<Array<{ definition: (typeof METRIC_REGISTRY)[number]; value: MetricView | null }>> {
    requirePermission(context, "metric:read");
    return Promise.all(METRIC_REGISTRY.map(async (definition) => ({ definition, value: await this.store.latestValue(context.tenantId, definition.metricId) })));
  }
}
