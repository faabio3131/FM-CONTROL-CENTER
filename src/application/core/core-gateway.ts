import type { MetricService, MetricView } from "@/application/metrics/metric-service";
import type {
  CanonicalCoreClient,
  CoreAnswer,
  CoreEvidence,
  CoreOperationalContext,
  FmccCapability,
} from "@/domain/core/contracts";
import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";
import type { CoreContextReader } from "@/infrastructure/core/audit-core-context-reader";

const ALLOWED_CAPABILITIES: readonly FmccCapability[] = ["metric.query", "metrics.query_many"];
const MAX_METRICS_PER_QUERY = 8;

export class CoreCapabilityDeniedError extends Error {
  constructor() { super("core.capability_denied"); }
}

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

function oneMetricId(arguments_: Readonly<Record<string, unknown>>): string {
  const metricId = arguments_.metricId;
  if (typeof metricId !== "string" || !metricId.trim()) throw new CoreArgumentError();
  return metricId.trim();
}

function manyMetricIds(arguments_: Readonly<Record<string, unknown>>): readonly string[] {
  const metricIds = arguments_.metricIds;
  if (!Array.isArray(metricIds)) throw new CoreArgumentError();
  const normalized = [...new Set(metricIds.map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean))];
  if (normalized.length < 2 || normalized.length > MAX_METRICS_PER_QUERY) throw new CoreArgumentError();
  return normalized;
}

export class CoreGateway {
  constructor(
    private readonly core: CanonicalCoreClient,
    private readonly metrics: MetricService,
    private readonly contextReader?: CoreContextReader,
  ) {}

  async ask(context: TenantContext, question: string): Promise<CoreAnswer> {
    requirePermission(context, "metric:read");
    const normalized = question.trim();
    if (!normalized || normalized.length > 4000) throw new CoreArgumentError();

    const operationalContext = await this.loadOperationalContext(context);
    const plan = await this.core.plan({
      question: normalized,
      tenantId: context.tenantId,
      userId: context.userId,
      correlationId: context.correlationId,
      allowedCapabilities: ALLOWED_CAPABILITIES,
      operationalContext,
    });
    if (!ALLOWED_CAPABILITIES.includes(plan.capability)) throw new CoreCapabilityDeniedError();

    const metricIds = plan.capability === "metric.query"
      ? [oneMetricId(plan.arguments)]
      : manyMetricIds(plan.arguments);

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
      tenantId: context.tenantId,
      userId: context.userId,
      correlationId: context.correlationId,
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
      // Context is continuity aid, never factual authority. A memory-read failure
      // must not silently elevate or fabricate information, nor block governed facts.
      return [];
    }
  }
}
