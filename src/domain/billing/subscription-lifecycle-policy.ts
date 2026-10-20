import type { SubscriptionFinancialTrace } from "@/application/billing/billing-subscription-trace-service";

/** Advisory state policy. NEVER permission to charge, alter a contract, or grant entitlement. */
export type LifecycleAction = "cancel" | "suspend" | "reactivate" | "renew" | "migrate_plan" | "convert_trial";
interface Rule {
  readonly action: LifecycleAction;
  readonly title: string;
  readonly applicableFrom: readonly string[];
  readonly targetState: string | null;
  readonly prerequisites: readonly string[];
}
const RULES: readonly Rule[] = [
  { action: "cancel", title: "Cancelar assinatura", applicableFrom: ["pending", "active", "past_due"], targetState: "cancelled", prerequisites: ["Política aprovada de vigência e cancelamento", "Revisão de faturas, reembolso e obrigações", "Confirmação do titular e step-up quando aplicável", "Comando idempotente, auditoria e confirmação do SaaS"] },
  { action: "suspend", title: "Suspender por inadimplência", applicableFrom: ["active"], targetState: "past_due", prerequisites: ["Inadimplência confirmada na fonte autorizada", "Política aprovada de tolerância e aviso", "Comando idempotente, auditoria e confirmação do SaaS"] },
  { action: "reactivate", title: "Reativar assinatura", applicableFrom: ["past_due"], targetState: "active", prerequisites: ["Liquidação comprovada pelo gateway", "Revisão de estornos e conflitos", "Plano e direitos válidos", "Entrega de licença confirmada e auditada"] },
  { action: "renew", title: "Renovar contrato", applicableFrom: ["active"], targetState: "active", prerequisites: ["Novo período e preço contratual versionado", "Cobrança idempotente e pagamento conciliado", "Política de renovação aprovada e aceite", "Atualização e confirmação governada no SaaS"] },
  { action: "migrate_plan", title: "Migrar plano", applicableFrom: ["active"], targetState: "active", prerequisites: ["Plano e versão canônicos publicados", "Política de upgrade/downgrade e prorrata aprovada", "Prévia vinculada, aceite e revalidação", "Confirmação de aplicação pelo SaaS"] },
  { action: "convert_trial", title: "Converter teste em assinatura", applicableFrom: [], targetState: "active", prerequisites: ["Fonte autoritativa do trial e coorte", "Contrato de conversão, plano e pagamento", "Comando idempotente e reconciliação do SaaS"] },
];
export interface LifecycleOption {
  readonly action: LifecycleAction;
  readonly title: string;
  readonly targetState: string | null;
  readonly status: "candidate_for_review" | "not_applicable";
  readonly reason: string;
  readonly prerequisites: readonly string[];
  readonly executionAuthorized: false;
}
export interface LifecyclePreview {
  readonly policyVersion: "fmcc.c06.lifecycle-preview.v1";
  readonly subscriptionId: string;
  readonly recordedStatus: string;
  readonly invoicesIncomplete: boolean;
  readonly settlementProven: false;
  readonly executable: false;
  readonly options: readonly LifecycleOption[];
}
/** Local snapshot is not settlement evidence. This policy never changes state. */
export function previewSubscriptionLifecycle(trace: SubscriptionFinancialTrace): LifecyclePreview {
  const state = trace.subscription.status;
  const known = ["pending", "active", "past_due", "cancelled"].includes(state);
  const refunded = trace.invoices.some(item =>
    item.invoiceStatus === "refunded" || item.recordedPaymentStatus === "refunded");
  return {
    policyVersion: "fmcc.c06.lifecycle-preview.v1",
    subscriptionId: trace.subscription.subscriptionId,
    recordedStatus: state,
    invoicesIncomplete: trace.truncated,
    settlementProven: false,
    executable: false,
    options: RULES.map(rule => {
      const refundConflict = refunded && ["reactivate", "renew", "migrate_plan"].includes(rule.action);
      const candidate = known && rule.applicableFrom.includes(state) && !refundConflict;
      return {
        action: rule.action, title: rule.title, targetState: rule.targetState,
        status: candidate ? "candidate_for_review" as const : "not_applicable" as const,
        reason: !known ? "Estado não classificado: nenhuma ação permitida." :
          refundConflict ? "Estorno registrado: revisão e prova financeira obrigatórias." :
          candidate ? "Apenas elegível para análise; faltam autoridades e evidências." :
          "Não aplicável ao estado registrado.",
        prerequisites: [
          ...rule.prerequisites,
          ...(trace.truncated ? ["Histórico integral indisponível nesta amostra limitada"] : []),
        ],
        executionAuthorized: false as const,
      };
    }),
  };
}
