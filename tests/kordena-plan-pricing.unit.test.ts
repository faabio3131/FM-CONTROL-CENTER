import { describe, expect, it } from "vitest";
import { canonicalAmountBRL, prepareKordenaPriceDraft } from "../src/domain/billing/kordena-plan-pricing";

describe("preços configuráveis do Kordena", () => {
  it.each([
    ["89,9", "89.90"],
    ["179.90", "179.90"],
    ["0,01", "0.01"],
    ["1000", "1000.00"],
  ])("normaliza decimal %s sem arredondar (%s)", (input, expected) => {
    expect(canonicalAmountBRL(input)).toBe(expected);
  });

  it.each(["", "0", "0,00", "-1", "1.234,56", "1.234", "1.999", "abc", "9999999999999"])(
    "recusa valores ambíguos ou inválidos: %s",
    (value) => expect(() => canonicalAmountBRL(value)).toThrow(),
  );

  it("não define preços automaticamente nem libera cobrança", () => {
    const draft = prepareKordenaPriceDraft({
      planVersionId: "plan-version-1",
      amount: "259,90",
      interval: "monthly",
      changePolicy: "new_customers_only",
      reason: "Valor aprovado pela direção",
    });
    expect(draft).toEqual({
      resourceId: "plan-version-1",
      payload: {
        currency: "BRL",
        billing_period: "monthly",
        amount: "259.90",
        change_policy: "new_customers_only",
        change_reason: "Valor aprovado pela direção",
      },
    });
    expect(draft.payload).not.toHaveProperty("publish");
    expect(draft.payload).not.toHaveProperty("charge");
  });

  it("recusa ausência de versão, motivo e política comercial inválida", () => {
    const base = {
      planVersionId: "id", amount: "1,00", interval: "monthly" as const,
      changePolicy: "at_next_renewal", reason: "Aprovação documentada",
    };
    expect(() => prepareKordenaPriceDraft({ ...base, planVersionId: "" })).toThrow();
    expect(() => prepareKordenaPriceDraft({ ...base, reason: "" })).toThrow();
    expect(() => prepareKordenaPriceDraft({ ...base, changePolicy: "retroactive" })).toThrow();
  });
});
