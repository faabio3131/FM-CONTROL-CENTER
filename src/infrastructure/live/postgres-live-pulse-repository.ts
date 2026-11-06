import { desc, eq } from "drizzle-orm";
import type { LivePulseRepository } from "@/application/live/live-pulse-service";
import { db } from "@/infrastructure/db/client";
import { auditEvents } from "@/infrastructure/db/foundation-schema";
import { metricValues } from "@/infrastructure/db/platform-schema";

/** Leitura indexável, somente tenant canônico. Nenhuma migration nem trigger necessários. */
export class PostgresLivePulseRepository implements LivePulseRepository {
  async latestForTenant(tenantId: string, includeAudit: boolean) {
    const [metrics, audits] = await Promise.all([
      db.select({ at: metricValues.computedAt })
        .from(metricValues)
        .where(eq(metricValues.tenantId, tenantId))
        .orderBy(desc(metricValues.computedAt)).limit(1),
      includeAudit
        ? db.select({ at: auditEvents.occurredAt })
          .from(auditEvents).where(eq(auditEvents.tenantId, tenantId))
          .orderBy(desc(auditEvents.occurredAt)).limit(1)
        : Promise.resolve([]),
    ]);
    return {
      metricsLatest: metrics[0]?.at.getTime() ?? null,
      auditLatest: audits[0]?.at.getTime() ?? null,
    };
  }
}
