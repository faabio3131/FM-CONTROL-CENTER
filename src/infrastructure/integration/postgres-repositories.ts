import { and, eq } from "drizzle-orm";
import type { CanonicalFactRepository, SourceDefinition, SourceRepository, SyncRepository } from "@/domain/integration/contracts";
import { db } from "@/infrastructure/db/client";
import { canonicalFacts, sourceDefinitions, syncExecutions } from "@/infrastructure/db/platform-schema";

export class PostgresSourceRepository implements SourceRepository {
  async findById(tenantId: string, sourceId: string): Promise<SourceDefinition | null> {
    const rows = await db.select().from(sourceDefinitions).where(and(eq(sourceDefinitions.tenantId, tenantId), eq(sourceDefinitions.id, sourceId))).limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id, tenantId: row.tenantId, name: row.name, sourceType: row.sourceType,
      authoritativeDomain: row.authoritativeDomain, syncMode: row.syncMode as SourceDefinition["syncMode"],
      secretRef: row.secretRef ?? undefined, mappingVersion: row.mappingVersion,
    };
  }
}

export class PostgresSyncRepository implements SyncRepository {
  async findCompletedByIdempotencyKey(tenantId: string, idempotencyKey: string) {
    const rows = await db.select({ id: syncExecutions.id }).from(syncExecutions).where(and(
      eq(syncExecutions.tenantId, tenantId), eq(syncExecutions.idempotencyKey, idempotencyKey), eq(syncExecutions.status, "completed")
    )).limit(1);
    return rows[0] ?? null;
  }
  async start(input: { tenantId: string; sourceId: string; idempotencyKey: string; correlationId: string; cursorBefore?: string }) {
    const rows = await db.insert(syncExecutions).values({
      tenantId: input.tenantId, sourceId: input.sourceId, idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId, cursorBefore: input.cursorBefore, status: "running",
    }).returning({ id: syncExecutions.id });
    return rows[0].id;
  }
  async complete(input: { id: string; tenantId: string; cursorAfter?: string }) {
    await db.update(syncExecutions).set({ status: "completed", cursorAfter: input.cursorAfter, completedAt: new Date() }).where(and(
      eq(syncExecutions.id, input.id), eq(syncExecutions.tenantId, input.tenantId)
    ));
  }
  async fail(input: { id: string; tenantId: string; errorCode: string; errorMessage: string }) {
    await db.update(syncExecutions).set({
      status: "failed", errorCode: input.errorCode, errorMessage: input.errorMessage.slice(0, 500), completedAt: new Date(),
    }).where(and(eq(syncExecutions.id, input.id), eq(syncExecutions.tenantId, input.tenantId)));
  }
}

export class PostgresCanonicalFactRepository implements CanonicalFactRepository {
  async ingest(input: { tenantId: string; sourceId: string; mappingVersion: string; fact: { externalId: string; factType: string; payload: Record<string, unknown>; sourceTimestamp: Date }; correlationId: string }) {
    await db.insert(canonicalFacts).values({
      tenantId: input.tenantId, sourceId: input.sourceId, externalId: input.fact.externalId,
      factType: input.fact.factType, payload: input.fact.payload, mappingVersion: input.mappingVersion,
      sourceTimestamp: input.fact.sourceTimestamp, provenance: { correlationId: input.correlationId },
    }).onConflictDoNothing();
  }
}
