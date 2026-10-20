import type { SubscriptionFinancialTrace } from "@/application/billing/billing-subscription-trace-service";
import { previewSubscriptionLifecycle, type LifecycleAction } from "@/domain/billing/subscription-lifecycle-policy";

/**
 * C06 contract v1: describes what evidence a future deterministic executor
 * must obtain from authoritative backends. This is NOT an authorization API.
 * The current FMCC has no approved versioned effective-date policies and
 * no proof reader for these capabilities; missing evidence is always BLOCKED.
 */
export type LifecycleEvidenceKind =
  | "approved_commercial_policy"
  | "contract_effective_dates"
  | "authorized_financial_reconciliation"
  | "vertical_entitlement_state"
  | "governed_operator_confirmation"
  | "published_plan_version"
  | "trial_authority"
  | "refund_policy"
  | "delinquency_grace_period";

export interface TrustedLifecycleEvidence {
  readonly kind: LifecycleEvidenceKind;
  readonly authority: "fmcc_governed_policy" | "fmcc_contract_registry" |
    "verified_gateway_reconciler" | "authorized_vertical_connector" |
    "fmcc_governed_action" | "authoritative_trial_source";
  readonly tenantId: string;
  readonly productId: string;
  readonly subscriptionId: string;
  readonly action: LifecycleAction;
  readonly contractRevision: string;
  readonly sourceReference: string;
  readonly verifiedAt: string;
  readonly validUntil: string;
}

export type LifecycleGateStatus = "verified_by_authority" |
  "missing_authority" | "not_applicable" | "snapshot_incomplete";

export interface LifecycleExecutionGate {
  readonly kind: LifecycleEvidenceKind;
  readonly label: string;
  readonly authority: TrustedLifecycleEvidence["authority"];
  readonly status: LifecycleGateStatus;
}
export interface LifecycleExecutionReadiness {
  readonly contractVersion: "fmcc.c06.execution-prerequisites.v1";
  readonly action: LifecycleAction;
  readonly subscriptionId: string;
  readonly recordedStatus: string;
  readonly gates: readonly LifecycleExecutionGate[];
  readonly blockReasons: readonly string[];
  readonly executionAuthorized: false;
  readonly executableCommandAvailable: false;
}

const REQUIREMENTS: Readonly<Record<LifecycleAction, readonly LifecycleEvidenceKind[]>> = {
  cancel: [
    "approved_commercial_policy", "contract_effective_dates", "refund_policy",
    "vertical_entitlement_state", "governed_operator_confirmation",
  ],
  suspend: [
    "approved_commercial_policy", "contract_effective_dates",
    "delinquency_grace_period", "authorized_financial_reconciliation",
    "vertical_entitlement_state", "governed_operator_confirmation",
  ],
  reactivate: [
    "approved_commercial_policy", "contract_effective_dates",
    "authorized_financial_reconciliation", "vertical_entitlement_state",
    "governed_operator_confirmation",
  ],
  renew: [
    "approved_commercial_policy", "contract_effective_dates",
    "authorized_financial_reconciliation", "vertical_entitlement_state",
    "governed_operator_confirmation",
  ],
  migrate_plan: [
    "approved_commercial_policy", "contract_effective_dates",
    "published_plan_version", "authorized_financial_reconciliation",
    "vertical_entitlement_state", "governed_operator_confirmation",
  ],
  convert_trial: [
    "approved_commercial_policy", "contract_effective_dates", "trial_authority",
    "published_plan_version", "authorized_financial_reconciliation",
    "vertical_entitlement_state", "governed_operator_confirmation",
  ],
};

const AUTHORITIES: Readonly<Record<LifecycleEvidenceKind, {
  authority: TrustedLifecycleEvidence["authority"]; label: string;
}>> = {
  approved_commercial_policy: {
    authority: "fmcc_governed_policy", label: "Política comercial versionada e aprovada",
  },
  contract_effective_dates: {
    authority: "fmcc_contract_registry", label: "Vigência contratual e data efetiva",
  },
  authorized_financial_reconciliation: {
    authority: "verified_gateway_reconciler", label: "Reconciliação financeira com o provedor",
  },
  vertical_entitlement_state: {
    authority: "authorized_vertical_connector", label: "Estado de licença confirmado pelo SaaS",
  },
  governed_operator_confirmation: {
    authority: "fmcc_governed_action", label: "Confirmação revalidada do operador autorizado",
  },
  published_plan_version: {
    authority: "authorized_vertical_connector", label: "Versão canônica e publicada do plano",
  },
  trial_authority: {
    authority: "authoritative_trial_source", label: "Trial e coorte confirmados pelo SaaS",
  },
  refund_policy: {
    authority: "fmcc_governed_policy", label: "Regras aprovadas de reembolso e encerramento",
  },
  delinquency_grace_period: {
    authority: "fmcc_governed_policy", label: "Política aprovada de tolerância à inadimplência",
  },
};

/**
 * Proofs are supplied ONLY by future trusted backend adapters; no client
 * query/headers/body may manufacture them. Even verified prerequisites are
 * explanatory and never permit execution from this read model.
 */
export function assessLifecycleExecutionPrerequisites(
  trace: SubscriptionFinancialTrace,
  action: LifecycleAction,
  tenantId: string,
  proofs: readonly TrustedLifecycleEvidence[] = [],
  now: Date = new Date(),
): LifecycleExecutionReadiness {
  const applicability = previewSubscriptionLifecycle(trace).options.find(item => item.action === action);
  const blocks: string[] = [];
  if (applicability?.status !== "candidate_for_review") blocks.push("billing.lifecycle_state_not_applicable");
  if (trace.truncated) blocks.push("billing.lifecycle_history_incomplete");
  if (!tenantId.trim() || !trace.subscription.externalTenantId)
    blocks.push("billing.lifecycle_tenant_binding_unavailable");

  const currentTime = now.getTime();
  const gates: LifecycleExecutionGate[] = REQUIREMENTS[action].map(kind => {
    const spec = AUTHORITIES[kind];
    const found = proofs.some(proof =>
      proof.kind === kind && proof.authority === spec.authority &&
      proof.tenantId === tenantId &&
      proof.productId === trace.subscription.productId &&
      proof.subscriptionId === trace.subscription.subscriptionId &&
      proof.action === action &&
      /^[A-Za-z0-9._:-]{3,128}$/.test(proof.contractRevision) &&
      /^[A-Za-z0-9._:/-]{3,256}$/.test(proof.sourceReference) &&
      Number.isFinite(Date.parse(proof.verifiedAt)) &&
      Number.isFinite(Date.parse(proof.validUntil)) &&
      Date.parse(proof.verifiedAt) <= currentTime &&
      Date.parse(proof.validUntil) > currentTime
    );
    if (!found) blocks.push("billing.lifecycle_missing_" + kind);
    return {
      kind, label: spec.label, authority: spec.authority,
      status: found ? "verified_by_authority" as const : "missing_authority" as const,
    };
  });

  // This is a contract/specification surface. It never creates the final
  // authorization, never touches provider/ledger and never grants entitlement.
  return {
    contractVersion: "fmcc.c06.execution-prerequisites.v1",
    action, subscriptionId: trace.subscription.subscriptionId,
    recordedStatus: trace.subscription.status,
    gates, blockReasons: blocks,
    executionAuthorized: false, executableCommandAvailable: false,
  };
}
