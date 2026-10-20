import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";

/** C02 — FMCC-owned subscription records, not a proxy for SaaS subscriptions. */
export interface BillingSubscriptionRecord {
  readonly subscriptionId: string;
  readonly productId: string;
  readonly customerId: string;
  readonly externalTenantId: string | null;
  readonly planCode: string;
  readonly status: string;
  readonly createdAt: Date;
}

export interface BillingSubscriptionRegister {
  readonly items: readonly BillingSubscriptionRecord[];
  readonly truncated: boolean;
  readonly limit: number;
  readonly authority: "fmcc_billing_subscription";
}

export interface BillingSubscriptionRegisterRepository {
  list(tenantId: string, productId: string | undefined, limit: number):
    Promise<readonly BillingSubscriptionRecord[]>;
}

const MAX_PAGE_SIZE = 100;

export class BillingSubscriptionRegisterService {
  constructor(private readonly repository: BillingSubscriptionRegisterRepository) {}

  async list(context: TenantContext, productId?: string): Promise<BillingSubscriptionRegister> {
    requirePermission(context, "billing:read");
    // The tenant MUST come from the signed identity, never from request parameters.
    if (!context.tenantId.trim()) throw new Error("billing.tenant_scope_missing");
    const rows = await this.repository.list(context.tenantId, productId, MAX_PAGE_SIZE + 1);
    return {
      items: rows.slice(0, MAX_PAGE_SIZE),
      truncated: rows.length > MAX_PAGE_SIZE,
      limit: MAX_PAGE_SIZE,
      authority: "fmcc_billing_subscription",
    };
  }
}
