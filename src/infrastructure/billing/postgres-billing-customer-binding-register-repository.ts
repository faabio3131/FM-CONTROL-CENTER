import { and, desc, eq } from "drizzle-orm";
import type {
  BillingCustomerBindingRegisterRepository,
  BillingCustomerBindingRecord,
} from "@/application/billing/billing-customer-binding-register-service";
import { db } from "@/infrastructure/db/client";
import { billingCustomerBindings, billingCustomers } from "@/infrastructure/db/billing-schema";

/** Both sides of the join are tenant-fenced; no unbounded customer read. */
export class PostgresBillingCustomerBindingRegisterRepository
  implements BillingCustomerBindingRegisterRepository {
  async list(
    tenantId: string, productId: string | undefined, limit: number,
  ): Promise<readonly BillingCustomerBindingRecord[]> {
    if (!tenantId.trim() || !Number.isSafeInteger(limit) || limit < 1 || limit > 101)
      throw new Error("billing.customer_register_query_invalid");
    const conditions = [eq(billingCustomerBindings.tenantId, tenantId)];
    if (productId) conditions.push(eq(billingCustomerBindings.productId, productId));
    return db.select({
      customerId: billingCustomers.id,
      externalCustomerId: billingCustomers.externalCustomerId,
      productId: billingCustomerBindings.productId,
      externalTenantId: billingCustomerBindings.externalTenantId,
      createdAt: billingCustomerBindings.createdAt,
    }).from(billingCustomerBindings)
      .innerJoin(billingCustomers, and(
        eq(billingCustomers.tenantId, billingCustomerBindings.tenantId),
        eq(billingCustomers.id, billingCustomerBindings.customerId),
      ))
      .where(and(...conditions))
      .orderBy(desc(billingCustomerBindings.createdAt), desc(billingCustomerBindings.id))
      .limit(limit);
  }
}
