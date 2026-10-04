import { describe, expect, it } from "vitest";
import { ActivityFeedService } from "@/application/activity/activity-feed-service";
import type { ActivityRepository } from "@/domain/activity/contracts";
import {
  PermissionDeniedError,
  type TenantContext,
} from "@/domain/security/tenant-context";

const context: TenantContext = {
  tenantId: "tenant-a",
  userId: "user-a",
  role: "owner",
  correlationId: "corr-a",
};

function repository(calls: { tenantId?: string; limit?: number }): ActivityRepository {
  return {
    async recent(tenantId, limit) {
      calls.tenantId = tenantId;
      calls.limit = limit;
      return [
        {
          id: "activity-1",
          actorId: "actor-1",
          actorType: "user",
          action: "commercial.billing.command.forwarded",
          resourceType: "kordena_billing_control_plane",
          resourceId: "provider-1",
          result: "success",
          correlationId: "corr-activity-1",
          occurredAt: new Date("2026-10-03T20:00:00Z"),
        },
      ];
    },
  };
}

describe("R8 Activity Feed", () => {
  it("consulta somente o tenant autenticado e limita a janela", async () => {
    const calls: { tenantId?: string; limit?: number } = {};
    const feed = await new ActivityFeedService(repository(calls)).recent(
      context,
      250,
    );

    expect(calls).toEqual({ tenantId: "tenant-a", limit: 100 });
    expect(feed.items).toEqual([
      {
        id: "activity-1",
        actorId: "actor-1",
        actorType: "user",
        action: "commercial.billing.command.forwarded",
        resourceType: "kordena_billing_control_plane",
        resourceId: "provider-1",
        result: "success",
        correlationId: "corr-activity-1",
        occurredAt: "2026-10-03T20:00:00.000Z",
      },
    ]);
  });

  it("expõe apenas campos estruturais do Audit Ledger", async () => {
    const feed = await new ActivityFeedService(repository({})).recent(context);
    expect(feed.dataBoundary).toContain("Metadata bruto não é exposto");
    expect(JSON.stringify(feed.items)).not.toContain("metadata");
  });

  it("permite auditoria para analyst e bloqueia viewer/member", async () => {
    const service = new ActivityFeedService(repository({}));

    await expect(
      service.recent({ ...context, role: "analyst" }),
    ).resolves.toBeDefined();
    await expect(
      service.recent({ ...context, role: "viewer" }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(
      service.recent({ ...context, role: "member" }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
