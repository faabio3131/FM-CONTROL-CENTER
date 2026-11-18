import { and, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { canonicalFacts, metricValues } from "@/infrastructure/db/platform-schema";
import { projectIronTrialStarts } from "@/domain/metrics/iron-trial-starts";

const METRIC_ID = "trial.starts.count";
const AUTHORITY = "IRON_CANONICAL_TRIAL";

export class IronTrialStartsMaterializer {
  async materialize(input: {
    tenantId: string;
    productId: string;
    sourceId: string;
    mappingVersion: string;
  }) {
    if (!input.tenantId || !input.productId || !input.sourceId ||
        input.mappingVersion !== "iron-commercial-v1") {
      throw new Error("metrics.iron_trial_source_not_authorized");
    }
    const rows = await db.select({
      id: canonicalFacts.id,
      externalId: canonicalFacts.externalId,
      payload: canonicalFacts.payload,
      sourceTimestamp: canonicalFacts.sourceTimestamp,
    }).from(canonicalFacts).where(and(
      eq(canonicalFacts.tenantId, input.tenantId),
      eq(canonicalFacts.productId, input.productId),
      eq(canonicalFacts.sourceId, input.sourceId),
      eq(canonicalFacts.mappingVersion, input.mappingVersion),
      eq(canonicalFacts.factType, "iron.trial"),
    )).limit(100_001);

    // Absence of trusted observed trial events is UNKNOWN, not zero.
    const asOf = new Date();
    const months = projectIronTrialStarts(rows, asOf);
    for (const month of months) {
      const lockKey = [input.tenantId, input.productId, METRIC_ID, month.periodStart.toISOString()].join(":");
      await db.transaction(async tx => {
        // Transaction-scoped Postgres advisory lock serializes competing
        // instances without a new billing authority or duplicate metric rows.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
        const existing = await tx.select({ id: metricValues.id })
          .from(metricValues).where(and(
            eq(metricValues.tenantId, input.tenantId),
            eq(metricValues.productId, input.productId),
            eq(metricValues.metricId, METRIC_ID),
            eq(metricValues.metricVersion, 1),
            eq(metricValues.sourceAuthority, AUTHORITY),
            eq(metricValues.periodStart, month.periodStart),
            eq(metricValues.periodEnd, month.periodEnd),
          )).limit(2);
        if (existing.length > 1) {
          throw new Error("metrics.iron_trial_duplicate_materialization");
        }
        const values = {
          value: String(month.count), unit: "count", computedAt: asOf,
          asOf, sourceTimestamp: month.sourceTimestamp,
          freshnessStatus: "unknown", qualityStatus: "reconciled",
          provenanceRefs: [...month.provenanceRefs],
        };
        if (existing[0]) {
          await tx.update(metricValues).set(values).where(and(
            eq(metricValues.id, existing[0].id),
            eq(metricValues.tenantId, input.tenantId),
            eq(metricValues.productId, input.productId),
          ));
        } else {
          await tx.insert(metricValues).values({
            tenantId: input.tenantId, productId: input.productId,
            metricId: METRIC_ID, metricVersion: 1,
            periodStart: month.periodStart, periodEnd: month.periodEnd,
            sourceAuthority: AUTHORITY, currency: null, ...values,
          });
        }
      });
    }
    return { materializedMonths: months.length };
  }
}
