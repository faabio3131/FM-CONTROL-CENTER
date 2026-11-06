import type { KordenaCommercialSnapshot } from "@/infrastructure/integration/kordena-commercial-connector";
import type { IronCommercialSnapshot } from "@/infrastructure/integration/iron-commercial-connector";

/**
 * A source may offer many business collections while its pull() persists only
 * snapshot.facts. This DTO reports read-only *contract breadth* without copying
 * raw customers, invoices, subscriptions, tenant identifiers, or other PII.
 */
export interface CommercialCoverageRow {
  readonly code: string;
  readonly label: string;
  readonly reportedRecords: number;
  readonly authority: "saas" | "fm-command";
}

export interface CommercialCoverageReport {
  readonly source: "kordena-commercial-v1" | "iron-commercial-v1";
  readonly contract: string;
  readonly asOf: string;
  readonly snapshotFactCount: number;
  readonly collections: readonly CommercialCoverageRow[];
  readonly summary: readonly { readonly code: string; readonly label: string; readonly count: number }[];
  readonly additionalTelemetry: "reported" | "not_in_this_snapshot";
  readonly billingFromFmCommand: boolean;
  readonly completeIntegrationCertified: false;
}

type InputSnapshot = KordenaCommercialSnapshot | IronCommercialSnapshot;
type CollectionRow = { code: string; label: string };

const KORDENA_COLLECTIONS: readonly CollectionRow[] = [
  { code: "customers", label: "Clientes" },
  { code: "product_accounts", label: "Contas do produto" },
  { code: "trials", label: "Testes grátis" },
  { code: "subscriptions", label: "Assinaturas" },
  { code: "billing_transactions", label: "Transações reportadas pelo SaaS" },
  { code: "entitlements", label: "Direitos de acesso" },
  { code: "catalog", label: "Catálogo comercial" },
];

const IRON_COLLECTIONS: readonly CollectionRow[] = [
  { code: "customers", label: "Academias / tenants" },
  { code: "trials", label: "Testes grátis" },
  { code: "subscriptions", label: "Assinaturas" },
  { code: "entitlements", label: "Direitos de acesso" },
  { code: "onboarding", label: "Etapas de ativação" },
  { code: "billing_transactions", label: "Transações do SaaS (billing FM Command)" },
];

const KORDENA_SUMMARY: readonly CollectionRow[] = [
  { code: "customers", label: "Clientes comerciais" },
  { code: "internal_test_customers", label: "Clientes internos de teste" },
  { code: "active_trials", label: "Trials ativos" },
  { code: "active_subscriptions", label: "Assinaturas ativas" },
  { code: "past_due_subscriptions", label: "Assinaturas em atraso" },
  { code: "suspended_subscriptions", label: "Assinaturas suspensas" },
  { code: "confirmed_payments", label: "Pagamentos confirmados no SaaS" },
  { code: "failed_payments", label: "Pagamentos falhos no SaaS" },
  { code: "users", label: "Usuários" },
  { code: "units", label: "Unidades" },
];

const IRON_SUMMARY: readonly CollectionRow[] = [
  { code: "customers", label: "Academias" },
  { code: "active_customers", label: "Academias ativas" },
  { code: "active_trials", label: "Trials ativos" },
  { code: "active_subscriptions", label: "Assinaturas ativas" },
  { code: "suspended_subscriptions", label: "Assinaturas suspensas" },
  { code: "canceled_subscriptions", label: "Assinaturas canceladas" },
];

function safeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("integration.commercial_coverage_count_invalid");
  }
  return value;
}

export function projectCommercialCoverage(
  sourceType: "kordena-commercial-v1" | "iron-commercial-v1",
  input: InputSnapshot,
): CommercialCoverageReport {
  if ((sourceType === "kordena-commercial-v1" &&
       (input.schema_version !== "kordena.fmcc.commercial.v1" || input.product_code !== "KORDENA")) ||
      (sourceType === "iron-commercial-v1" &&
       (input.schema_version !== "iron.fmcc.commercial.v1" || input.product_code !== "IRON_FIT_CORE"))) {
    throw new Error("integration.commercial_coverage_contract_mismatch");
  }
  const date = new Date(input.as_of);
  if (Number.isNaN(date.getTime())) throw new Error("integration.commercial_coverage_date_invalid");
  const kordena = sourceType === "kordena-commercial-v1";
  const rows = kordena ? KORDENA_COLLECTIONS : IRON_COLLECTIONS;
  const summaryFields = kordena ? KORDENA_SUMMARY : IRON_SUMMARY;
  const raw = input as unknown as Record<string, unknown>;
  const claimedAuthority = input.coverage.billing_transactions === "FM_COMMAND_AUTHORITY";
  const collections = rows.map(row => {
    const collection = raw[row.code];
    if (!Array.isArray(collection)) throw new Error("integration.commercial_coverage_collection_invalid");
    return {
      ...row,
      reportedRecords: safeCount(collection.length),
      authority: (row.code === "billing_transactions" && claimedAuthority
        ? "fm-command" : "saas") as "fm-command" | "saas",
    };
  });
  if (!Array.isArray(input.facts)) throw new Error("integration.commercial_coverage_facts_invalid");
  const summary = summaryFields.flatMap(row => {
    const value = input.summary[row.code];
    return value === undefined ? [] : [{
      ...row,
      count: safeCount(value),
    }];
  });
  const telemetry = kordena && "observability" in input && Boolean(input.observability)
    ? "reported" as const : "not_in_this_snapshot" as const;
  return {
    source: sourceType,
    contract: input.schema_version,
    asOf: date.toISOString(),
    snapshotFactCount: safeCount(input.facts.length),
    collections,
    summary,
    additionalTelemetry: telemetry,
    billingFromFmCommand: claimedAuthority,
    completeIntegrationCertified: false,
  };
}
