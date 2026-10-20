import { desc, eq } from "drizzle-orm";
import type {
  BillingQueueInspectionRepository, GatewayEventQueueRecord, IronOutboxQueueRecord,
} from "@/application/billing/billing-queue-inspection-service";
import { db } from "@/infrastructure/db/client";
import { billingGatewayEvents, billingIronEntitlementOutbox } from "@/infrastructure/db/billing-schema";

/** Tenant-scoped snapshots using existing queue tables; no locks, claims or mutations. */
export class PostgresBillingQueueInspectionRepository implements BillingQueueInspectionRepository {
  async listGatewayEvents(tenantId: string, limit: number): Promise<readonly GatewayEventQueueRecord[]> {
    if (!tenantId.trim() || !Number.isSafeInteger(limit) || limit < 1 || limit > 41)
      throw new Error("billing.queue_query_invalid");
    return db.select({
      id: billingGatewayEvents.id,
      gatewayAccountId: billingGatewayEvents.gatewayAccountId,
      eventType: billingGatewayEvents.eventType,
      status: billingGatewayEvents.status,
      attempts: billingGatewayEvents.attempts,
      lastErrorCode: billingGatewayEvents.lastErrorCode,
      receivedAt: billingGatewayEvents.receivedAt,
      updatedAt: billingGatewayEvents.updatedAt,
    }).from(billingGatewayEvents)
      .where(eq(billingGatewayEvents.tenantId, tenantId))
      .orderBy(desc(billingGatewayEvents.updatedAt), desc(billingGatewayEvents.id))
      .limit(limit);
  }

  async listIronOutbox(tenantId: string, limit: number): Promise<readonly IronOutboxQueueRecord[]> {
    if (!tenantId.trim() || !Number.isSafeInteger(limit) || limit < 1 || limit > 41)
      throw new Error("billing.queue_query_invalid");
    return db.select({
      id: billingIronEntitlementOutbox.id,
      productId: billingIronEntitlementOutbox.productId,
      eventType: billingIronEntitlementOutbox.eventType,
      status: billingIronEntitlementOutbox.status,
      attempts: billingIronEntitlementOutbox.attempts,
      lastErrorCode: billingIronEntitlementOutbox.lastErrorCode,
      createdAt: billingIronEntitlementOutbox.createdAt,
      updatedAt: billingIronEntitlementOutbox.updatedAt,
    }).from(billingIronEntitlementOutbox)
      .where(eq(billingIronEntitlementOutbox.tenantId, tenantId))
      .orderBy(desc(billingIronEntitlementOutbox.updatedAt), desc(billingIronEntitlementOutbox.id))
      .limit(limit);
  }
}
