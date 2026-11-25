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

const observedAt = "2026-11-15T15:00:00.000Z";
const renewalAt = "2026-12-01T15:00:00.000Z";
it("quotes the full delta separately from the newly authorized renewal", () => {
  const quote = quoteIronPlanChange(start, growth, { nextPaymentAt: renewalAt, observedAt });
  expect(quote).toMatchObject({
    quoteOnly: true, amountDueNowMinor: 15000,
    targetRecurrence: { amountMinor: 29700, interval: "monthly",
      requiresNewCustomerAuthorization: true, firstChargeAt: renewalAt, sourceScheduleObservedAt: observedAt },
  });
});
it.each([null, observedAt, "2026-11-01T00:00:00.000Z", "invalid"])(
  "withholds the renewal date for an unusable provider schedule (%s)", (nextPaymentAt) => {
    expect(quoteIronPlanChange(start, growth, { nextPaymentAt, observedAt }).targetRecurrence)
      .toMatchObject({ firstChargeAt: null, sourceScheduleObservedAt: null });
  });
it("quotes a downgrade at the original renewal date", () => {
  expect(quoteIronPlanChange(growth, start, { nextPaymentAt: renewalAt, observedAt }))
    .toMatchObject({ amountDueNowMinor: 0, effectiveOn: "NEXT_RENEWAL",
      targetRecurrence: { firstChargeAt: renewalAt, amountMinor: 14700 } });
});
