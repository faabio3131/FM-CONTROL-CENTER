import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { MetricFreshnessStatus, MetricQualityStatus, MetricStore, MetricView } from "@/application/metrics/metric-service";
import { db } from "@/infrastructure/db/client";
import { canonicalFacts, metricValues } from "@/infrastructure/db/platform-schema";

function normalizeFreshness(value: string): MetricFreshnessStatus {
  if (value === "fresh" || value === "delayed" || value === "stale" || value === "unavailable") return value;
  return "unknown";
}

function normalizeQuality(value: string): MetricQualityStatus {
  if (value === "verified" || value === "reconciled" || value === "partial" || value === "estimated" || value === "missing") return value;
  return "unknown";
}

export class PostgresMetricStore implements MetricStore {
  async factsForMetric(input: { tenantId: string; factType: string; periodStart?: Date; periodEnd?: Date }) {
    const clauses = [eq(canonicalFacts.tenantId, input.tenantId), eq(canonicalFacts.factType, input.factType)];
    if (input.periodStart) clauses.push(gte(canonicalFacts.sourceTimestamp, input.periodStart));
    if (input.periodEnd) clauses.push(lte(canonicalFacts.sourceTimestamp, input.periodEnd));
    const rows = await db.select().from(canonicalFacts).where(and(...clauses));
    return rows.map((row) => ({
      id: row.id, externalId: row.externalId, factType: row.factType, payload: row.payload,
      sourceTimestamp: row.sourceTimestamp, provenanceRef: row.id,
    }));
  }

  async saveValue(input: {
    tenantId: string; metricId: string; metricVersion: number; value: string | null; unit: string; currency?: string;
    periodStart?: Date; periodEnd?: Date; asOf?: Date; computedAt: Date; sourceTimestamp?: Date; freshnessStatus: MetricFreshnessStatus;
    qualityStatus: MetricQualityStatus; sourceAuthority: string; provenanceRefs: readonly string[];
  }) {
    await db.insert(metricValues).values({
      tenantId: input.tenantId, metricId: input.metricId, metricVersion: input.metricVersion, value: input.value,
      unit: input.unit, currency: input.currency, periodStart: input.periodStart, periodEnd: input.periodEnd, asOf: input.asOf,
      computedAt: input.computedAt, sourceTimestamp: input.sourceTimestamp, freshnessStatus: input.freshnessStatus,
      qualityStatus: input.qualityStatus, sourceAuthority: input.sourceAuthority, provenanceRefs: [...input.provenanceRefs],
    });
  }

  async latestValue(tenantId: string, metricId: string): Promise<MetricView | null> {
    const rows = await db.select().from(metricValues).where(and(eq(metricValues.tenantId, tenantId), eq(metricValues.metricId, metricId))).orderBy(desc(metricValues.computedAt)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      metricId: row.metricId, metricVersion: row.metricVersion, value: row.value, unit: row.unit,
      currency: row.currency ?? undefined, periodStart: row.periodStart ?? undefined, periodEnd: row.periodEnd ?? undefined,
      asOf: row.asOf ?? undefined, computedAt: row.computedAt, sourceTimestamp: row.sourceTimestamp ?? undefined,
      freshnessStatus: normalizeFreshness(row.freshnessStatus), qualityStatus: normalizeQuality(row.qualityStatus), sourceAuthority: row.sourceAuthority,
      provenanceRefs: row.provenanceRefs,
    };
  }
}
