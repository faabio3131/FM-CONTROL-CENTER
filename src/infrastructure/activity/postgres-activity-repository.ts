import { desc, eq } from "drizzle-orm";
import type {
  ActivityRecord,
  ActivityRepository,
} from "@/domain/activity/contracts";
import { db } from "@/infrastructure/db/client";
import { auditEvents } from "@/infrastructure/db/foundation-schema";

export class PostgresActivityRepository implements ActivityRepository {
  async recent(
    tenantId: string,
    limit: number,
  ): Promise<readonly ActivityRecord[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    return db
      .select({
        id: auditEvents.id,
        actorId: auditEvents.actorId,
        actorType: auditEvents.actorType,
        action: auditEvents.action,
        resourceType: auditEvents.resourceType,
        resourceId: auditEvents.resourceId,
        result: auditEvents.result,
        correlationId: auditEvents.correlationId,
        occurredAt: auditEvents.occurredAt,
      })
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, tenantId))
      .orderBy(desc(auditEvents.occurredAt))
      .limit(safeLimit);
  }
}
