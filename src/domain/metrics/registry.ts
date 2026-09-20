export type MetricKind = "count" | "sum";

export interface MetricDefinition {
  readonly metricId: string;
  readonly version: number;
  readonly displayName: string;
  readonly kind: MetricKind;
  readonly factType: string;
  readonly valueField?: string;
  readonly unit: "count" | "currency" | "percent";
  readonly currencyField?: string;
  readonly sourceAuthority: string;
}

export const METRIC_REGISTRY: readonly MetricDefinition[] = [
  { metricId: "trial.starts.count", version: 1, displayName: "Trials iniciados", kind: "count", factType: "trial.started", unit: "count", sourceAuthority: "configured_trial_source" },
  { metricId: "subscription.active.count", version: 1, displayName: "Assinaturas ativas", kind: "count", factType: "subscription.active", unit: "count", sourceAuthority: "configured_billing_source" },
  { metricId: "subscription.cancelled.count", version: 1, displayName: "Cancelamentos", kind: "count", factType: "subscription.cancelled", unit: "count", sourceAuthority: "configured_billing_source" },
  { metricId: "billing.gross_billed", version: 1, displayName: "Faturamento bruto emitido", kind: "sum", factType: "billing.invoice", valueField: "amount", unit: "currency", currencyField: "currency", sourceAuthority: "configured_billing_source" },
  { metricId: "revenue.cash_collected", version: 1, displayName: "Caixa recebido", kind: "sum", factType: "payment.settled", valueField: "amount", unit: "currency", currencyField: "currency", sourceAuthority: "configured_payment_source" },
] as const;

export function getMetricDefinition(metricId: string): MetricDefinition | null {
  return METRIC_REGISTRY.find((item) => item.metricId === metricId) ?? null;
}
