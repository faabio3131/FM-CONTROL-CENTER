import { and, desc, eq } from "drizzle-orm";
import type {
  SubscriptionTraceHeader, SubscriptionInvoiceTrace, SubscriptionTraceRepository,
} from "@/application/billing/billing-subscription-trace-service";
import { db } from "@/infrastructure/db/client";
import {
  billingSubscriptions, billingCustomerBindings, billingInvoices, billingProviderPayments,
} from "@/infrastructure/db/billing-schema";

/**
 * Read from existing canonical FMCC tables only. Every join uses the tenant,
 * preventing accidental cross-tenant invoice/payment exposure.
 */
export class PostgresBillingSubscriptionTraceRepository implements SubscriptionTraceRepository {
  async getSubscription(tenantId: string, subscriptionId: string): Promise<SubscriptionTraceHeader | null> {
    if (!tenantId.trim()) throw new Error("billing.trace_tenant_required");
    const [row] = await db.select({
      subscriptionId: billingSubscriptions.id,
      productId: billingSubscriptions.productId,
      customerId: billingSubscriptions.customerId,
      externalTenantId: billingCustomerBindings.externalTenantId,
      planCode: billingSubscriptions.planCode,
      status: billingSubscriptions.status,
      createdAt: billingSubscriptions.createdAt,
    }).from(billingSubscriptions).leftJoin(billingCustomerBindings, and(
      eq(billingCustomerBindings.tenantId, billingSubscriptions.tenantId),
      eq(billingCustomerBindings.productId, billingSubscriptions.productId),
      eq(billingCustomerBindings.customerId, billingSubscriptions.customerId),
    )).where(and(
      eq(billingSubscriptions.tenantId, tenantId),
      eq(billingSubscriptions.id, subscriptionId),
    )).limit(1);
    return row ?? null;
  }

  async listInvoices(
    tenantId: string, subscriptionId: string, productId: string,
    customerId: string, limit: number,
  ): Promise<readonly SubscriptionInvoiceTrace[]> {
    if (!tenantId.trim() || !Number.isSafeInteger(limit) || limit < 1 || limit > 51) {
      throw new Error("billing.trace_query_invalid");
    }
    return db.select({
      invoiceId: billingInvoices.id,
      invoiceStatus: billingInvoices.status,
      amountMinor: billingInvoices.amountMinor,
      currency: billingInvoices.currency,
      createdAt: billingInvoices.createdAt,
      gatewayAccountId: billingInvoices.gatewayAccountId,
      recordedPaymentStatus: billingProviderPayments.status,
      paymentRecordedAt: billingProviderPayments.createdAt,
    }).from(billingInvoices).leftJoin(billingProviderPayments, and(
      eq(billingProviderPayments.tenantId, billingInvoices.tenantId),
      eq(billingProviderPayments.invoiceId, billingInvoices.id),
      eq(billingProviderPayments.gatewayAccountId, billingInvoices.gatewayAccountId),
    )).where(and(
      eq(billingInvoices.tenantId, tenantId),
      eq(billingInvoices.subscriptionId, subscriptionId),
      eq(billingInvoices.productId, productId),
      eq(billingInvoices.customerId, customerId),
    )).orderBy(desc(billingInvoices.createdAt), desc(billingInvoices.id)).limit(limit);
  }
}
