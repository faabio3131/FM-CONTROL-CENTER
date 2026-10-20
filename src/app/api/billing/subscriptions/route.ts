import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { BillingSubscriptionRegisterService } from "@/application/billing/billing-subscription-register-service";
import { ProductNotFoundError, ProductRegistryService } from "@/application/products/product-registry-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import {
  AuthenticationRequiredError, PermissionDeniedError,
  TenantScopeRequiredError, requirePermission,
} from "@/domain/security/tenant-context";
import { PostgresBillingSubscriptionRegisterRepository } from "@/infrastructure/billing/postgres-billing-subscription-register-repository";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";

export const dynamic = "force-dynamic";

/** Read only. Does not activate subscriptions, calculate MRR or expose credentials. */
export async function GET(request: Request) {
  try {
    const context = await resolveTenantContext(await headers());
    requirePermission(context, "billing:read");
    const productId = new URL(request.url).searchParams.get("productId")?.trim() || undefined;
    if (productId) {
      // Reject a product ID belonging to any other tenant, rather than relying
      // solely on a zero-row result from a tenant-filtered SQL query.
      await new ProductRegistryService(new PostgresProductRepository()).get(context, productId);
    }
    const result = await new BillingSubscriptionRegisterService(
      new PostgresBillingSubscriptionRegisterRepository(),
    ).list(context, productId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof TenantScopeRequiredError || error instanceof PermissionDeniedError)
      return NextResponse.json({ error: "billing.subscription_read_denied" }, { status: 403 });
    if (error instanceof ProductNotFoundError)
      return NextResponse.json({ error: "billing.product_not_found" }, { status: 404 });
    return NextResponse.json({ error: "billing.subscription_register_unavailable" }, { status: 503 });
  }
}
