import type {
  ActivityFeedOverview,
  ActivityRepository,
} from "@/domain/activity/contracts";
import {
  requirePermission,
  type TenantContext,
} from "@/domain/security/tenant-context";

export class ActivityFeedService {
  constructor(private readonly activities: ActivityRepository) {}

  async recent(
    context: TenantContext,
    limit = 20,
  ): Promise<ActivityFeedOverview> {
    requirePermission(context, "audit:read");
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const rows = await this.activities.recent(context.tenantId, safeLimit);

    return {
      items: rows.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorType: row.actorType,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        result: row.result,
        correlationId: row.correlationId,
        occurredAt: row.occurredAt.toISOString(),
      })),
      windowNote:
        `Últimos ${safeLimit} registros no máximo, em ordem decrescente de ocorrência.`,
      dataBoundary:
        "O Activity Feed projeta somente campos estruturais do Audit Ledger. Metadata bruto não é exposto nesta superfície.",
    };
  }
}
