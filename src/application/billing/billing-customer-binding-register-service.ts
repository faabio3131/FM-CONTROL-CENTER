import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";

/** Canonical FMCC billing linkage; does not infer SaaS subscription or revenue. */
export interface BillingCustomerBindingRecord {
  readonly customerId: string;
  readonly externalCustomerId: string;
  readonly productId: string;
  readonly externalTenantId: string;
  readonly createdAt: Date;
}

export interface BillingCustomerBindingRegisterRepository {
  list(tenantId: string, productId: string | undefined, limit: number):
    Promise<readonly BillingCustomerBindingRecord[]>;
}

export interface BillingCustomerBindingRegister {
  readonly authority: "fmcc_billing_customer_binding";
  readonly items: readonly BillingCustomerBindingRecord[];
  readonly limit: 100;
  readonly truncated: boolean;
}

export class BillingCustomerBindingRegisterService {
  constructor(private readonly repository: BillingCustomerBindingRegisterRepository) {}

  async list(context: TenantContext, productId?: string): Promise<BillingCustomerBindingRegister> {
    requirePermission(context, "billing:read");
    if (!context.tenantId.trim()) throw new Error("billing.tenant_scope_missing");
    const rows = await this.repository.list(context.tenantId, productId, 101);
    return {
      authority: "fmcc_billing_customer_binding",
      items: rows.slice(0, 100),
      limit: 100,
      truncated: rows.length > 100,
    };
  }
}
