import type { FmccVerticalCognitiveCore } from "@/application/core/fmcc-vertical-cognitive-core";
import type { MetricService, MetricView } from "@/application/metrics/metric-service";
import type { CoreAnswer, CoreEvidence, CoreOperationalContext } from "@/domain/core/contracts";
import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";
import type { CoreContextReader } from "@/infrastructure/core/audit-core-context-reader";

export class CoreArgumentError extends Error {
  constructor() { super("core.argument_invalid"); }
}

function metricEvidence(metricId: string, value: MetricView): CoreEvidence {
  return {
    kind: "metric",
    ref: metricId,
    sourceAuthority: value.sourceAuthority,
    freshnessStatus: value.freshnessStatus,
    qualityStatus: value.qualityStatus,
    provenanceRefs: value.provenanceRefs,
    periodStart: value.periodStart?.toISOString(),
    periodEnd: value.periodEnd?.toISOString(),
    asOf: value.asOf?.toISOString(),
  };
}

function metricFact(metricId: string, value: MetricView): Record<string, unknown> {
  return {
    metricId,
    value: value.value,
    unit: value.unit,
    currency: value.currency ?? null,
    periodStart: value.periodStart?.toISOString() ?? null,
    periodEnd: value.periodEnd?.toISOString() ?? null,
    asOf: value.asOf?.toISOString() ?? null,
    computedAt: value.computedAt.toISOString(),
    sourceTimestamp: value.sourceTimestamp?.toISOString() ?? null,
    freshnessStatus: value.freshnessStatus,
    qualityStatus: value.qualityStatus,
    provenanceRefs: value.provenanceRefs,
  };
}

export class CoreGateway {
  constructor(
    private readonly core: FmccVerticalCognitiveCore,
    private readonly metrics: MetricService,
    private readonly contextReader?: CoreContextReader,
  ) {}

  async ask(context: TenantContext, question: string): Promise<CoreAnswer> {
    requirePermission(context, "metric:read");
    const normalized = question.trim();
    if (!normalized || normalized.length > 4000) throw new CoreArgumentError();

    const operationalContext = await this.loadOperationalContext(context);
    const metricIds = await this.core.plan({ question: normalized, operationalContext });
    if (metricIds.length < 1 || metricIds.length > 8) throw new CoreArgumentError();

    const resolved = await Promise.all(metricIds.map(async (metricId) => {
      try {
        return { metricId, value: await this.metrics.query(context, metricId) };
      } catch {
        throw new CoreArgumentError();
      }
    }));

    const available = resolved.filter(
      (entry): entry is { metricId: string; value: MetricView } => entry.value !== null,
    );

    if (available.length === 0) {
      return {
        answer: "As métricas solicitadas estão indisponíveis porque ainda não existem valores governados para as fontes autorizadas.",
        evidence: metricIds.map((metricId) => ({ kind: "metric" as const, ref: metricId })),
        factualStatus: "unavailable",
      };
    }

    const evidence = available.map(({ metricId, value }) => metricEvidence(metricId, value));
    const facts = available.map(({ metricId, value }) => metricFact(metricId, value));

    return this.core.synthesize({
      question: normalized,
      facts,
      evidence,
      operationalContext,
    });
  }

  private async loadOperationalContext(context: TenantContext): Promise<readonly CoreOperationalContext[]> {
    if (!this.contextReader) return [];
    try {
      return await this.contextReader.recent({ tenantId: context.tenantId, userId: context.userId, limit: 6 });
    } catch {
      return [];
    }
  }
}
