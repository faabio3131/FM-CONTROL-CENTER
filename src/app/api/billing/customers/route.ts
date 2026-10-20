import { headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  BillingCustomerBindingRegisterService,
} from "@/application/billing/billing-customer-binding-register-service";
import { ProductNotFoundError, ProductRegistryService } from "@/application/products/product-registry-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import {
  AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError, requirePermission,
} from "@/domain/security/tenant-context";
import {
  PostgresBillingCustomerBindingRegisterRepository,
} from "@/infrastructure/billing/postgres-billing-customer-binding-register-repository";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await resolveTenantContext(await headers());
    requirePermission(context, "billing:read");
    const productId = new URL(request.url).searchParams.get("productId")?.trim() || undefined;
    if (productId) {
      await new ProductRegistryService(new PostgresProductRepository()).get(context, productId);
    }
    const register = await new BillingCustomerBindingRegisterService(
      new PostgresBillingCustomerBindingRegisterRepository(),
    ).list(context, productId);
    return NextResponse.json(register, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof PermissionDeniedError || error instanceof TenantScopeRequiredError)
      return NextResponse.json({ error: "billing.customer_register_denied" }, { status: 403 });
    if (error instanceof ProductNotFoundError)
      return NextResponse.json({ error: "billing.product_not_found" }, { status: 404 });
    return NextResponse.json({ error: "billing.customer_register_unavailable" }, { status: 503 });
  }
}
