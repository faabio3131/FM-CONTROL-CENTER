import type { MetricService } from "@/application/metrics/metric-service";
import type { CanonicalCoreClient, CoreAnswer, CoreEvidence, FmccCapability } from "@/domain/core/contracts";
import type { TenantContext } from "@/domain/security/tenant-context";

const ALLOWED_CAPABILITIES: readonly FmccCapability[] = ["metric.query", "source.status"];

export class CoreCapabilityDeniedError extends Error {
  constructor() { super("core.capability_denied"); }
}
export class CoreArgumentError extends Error {
  constructor() { super("core.argument_invalid"); }
}

export class CoreGateway {
  constructor(private readonly core: CanonicalCoreClient, private readonly metrics: MetricService) {}

  async ask(context: TenantContext, question: string): Promise<CoreAnswer> {
    const normalized = question.trim();
    if (!normalized || normalized.length > 4000) throw new CoreArgumentError();

    const plan = await this.core.plan({
      question: normalized, tenantId: context.tenantId, userId: context.userId,
      correlationId: context.correlationId, allowedCapabilities: ALLOWED_CAPABILITIES,
    });
    if (!ALLOWED_CAPABILITIES.includes(plan.capability)) throw new CoreCapabilityDeniedError();

    if (plan.capability === "metric.query") {
      const metricId = plan.arguments.metricId?.trim();
      if (!metricId) throw new CoreArgumentError();
      const value = await this.metrics.query(context, metricId);
      if (!value) {
        return {
          answer: "Esta métrica está indisponível porque ainda não existe valor governado para a fonte autorizada.",
          evidence: [{ kind: "metric", ref: metricId }],
          factualStatus: "unavailable",
        };
      }
      const evidence: CoreEvidence[] = [{
        kind: "metric", ref: metricId, sourceAuthority: value.sourceAuthority,
        freshnessStatus: value.freshnessStatus, qualityStatus: value.qualityStatus,
      }];
      return this.core.synthesize({
        question: normalized, tenantId: context.tenantId, userId: context.userId,
        correlationId: context.correlationId,
        facts: [{ metricId, value: value.value, unit: value.unit, currency: value.currency ?? null, computedAt: value.computedAt.toISOString() }],
        evidence,
      });
    }

    return { answer: "A capability solicitada ainda não possui uma fonte autorizada configurada.", evidence: [], factualStatus: "unavailable" };
  }
}
