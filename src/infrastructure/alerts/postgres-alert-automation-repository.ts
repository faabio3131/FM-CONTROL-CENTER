import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { auditEvents } from "@/infrastructure/db/foundation-schema";
import { db } from "@/infrastructure/db/client";

export class PostgresAlertAutomationRepository {
  async listTenantIdsWithRules(): Promise<readonly string[]> {
    const rows = await db
      .selectDistinct({ tenantId: auditEvents.tenantId })
      .from(auditEvents)
      .where(eq(auditEvents.action, "alert.rule.created"));
    return rows.map((row) => row.tenantId);
  }

  async beginRun(input: {
    runId: string;
    correlationId: string;
  }): Promise<"started" | "duplicate"> {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`alert-automation:${input.runId}`}))`,
      );
      const existing = await tx
        .select({ id: auditEvents.id })
        .from(auditEvents)
        .where(and(
          eq(auditEvents.action, "alert.automation.started"),
          eq(auditEvents.resourceId, `run:${input.runId}`),
        ))
        .limit(1);
      if (existing[0]) return "duplicate";

      await tx.insert(auditEvents).values({
        tenantId: "system",
        actorId: "fmcc-alert-scheduler",
        actorType: "system",
        action: "alert.automation.started",
        resourceType: "alert_automation_run",
        resourceId: `run:${input.runId}`,
        result: "success",
        correlationId: input.correlationId,
        metadata: { runId: input.runId, startedAt: new Date().toISOString() },
      });
      return "started";
    });
  }

  async completeRun(input: {
    runId: string;
    correlationId: string;
    tenants: number;
    rulesEvaluated: number;
    occurrencesCreated: number;
    unavailable: number;
    clear: number;
    incompatible: number;
    failures: number;
  }): Promise<void> {
    await db.insert(auditEvents).values({
      tenantId: "system",
      actorId: "fmcc-alert-scheduler",
      actorType: "system",
      action: "alert.automation.completed",
      resourceType: "alert_automation_run",
      resourceId: `run:${input.runId}`,
      result: input.failures > 0 ? "failure" : "success",
      correlationId: input.correlationId,
      metadata: {
        runId: input.runId,
        tenants: input.tenants,
        rulesEvaluated: input.rulesEvaluated,
        occurrencesCreated: input.occurrencesCreated,
        unavailable: input.unavailable,
        clear: input.clear,
        incompatible: input.incompatible,
        failures: input.failures,
        completedAt: new Date().toISOString(),
      },
    });
  }

  newCorrelationId(): string {
    return `automation-${randomUUID()}`;
  }
}
