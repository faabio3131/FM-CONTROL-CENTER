export type ProductMetricCategory = "acquisition" | "activation" | "engagement" | "revenue" | "churn" | "health";

export interface ProductMetricTarget {
  readonly category: ProductMetricCategory;
  readonly metricId: string;
  readonly displayName: string;
  readonly definitionStatus: "implemented" | "pending_semantics";
}

export const PRODUCT_INTELLIGENCE_TARGETS: readonly ProductMetricTarget[] = [
  { category: "acquisition", metricId: "lead.created.count", displayName: "Leads criados", definitionStatus: "pending_semantics" },
  { category: "acquisition", metricId: "trial.starts.count", displayName: "Trials iniciados", definitionStatus: "implemented" },
  { category: "activation", metricId: "activation.completed.count", displayName: "Ativações concluídas", definitionStatus: "pending_semantics" },
  { category: "activation", metricId: "activation.rate", displayName: "Taxa de ativação", definitionStatus: "pending_semantics" },
  { category: "engagement", metricId: "usage.active_users.dau", displayName: "Usuários ativos (DAU)", definitionStatus: "pending_semantics" },
  { category: "engagement", metricId: "usage.active_users.mau", displayName: "Usuários ativos (MAU)", definitionStatus: "pending_semantics" },
  { category: "engagement", metricId: "usage.feature_adoption.rate", displayName: "Adoção de feature", definitionStatus: "pending_semantics" },
  { category: "engagement", metricId: "usage.engagement.events", displayName: "Eventos de engajamento", definitionStatus: "pending_semantics" },
  { category: "revenue", metricId: "billing.gross_billed", displayName: "Faturamento bruto emitido", definitionStatus: "implemented" },
  { category: "revenue", metricId: "revenue.cash_collected", displayName: "Caixa recebido", definitionStatus: "implemented" },
  { category: "revenue", metricId: "subscription.active.count", displayName: "Assinaturas ativas", definitionStatus: "implemented" },
  { category: "revenue", metricId: "revenue.mrr", displayName: "MRR", definitionStatus: "pending_semantics" },
  { category: "revenue", metricId: "revenue.arr", displayName: "ARR", definitionStatus: "pending_semantics" },
  { category: "churn", metricId: "subscription.cancelled.count", displayName: "Cancelamentos", definitionStatus: "implemented" },
  { category: "churn", metricId: "subscription.logo_churn.rate", displayName: "Churn de clientes", definitionStatus: "pending_semantics" },
  { category: "health", metricId: "incident.count", displayName: "Incidentes", definitionStatus: "pending_semantics" },
  { category: "health", metricId: "service.error.rate", displayName: "Taxa de erro", definitionStatus: "pending_semantics" },
  { category: "health", metricId: "support.ticket.open.count", displayName: "Tickets abertos", definitionStatus: "pending_semantics" },
] as const;

export const PRODUCT_GROWTH_METRICS = [
  "trial.starts.count",
  "subscription.active.count",
  "billing.gross_billed",
  "revenue.cash_collected",
] as const;
