import { expect, it } from "vitest";
import { quoteIronPlanChange } from "../src/application/billing/iron-plan-change-quote";
const start = { planCode: "START", interval: "monthly", amountMinor: 14700 };
const growth = { planCode: "GROWTH", interval: "monthly", amountMinor: 29700 };
it("charges the full difference, irrespective of the day of the monthly cycle", () => {
  expect(quoteIronPlanChange(start, growth)).toMatchObject({ amountDueNowMinor: 15000, effectiveOn: "DIFFERENCE_PAYMENT_CONFIRMED" });
});
it("keeps the current plan until renewal for a downgrade", () => {
  expect(quoteIronPlanChange(growth, start)).toMatchObject({ amountDueNowMinor: 0, effectiveOn: "NEXT_RENEWAL" });
});
it("does not compare annual prices with monthly prices", () => {
  expect(() => quoteIronPlanChange(start, { ...growth, interval: "yearly" })).toThrow();
});
