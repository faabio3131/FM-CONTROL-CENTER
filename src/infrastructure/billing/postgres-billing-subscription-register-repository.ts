import { and, desc, eq } from "drizzle-orm";
import type {
  BillingSubscriptionRegisterRepository,
  BillingSubscriptionRecord,
} from "@/application/billing/billing-subscription-register-service";
import { db } from "@/infrastructure/db/client";
import { billingCustomerBindings, billingSubscriptions } from "@/infrastructure/db/billing-schema";

/** Tenant-first bounded read-model. No pricing or entitlement authority is inferred. */
export class PostgresBillingSubscriptionRegisterRepository
  implements BillingSubscriptionRegisterRepository {
  async list(
    tenantId: string, productId: string | undefined, limit: number,
  ): Promise<readonly BillingSubscriptionRecord[]> {
    if (!tenantId.trim() || !Number.isSafeInteger(limit) || limit < 1 || limit > 101)
      throw new Error("billing.register_query_invalid");

    const conditions = [eq(billingSubscriptions.tenantId, tenantId)];
    if (productId) conditions.push(eq(billingSubscriptions.productId, productId));

    const rows = await db.select({
      subscriptionId: billingSubscriptions.id,
      productId: billingSubscriptions.productId,
      customerId: billingSubscriptions.customerId,
      externalTenantId: billingCustomerBindings.externalTenantId,
      planCode: billingSubscriptions.planCode,
      status: billingSubscriptions.status,
      createdAt: billingSubscriptions.createdAt,
    }).from(billingSubscriptions)
      .leftJoin(billingCustomerBindings, and(
        eq(billingCustomerBindings.tenantId, billingSubscriptions.tenantId),
        eq(billingCustomerBindings.productId, billingSubscriptions.productId),
        eq(billingCustomerBindings.customerId, billingSubscriptions.customerId),
      ))
      .where(and(...conditions))
      .orderBy(desc(billingSubscriptions.createdAt), desc(billingSubscriptions.id))
      .limit(limit);
    return rows;
  }
}
