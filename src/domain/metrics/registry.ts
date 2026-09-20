export type MetricKind = "count" | "sum";
export type MetricGrain = "period" | "as_of";

export interface MetricDefinition {
  readonly metricId: string;
  readonly version: number;
  readonly calculationVersion: string;
  readonly displayName: string;
  readonly description: string;
  readonly kind: MetricKind;
  readonly factType: string;
  readonly valueField?: string;
  readonly unit: "count" | "currency" | "percent";
  readonly currencyField?: string;
  readonly grain: MetricGrain;
  readonly dimensions: readonly string[];
  readonly timeWindow: "bounded_period" | "as_of";
  readonly freshnessPolicy: "source_governed";
  readonly sourceAuthority: string;
}

export const METRIC_REGISTRY: readonly MetricDefinition[] = [
  {
    metricId: "trial.starts.count", version: 1, calculationVersion: "v1",
    displayName: "Trials iniciados", description: "Trials distintos iniciados no período.",
    kind: "count", factType: "trial.started", unit: "count", grain: "period", dimensions: [],
    timeWindow: "bounded_period", freshnessPolicy: "source_governed", sourceAuthority: "configured_trial_source",
  },
  {
    metricId: "subscription.active.count", version: 1, calculationVersion: "v1",
    displayName: "Assinaturas ativas", description: "Assinaturas distintas em estado comercial ativo conforme a fonte governada.",
    kind: "count", factType: "subscription.active", unit: "count", grain: "as_of", dimensions: [],
    timeWindow: "as_of", freshnessPolicy: "source_governed", sourceAuthority: "configured_billing_source",
  },
  {
    metricId: "subscription.cancelled.count", version: 1, calculationVersion: "v1",
    displayName: "Cancelamentos", description: "Assinaturas com cancelamento efetivo no período.",
    kind: "count", factType: "subscription.cancelled", unit: "count", grain: "period", dimensions: [],
    timeWindow: "bounded_period", freshnessPolicy: "source_governed", sourceAuthority: "configured_billing_source",
  },
  {
    metricId: "billing.gross_billed", version: 1, calculationVersion: "v1",
    displayName: "Faturamento bruto emitido", description: "Soma de cobranças ou faturas válidas emitidas no período, antes do recebimento.",
    kind: "sum", factType: "billing.invoice", valueField: "amount", unit: "currency", currencyField: "currency",
    grain: "period", dimensions: ["currency"], timeWindow: "bounded_period", freshnessPolicy: "source_governed",
    sourceAuthority: "configured_billing_source",
  },
  {
    metricId: "revenue.cash_collected", version: 1, calculationVersion: "v1",
    displayName: "Caixa recebido", description: "Pagamentos efetivamente liquidados no período.",
    kind: "sum", factType: "payment.settled", valueField: "amount", unit: "currency", currencyField: "currency",
    grain: "period", dimensions: ["currency"], timeWindow: "bounded_period", freshnessPolicy: "source_governed",
    sourceAuthority: "configured_payment_source",
  },
] as const;

export function getMetricDefinition(metricId: string): MetricDefinition | null {
  return METRIC_REGISTRY.find((item) => item.metricId === metricId) ?? null;
}
