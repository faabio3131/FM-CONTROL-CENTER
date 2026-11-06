import type { UniversalUsageMetric } from "@/domain/integration/universal-saas-contract";

/** Read-side projection of already-ingested facts. Never computes invoices. */
export interface OperationalUsageRow {
  readonly externalTenantRef: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly metrics: readonly UniversalUsageMetric[];
}
export interface OperationalQuotaView {
  readonly text: string;
  readonly percentage: number | null;
  readonly severity: "normal" | "warning" | "critical" | "unknown";
}
export function quotaView(metric: UniversalUsageMetric): OperationalQuotaView {
  if (metric.limitStatus === "unknown") return {
    text: "Quota indisponível", percentage: null, severity: "unknown",
  };
  if (metric.limitStatus === "unlimited") return {
    text: "Sem teto informado pelo SaaS (não é autorização de billing)",
    percentage: null, severity: "unknown",
  };
  const maximum = metric.limit;
  if (maximum === null || !Number.isSafeInteger(maximum) || maximum < 0) return {
    text: "Quota inválida", percentage: null, severity: "unknown",
  };
  if (maximum === 0) return {
    text: "Limite de 0 unidades", percentage: null,
    severity: metric.quantity > 0 ? "critical" : "warning",
  };
  const percentage = Math.round(metric.quantity / maximum * 100);
  return {
    text: `${metric.quantity.toLocaleString("pt-BR")} / ${maximum.toLocaleString("pt-BR")} · ${percentage}%`,
    percentage,
    severity: percentage >= 100 ? "critical" : percentage >= 70 ? "warning" : "normal",
  };
}
export function projectOperationalUsage(
  payload: Record<string, unknown>,
): OperationalUsageRow | null {
  const ref = payload.externalTenantRef;
  const start = payload.periodStart;
  const end = payload.periodEnd;
  const values = payload.metrics;
  if (typeof ref !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(ref) ||
    typeof start !== "string" || typeof end !== "string" ||
    !Array.isArray(values) || values.length > 24) return null;
  const metrics: UniversalUsageMetric[] = [];
  for (const candidate of values) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const r = candidate as Record<string, unknown>;
    if (typeof r.metricId !== "string" || r.metricId.length > 96 ||
      !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){1,4}$/.test(r.metricId) ||
      (r.unit !== "count" && r.unit !== "tokens") ||
      typeof r.quantity !== "number" || !Number.isSafeInteger(r.quantity) || r.quantity < 0 ||
      (r.limitStatus !== "bounded" && r.limitStatus !== "unlimited" && r.limitStatus !== "unknown") ||
      (r.limitStatus === "bounded" &&
        (typeof r.limit !== "number" || !Number.isSafeInteger(r.limit) || r.limit < 0)) ||
      (r.limitStatus !== "bounded" && r.limit !== null)) return null;
    metrics.push({
      metricId: r.metricId, unit: r.unit, quantity: r.quantity,
      limitStatus: r.limitStatus, limit: r.limitStatus === "bounded" ? r.limit as number : null,
    });
  }
  return { externalTenantRef: ref, periodStart: start, periodEnd: end, metrics };
}
