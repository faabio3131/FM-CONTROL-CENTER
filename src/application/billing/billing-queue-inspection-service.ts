import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";

/** This is a bounded operational sample, NEVER a complete financial ledger or proof of settlement. */
export interface GatewayEventQueueRecord {
  readonly id: string;
  readonly gatewayAccountId: string;
  readonly eventType: string | null;
  readonly status: string;
  readonly attempts: number;
  readonly lastErrorCode: string | null;
  readonly receivedAt: Date;
  readonly updatedAt: Date;
}
export interface IronOutboxQueueRecord {
  readonly id: string;
  readonly productId: string;
  readonly eventType: string;
  readonly status: string;
  readonly attempts: number;
  readonly lastErrorCode: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
export interface BillingQueueInspectionRepository {
  listGatewayEvents(tenantId: string, limit: number): Promise<readonly GatewayEventQueueRecord[]>;
  listIronOutbox(tenantId: string, limit: number): Promise<readonly IronOutboxQueueRecord[]>;
}
export interface BillingQueueOverview {
  readonly sourceAuthority: "fmcc_billing_queue_records";
  readonly pageLimit: 40;
  readonly events: readonly GatewayEventQueueRecord[];
  readonly eventsTruncated: boolean;
  readonly outbox: readonly IronOutboxQueueRecord[];
  readonly outboxTruncated: boolean;
  readonly figuresAreFullQueueTotals: false;
  readonly anyProviderSettlementVerified: false;
}

export class BillingQueueInspectionService {
  constructor(private readonly repository: BillingQueueInspectionRepository) {}
  async overview(context: TenantContext): Promise<BillingQueueOverview> {
    requirePermission(context, "billing:read");
    if (!context.tenantId.trim()) throw new Error("billing.tenant_scope_missing");

    const [events, outbox] = await Promise.all([
      this.repository.listGatewayEvents(context.tenantId, 41),
      this.repository.listIronOutbox(context.tenantId, 41),
    ]);
    return {
      sourceAuthority: "fmcc_billing_queue_records",
      pageLimit: 40,
      events: events.slice(0, 40),
      eventsTruncated: events.length > 40,
      outbox: outbox.slice(0, 40),
      outboxTruncated: outbox.length > 40,
      figuresAreFullQueueTotals: false,
      anyProviderSettlementVerified: false,
    };
  }
}
