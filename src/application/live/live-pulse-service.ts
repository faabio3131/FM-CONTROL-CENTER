import { createHash } from "node:crypto";
import { roleHasPermission } from "@/domain/security/permissions";
import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";
import { pulseSource, type PulseParts } from "@/domain/live/pulse";

export interface LivePulseRepository {
  latestForTenant(tenantId: string, includeAudit: boolean): Promise<PulseParts>;
}
/** Só produz uma marca de mudança de fontes permitidas, sem valores, IDs ou datas. */
export class LivePulseService {
  constructor(private readonly repository: LivePulseRepository) {}
  async pulse(context: TenantContext): Promise<{ token: string }> {
    requirePermission(context, "metric:read");
    const includeAudit = roleHasPermission(context.role, "audit:read");
    const parts = await this.repository.latestForTenant(context.tenantId, includeAudit);
    const token = createHash("sha256")
      .update(`${context.tenantId}|${pulseSource(parts)}`)
      .digest("hex").slice(0, 24);
    return { token };
  }
}
