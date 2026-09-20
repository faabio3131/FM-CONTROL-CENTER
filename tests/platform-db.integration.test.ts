import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { canonicalFacts, metricValues, sourceDefinitions, syncExecutions } from "@/infrastructure/db/platform-schema";
import { PostgresSourceRepository, PostgresSyncRepository } from "@/infrastructure/integration/postgres-repositories";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";

const TENANTS = ["it-tenant-a", "it-tenant-b"];

afterEach(async () => {
  for (const tenantId of TENANTS) {
    await db.delete(metricValues).where(eq(metricValues.tenantId, tenantId));
    await db.delete(canonicalFacts).where(eq(canonicalFacts.tenantId, tenantId));
    await db.delete(syncExecutions).where(eq(syncExecutions.tenantId, tenantId));
    await db.delete(sourceDefinitions).where(eq(sourceDefinitions.tenantId, tenantId));
  }
});

describe("F07/F08 PostgreSQL tenant isolation", () => {
  it("Source Registry lista somente registros do tenant solicitado", async () => {
    const repository = new PostgresSourceRepository();
    await repository.create(TENANTS[0], { name: "A", sourceType: "fixture", authoritativeDomain: "billing", syncMode: "pull" });
    await repository.create(TENANTS[1], { name: "B", sourceType: "fixture", authoritativeDomain: "billing", syncMode: "pull" });

    const rows = await repository.list(TENANTS[0]);
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe(TENANTS[0]);
    expect(rows[0].name).toBe("A");
  });

  it("coordena idempotência concorrente e permite retry após falha", async () => {
    const sources = new PostgresSourceRepository();
    const syncs = new PostgresSyncRepository();
    const source = await sources.create(TENANTS[0], {
      name: "Idempotency", sourceType: "fixture", authoritativeDomain: "billing", syncMode: "pull",
    });
    const input = {
      tenantId: TENANTS[0], sourceId: source.id, idempotencyKey: "idem-db-1", correlationId: "corr-db-1",
    };

    const first = await syncs.begin(input);
    expect(first.state).toBe("started");

    const concurrent = await syncs.begin(input);
    expect(concurrent).toMatchObject({ id: first.id, state: "running" });

    await syncs.fail({ id: first.id, tenantId: TENANTS[0], errorCode: "transient", errorMessage: "retry" });
    const restarted = await syncs.begin({ ...input, correlationId: "corr-db-2" });
    expect(restarted).toMatchObject({ id: first.id, state: "restarted" });

    await syncs.complete({ id: first.id, tenantId: TENANTS[0], cursorAfter: "done" });
    const completed = await syncs.begin(input);
    expect(completed).toMatchObject({ id: first.id, state: "completed" });
  });

  it("Metric Store não retorna MetricValue de outro tenant", async () => {
    const store = new PostgresMetricStore();
    const now = new Date();
    await store.saveValue({
      tenantId: TENANTS[0], metricId: "trial.starts.count", metricVersion: 1, value: "3", unit: "count",
      computedAt: now, freshnessStatus: "unknown", qualityStatus: "verified", sourceAuthority: "fixture-a", provenanceRefs: [],
    });
    await store.saveValue({
      tenantId: TENANTS[1], metricId: "trial.starts.count", metricVersion: 1, value: "99", unit: "count",
      computedAt: new Date(now.getTime() + 1), freshnessStatus: "unknown", qualityStatus: "verified", sourceAuthority: "fixture-b", provenanceRefs: [],
    });

    const value = await store.latestValue(TENANTS[0], "trial.starts.count");
    expect(value?.value).toBe("3");
    expect(value?.sourceAuthority).toBe("fixture-a");

    const leaked = await db.select().from(metricValues).where(and(eq(metricValues.tenantId, TENANTS[0]), eq(metricValues.value, "99")));
    expect(leaked).toHaveLength(0);
  });
});
