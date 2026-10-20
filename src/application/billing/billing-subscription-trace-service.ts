import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";

/** Snapshot of the FMCC-owned subscription. Not a history of SaaS entitlement transitions. */
export interface SubscriptionTraceHeader {
  readonly subscriptionId: string;
  readonly productId: string;
  readonly customerId: string;
  readonly externalTenantId: string | null;
  readonly planCode: string;
  readonly status: string;
  readonly createdAt: Date;
}

export interface SubscriptionInvoiceTrace {
  readonly invoiceId: string;
  readonly invoiceStatus: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly createdAt: Date;
  readonly gatewayAccountId: string;
  readonly recordedPaymentStatus: string | null;
  readonly paymentRecordedAt: Date | null;
}

export interface SubscriptionTraceRepository {
  getSubscription(tenantId: string, subscriptionId: string): Promise<SubscriptionTraceHeader | null>;
  listInvoices(
    tenantId: string, subscriptionId: string, productId: string,
    customerId: string, limit: number,
  ): Promise<readonly SubscriptionInvoiceTrace[]>;
}

export class SubscriptionTraceNotFoundError extends Error {
  constructor() { super("billing.subscription_not_found"); }
}
export class SubscriptionTraceInputError extends Error {
  constructor() { super("billing.subscription_id_invalid"); }
}

export interface SubscriptionFinancialTrace {
  readonly authority: "fmcc_billing_invoice_and_provider_payment";
  readonly subscription: SubscriptionTraceHeader;
  readonly invoices: readonly SubscriptionInvoiceTrace[];
  readonly truncated: boolean;
  readonly limit: 50;
  /** Provider reconciliation, not a provider status stored locally, proves settlement. */
  readonly settlementConfirmedByThisView: false;
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export class BillingSubscriptionTraceService {
  constructor(private readonly repository: SubscriptionTraceRepository) {}

  async get(context: TenantContext, subscriptionId: string): Promise<SubscriptionFinancialTrace> {
    requirePermission(context, "billing:read");
    if (!context.tenantId.trim()) throw new SubscriptionTraceInputError();
    if (!UUID.test(subscriptionId)) throw new SubscriptionTraceInputError();

    // The tenant scope comes exclusively from the authenticated backend context.
    const subscription = await this.repository.getSubscription(context.tenantId, subscriptionId);
    if (!subscription || subscription.subscriptionId !== subscriptionId) {
      throw new SubscriptionTraceNotFoundError();
    }
    const rows = await this.repository.listInvoices(
      context.tenantId, subscriptionId, subscription.productId, subscription.customerId, 51,
    );
    return {
      authority: "fmcc_billing_invoice_and_provider_payment",
      subscription,
      invoices: rows.slice(0, 50),
      limit: 50,
      truncated: rows.length > 50,
      settlementConfirmedByThisView: false,
    };
  }
}
