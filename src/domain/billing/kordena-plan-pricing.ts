/** Preparação de preço comercial em rascunho, sem publicação nem cobrança. */

export type KordenaPriceChangePolicy =
  | "new_customers_only"
  | "at_next_renewal"
  | "migration_scheduled"
  | "manual_migration";

export interface KordenaPriceDraft {
  readonly resourceId: string;
  readonly payload: {
    readonly currency: "BRL";
    readonly billing_period: "monthly" | "yearly";
    readonly amount: string;
    readonly change_policy: KordenaPriceChangePolicy;
    readonly change_reason: string;
  };
}

const ALLOWED_POLICIES: ReadonlySet<string> = new Set([
  "new_customers_only", "at_next_renewal",
  "migration_scheduled", "manual_migration",
]);

/** Decimal em centavos sem arredondamento de float ou preço predefinido. */
export function canonicalAmountBRL(value: string): string {
  const normalized = value.trim().replace(",", ".");
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("pricing.valor_invalido");
  }
  const [whole, fraction = ""] = normalized.split(".");
  if (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0") <= 0n) {
    throw new Error("pricing.valor_deve_ser_positivo");
  }
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function prepareKordenaPriceDraft(input: {
  planVersionId: string;
  amount: string;
  interval: "monthly" | "yearly";
  changePolicy: string;
  reason: string;
}): KordenaPriceDraft {
  const resourceId = input.planVersionId.trim();
  if (!resourceId || resourceId.length > 128) {
    throw new Error("pricing.versao_plano_obrigatoria");
  }
  const reason = input.reason.trim();
  if (!reason || reason.length > 255) {
    throw new Error("pricing.justificativa_invalida");
  }
  if (!ALLOWED_POLICIES.has(input.changePolicy)) {
    throw new Error("pricing.politica_invalida");
  }
  if (input.interval !== "monthly" && input.interval !== "yearly") {
    throw new Error("pricing.periodicidade_invalida");
  }
  return {
    resourceId,
    payload: {
      currency: "BRL",
      billing_period: input.interval,
      amount: canonicalAmountBRL(input.amount),
      change_policy: input.changePolicy as KordenaPriceChangePolicy,
      change_reason: reason,
    },
  };
}
