import { eq, asc, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { billingGatewayAccounts } from "@/infrastructure/db/billing-central-schema";
import type { TenantContext } from "@/domain/security/tenant-context";
import { requirePermission } from "@/domain/security/tenant-context";
import type { GatewayConfiguration } from "@/domain/billing-central/gateway-configuration";
import { listTenantGatewayConfigurations } from "@/domain/billing-central/gateway-configuration";

/** Transaction-local RLS scope. Never use a process-global session setting or bypass role. */
export async function listGatewayAccountsForTenant(context: TenantContext) {
  requirePermission(context, "billing:read");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.billing_tenant_id', ${context.tenantId}, true)`);
    const records = await tx.select({
      id: billingGatewayAccounts.id,
      tenantId: billingGatewayAccounts.tenantId,
      providerCode: billingGatewayAccounts.providerCode,
      environment: billingGatewayAccounts.environment,
      credentialRef: billingGatewayAccounts.credentialRef,
      publicLabel: billingGatewayAccounts.publicLabel,
      status: billingGatewayAccounts.status,
    }).from(billingGatewayAccounts)
      .where(eq(billingGatewayAccounts.tenantId, context.tenantId))
      .orderBy(asc(billingGatewayAccounts.createdAt));
    // The DB columns are text for now: reject malformed states instead of claiming them valid.
    const configurations: GatewayConfiguration[] = records.map((row) => {
      if (row.environment !== "sandbox" && row.environment !== "production") {
        throw new Error("billing.invalid_persisted_environment");
      }
      if (row.status !== "disabled" && row.status !== "configured" && row.status !== "verified") {
        throw new Error("billing.invalid_persisted_status");
      }
      return {
        id: row.id, billingTenantId: row.tenantId, providerCode: row.providerCode,
        environment: row.environment, credentialRef: row.credentialRef,
        publicLabel: row.publicLabel, status: row.status,
      };
    });
    return listTenantGatewayConfigurations(context, configurations);
  });
}
