/**
 * IRON plan changes (FM commercial decision, 27/11/2026): upgrades only, and the
 * new plan is bought for the next cycle. The gym pays the higher plan's full
 * price through its own Cakto checkout during the last days before renewal;
 * the paid period starts when the current paid period ends, so no day is lost
 * and no proration or difference charge exists. Downgrades are not offered.
 */
export const IRON_UPGRADE_WINDOW_DAYS = 5;
const DAY = 86_400_000;

export type IronUpgradeCheck =
  | { allowed: true; opensAt: Date; renewalAt: Date }
  | { allowed: false; reason: "not_upgrade" | "interval_mismatch" | "no_paid_period" | "window_not_open" | "period_ended"; opensAt?: Date; renewalAt?: Date };

export function ironUpgradeAtRenewal(
  current: { amountMinor: number; interval: string; paidThrough: Date | null },
  target: { amountMinor: number; interval: string },
  now: Date,
): IronUpgradeCheck {
  if (current.interval !== target.interval) return { allowed: false, reason: "interval_mismatch" };
  if (!(target.amountMinor > current.amountMinor)) return { allowed: false, reason: "not_upgrade" };
  const renewalAt = current.paidThrough;
  if (!renewalAt || !Number.isFinite(renewalAt.getTime())) return { allowed: false, reason: "no_paid_period" };
  const opensAt = new Date(renewalAt.getTime() - IRON_UPGRADE_WINDOW_DAYS * DAY);
  if (now.getTime() < opensAt.getTime()) return { allowed: false, reason: "window_not_open", opensAt, renewalAt };
  if (now.getTime() >= renewalAt.getTime()) return { allowed: false, reason: "period_ended", opensAt, renewalAt };
  return { allowed: true, opensAt, renewalAt };
}
