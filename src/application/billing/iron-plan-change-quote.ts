/** BRL minor units, for a change between plans with the same billing cycle. */
export function quoteIronPlanChange(
  current: { planCode: string; amountMinor: number; interval: string },
  target: { planCode: string; amountMinor: number; interval: string },
  schedule: { nextPaymentAt: string | null; observedAt: string } | null = null,
) {
  if (!Number.isSafeInteger(current.amountMinor) || current.amountMinor <= 0 ||
      !Number.isSafeInteger(target.amountMinor) || target.amountMinor <= 0 ||
      current.planCode === target.planCode || current.interval !== target.interval ||
      !['monthly', 'yearly'].includes(current.interval) || current.amountMinor === target.amountMinor)
    throw new Error('iron.plan_change_unavailable');
  const difference = target.amountMinor - current.amountMinor;
  const renewalAt = schedule?.nextPaymentAt;
  const renewalVerified = renewalAt != null && schedule != null &&
    Date.parse(renewalAt) > Date.parse(schedule.observedAt);
  return {
    currentPlanCode: current.planCode, targetPlanCode: target.planCode, currency: 'BRL' as const,
    amountDueNowMinor: Math.max(0, difference),
    effectiveOn: difference > 0 ? 'DIFFERENCE_PAYMENT_CONFIRMED' as const : 'NEXT_RENEWAL' as const,
    targetRecurrence: {
      requiresNewCustomerAuthorization: true as const,
      amountMinor: target.amountMinor,
      interval: target.interval,
      firstChargeAt: renewalVerified ? renewalAt : null,
      sourceScheduleObservedAt: renewalVerified ? schedule.observedAt : null,
    },
    quoteOnly: true as const,
  };
}
