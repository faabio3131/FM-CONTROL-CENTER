import { and, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { billingGatewayAccounts, billingProductRoutes } from "@/infrastructure/db/billing-schema";
import { auditEvents } from "@/infrastructure/db/foundation-schema";
import { productDefinitions } from "@/infrastructure/db/platform-schema";
import { FMCC_IRON_PRODUCT_SLUG } from "@/domain/billing/iron-product-identity";
import type { TenantContext } from "@/domain/security/tenant-context";

/**
 * The FM receiving account for IRON is the platform Cakto seller (CPF today).
 * Its OAuth READ credentials, checkout catalog and webhook secret live only in
 * the runtime environment; this row records the governed route, never a secret.
 */
export const IRON_CAKTO_GATEWAY_LABEL = "iron-cakto-platform";
export const IRON_CAKTO_GATEWAY_SECRET_REF = "env://FMCC_CAKTO_READ_CLIENT_SECRET";

export type IronCaktoRouteState = "cakto_enabled" | "other_route" | "missing";

export async function readIronCaktoRoute(tenantId: string, productId: string): Promise<IronCaktoRouteState> {
  const [route] = await db.select({
    provider: billingGatewayAccounts.provider,
    environment: billingGatewayAccounts.environment,
    accountStatus: billingGatewayAccounts.status,
    routeStatus: billingProductRoutes.status,
  }).from(billingProductRoutes).innerJoin(billingGatewayAccounts, and(
    eq(billingGatewayAccounts.tenantId, billingProductRoutes.tenantId),
    eq(billingGatewayAccounts.id, billingProductRoutes.gatewayAccountId),
  )).where(and(eq(billingProductRoutes.tenantId, tenantId), eq(billingProductRoutes.productId, productId))).limit(1);
  if (!route) return "missing";
  return route.provider === "cakto" && route.environment === "production" &&
    route.accountStatus === "enabled" && route.routeStatus === "enabled" ? "cakto_enabled" : "other_route";
}

/**
 * Idempotent: creates (or reuses) the single enabled Cakto production account of
 * the FM tenant and routes the IRON product to it. Refuses to re-route a product
 * that already uses another provider, and refuses a disabled/revoked Cakto row.
 */
export async function configureIronCaktoRoute(context: TenantContext, productId: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"fmcc.billing.iron-cakto-route:" + context.tenantId}, 0))`);
    const [product] = await tx.select({ id: productDefinitions.id, slug: productDefinitions.slug })
      .from(productDefinitions).where(and(eq(productDefinitions.tenantId, context.tenantId),
        eq(productDefinitions.id, productId), eq(productDefinitions.status, "active"))).limit(1);
    if (!product || product.slug !== FMCC_IRON_PRODUCT_SLUG) throw new Error("billing.iron_cakto_scope_denied");

    const caktoRows = await tx.select().from(billingGatewayAccounts).where(and(
      eq(billingGatewayAccounts.tenantId, context.tenantId), eq(billingGatewayAccounts.provider, "cakto"),
      eq(billingGatewayAccounts.environment, "production"))).for("update");
    if (caktoRows.length > 1) throw new Error("billing.iron_cakto_account_ambiguous");
    let gateway = caktoRows[0];
    let accountCreated = false;
    if (!gateway) {
      [gateway] = await tx.insert(billingGatewayAccounts).values({
        tenantId: context.tenantId, provider: "cakto", environment: "production",
        label: IRON_CAKTO_GATEWAY_LABEL, secretRef: IRON_CAKTO_GATEWAY_SECRET_REF, status: "enabled",
      }).returning();
      accountCreated = true;
    }
    if (gateway.status !== "enabled") throw new Error("billing.iron_cakto_account_not_enabled");

    const [route] = await tx.select({ gatewayAccountId: billingProductRoutes.gatewayAccountId, status: billingProductRoutes.status })
      .from(billingProductRoutes).where(and(eq(billingProductRoutes.tenantId, context.tenantId),
        eq(billingProductRoutes.productId, productId))).for("update").limit(1);
    if (route && route.gatewayAccountId !== gateway.id) throw new Error("billing.iron_cakto_route_conflict");
    const routeChanged = !route || route.status !== "enabled";
    if (!route) {
      await tx.insert(billingProductRoutes).values({ tenantId: context.tenantId, productId,
        gatewayAccountId: gateway.id, status: "enabled", updatedAt: new Date() });
    } else if (route.status !== "enabled") {
      await tx.update(billingProductRoutes).set({ status: "enabled", updatedAt: new Date() })
        .where(and(eq(billingProductRoutes.tenantId, context.tenantId), eq(billingProductRoutes.productId, productId)));
    }
    await tx.insert(auditEvents).values({ tenantId: context.tenantId, actorId: context.userId, actorType: "user",
      action: "billing.iron_cakto_route.configure", resourceType: "billing_product_route", resourceId: productId,
      result: "success", correlationId: context.correlationId,
      metadata: { provider: "cakto", environment: "production", accountCreated, routeChanged } });
    return { provider: "cakto" as const, environment: "production" as const, status: "enabled" as const,
      accountCreated, routeChanged, paymentExecuted: false as const };
  });
}
