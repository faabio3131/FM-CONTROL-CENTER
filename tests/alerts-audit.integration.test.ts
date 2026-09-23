import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { PostgresAlertRepository } from "@/infrastructure/alerts/postgres-alert-repository";
import { db } from "@/infrastructure/db/client";
import { auditEvents } from "@/infrastructure/db/foundation-schema";

const TENANT = "alert-idempotency-it";

afterEach(async () => {
  await db.delete(auditEvents).where(eq(auditEvents.tenantId, TENANT));
});

describe("F17 alert audit repository", () => {
  it("serializa ocorrência concorrente por fingerprint sem duplicar side effect", async () => {
    const repository = new PostgresAlertRepository();
    const occurrence = {
      id: "occurrence-1",
      tenantId: TENANT,
      ruleId: "rule-1",
      metricId: "incident.count",
      observedValue: "12",
      threshold: "10",
      operator: "gte" as const,
      severity: "warning" as const,
      evidenceRefs: ["fact-1"],
      fingerprint: "fingerprint-concurrent-1",
      occurredAt: new Date("2026-09-23T00:00:00Z"),
      status: "active" as const,
    };

    const [a, b] = await Promise.all([
      repository.recordOccurrence(occurrence),
      repository.recordOccurrence(occurrence),
    ]);

    expect([a.created, b.created].sort()).toEqual([false, true]);
    const rows = await db.select().from(auditEvents).where(and(
      eq(auditEvents.tenantId, TENANT),
      eq(auditEvents.action, "alert.raised"),
    ));
    expect(rows).toHaveLength(1);
  });

  it("desativa regra de forma auditável e idempotente", async () => {
    const repository = new PostgresAlertRepository();
    await repository.createRule({
      id: "rule-disable",
      tenantId: TENANT,
      metricId: "trial.starts.count",
      operator: "gt",
      threshold: "10",
      severity: "warning",
      enabled: true,
      createdBy: "user-a",
      createdAt: new Date(),
      idempotencyKey: "rule-disable-12345",
    });

    expect(await repository.disableRule(TENANT, "rule-disable", "user-a", "corr-disable-a")).toBe(true);
    expect(await repository.disableRule(TENANT, "rule-disable", "user-a", "corr-disable-b")).toBe(true);

    const rules = await repository.listRules(TENANT);
    expect(rules.find((item) => item.id === "rule-disable")?.enabled).toBe(false);

    const rows = await db.select().from(auditEvents).where(and(
      eq(auditEvents.tenantId, TENANT),
      eq(auditEvents.action, "alert.rule.disabled"),
    ));
    expect(rows).toHaveLength(1);
  });

  it("torna acknowledgement idempotente", async () => {
    const repository = new PostgresAlertRepository();
    await repository.recordOccurrence({
      id: "occurrence-ack",
      tenantId: TENANT,
      ruleId: "rule-ack",
      metricId: "incident.count",
      observedValue: "15",
      threshold: "10",
      operator: "gt",
      severity: "critical",
      evidenceRefs: ["fact-ack"],
      fingerprint: "fingerprint-ack",
      occurredAt: new Date(),
      status: "active",
    });

    await Promise.all([
      repository.acknowledge(TENANT, "occurrence-ack", "user-a", "corr-a"),
      repository.acknowledge(TENANT, "occurrence-ack", "user-a", "corr-b"),
    ]);

    const rows = await db.select().from(auditEvents).where(and(
      eq(auditEvents.tenantId, TENANT),
      eq(auditEvents.action, "alert.acknowledged"),
    ));
    expect(rows).toHaveLength(1);
    const occurrences = await repository.listOccurrences(TENANT);
    expect(occurrences[0]?.status).toBe("acknowledged");
  });
});
