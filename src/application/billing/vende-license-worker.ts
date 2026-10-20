/** FM-owned Vende license worker orchestration (no autonomous production activation).
 * A scheduler invokes the guarded POST endpoint; this module never creates
 * timers or grants permission to deploy. Each delivery retains its existing
 * PostgreSQL CAS claim and exact signed Assistant proof requirements.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { billingVendeLicenseOutbox } from "@/infrastructure/db/billing-schema";
import {
  drainVerifiedVendePaidLicenses, quarantineStaleVendeLicenseClaims,
} from "@/application/billing/assistant-paid-license-outbox";
import {
  AssistantPlanDeliveryUnavailable, type PlanProjectionConfig,
} from "@/application/billing/assistant-plan-outbox-dispatcher";

export type VendeQueueHealth = Readonly<{
  pending: number;
  processing: number;
  blocked: number;
  delivered: number;
  staleProcessing: number;
  oldestPendingAgeSeconds: number | null;
  alert: "healthy" | "attention" | "critical";
}>;

export function assertVendeWorkerEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED !== "true" ||
      !env.FM_COMMAND_PLATFORM_ORGANIZATION_ID) {
    throw new AssistantPlanDeliveryUnavailable();
  }
}

function assertScope(tenantId: string) {
  if (!tenantId || tenantId !== process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID)
    throw new AssistantPlanDeliveryUnavailable();
}

/** Query every row for authoritative counts, not merely the first page
 * returned to operators. 'Unknown' is never reported as a successful delivery.
 */
export async function readVendeQueueHealth(
  corporateTenantId: string, now = new Date(),
): Promise<VendeQueueHealth> {
  assertScope(corporateTenantId);
  if (!Number.isFinite(now.getTime())) throw new AssistantPlanDeliveryUnavailable();
  const row = await db.select({
    pending: sql<number>`count(*) filter (where ${billingVendeLicenseOutbox.state} = 'pending')::integer`,
    processing: sql<number>`count(*) filter (where ${billingVendeLicenseOutbox.state} = 'processing')::integer`,
    blocked: sql<number>`count(*) filter (where ${billingVendeLicenseOutbox.state} = 'blocked')::integer`,
    delivered: sql<number>`count(*) filter (where ${billingVendeLicenseOutbox.state} = 'delivered')::integer`,
    staleProcessing: sql<number>`count(*) filter (where ${billingVendeLicenseOutbox.state} = 'processing' and ${billingVendeLicenseOutbox.claimedAt} < ${new Date(now.getTime() - 120_000)})::integer`,
    oldestPendingAt: sql<Date | null>`min(${billingVendeLicenseOutbox.createdAt}) filter (where ${billingVendeLicenseOutbox.state} = 'pending')`,
  }).from(billingVendeLicenseOutbox).where(and(
    eq(billingVendeLicenseOutbox.tenantId, corporateTenantId),
  ));
  const counts = row[0];
  if (!counts) throw new AssistantPlanDeliveryUnavailable();
  const age = counts.oldestPendingAt ?
    Math.max(0, Math.floor((now.getTime() - new Date(counts.oldestPendingAt).getTime()) / 1000)) : null;
  const oldestPendingAgeSeconds = age !== null && Number.isFinite(age) ? age : null;
  const alert = counts.blocked > 0 || counts.staleProcessing > 0 ? "critical" :
    (counts.processing > 0 || (oldestPendingAgeSeconds !== null && oldestPendingAgeSeconds > 300)) ?
      "attention" : "healthy";
  return {
    pending: counts.pending, processing: counts.processing, blocked: counts.blocked,
    delivered: counts.delivered, staleProcessing: counts.staleProcessing,
    oldestPendingAgeSeconds, alert,
  };
}

/** One bounded run; no implicit looping, exponential retries, or license replay.
 * The scheduler is external and MUST be explicitly enabled by FM. Concurrent
 * triggers are safe at the individual license claim via the existing CAS.
 */
export async function runGovernedVendeLicenseWorker(
  config: PlanProjectionConfig,
  options: { limit?: number; http?: typeof fetch; now?: Date } = {},
) {
  assertVendeWorkerEnabled();
  assertScope(config.organizationId);
  const limit = options.limit ?? 10;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20)
    throw new AssistantPlanDeliveryUnavailable();
  const quarantined = await quarantineStaleVendeLicenseClaims(
    config.organizationId, options.now,
  );
  const drained = await drainVerifiedVendePaidLicenses(config, limit, options.http);
  const queue = await readVendeQueueHealth(config.organizationId, options.now);
  return { quarantined, ...drained, queue };
}
