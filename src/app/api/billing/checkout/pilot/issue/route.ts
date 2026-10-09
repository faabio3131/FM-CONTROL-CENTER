import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { verifyPasswordStepUp } from "@/application/security/password-step-up";
import { requirePermission } from "@/domain/security/tenant-context";
import { db, pool } from "@/infrastructure/db/client";
import { billingCustomers, billingInvoices, billingGatewayAccounts, billingProviderPayments } from "@/infrastructure/db/billing-schema";
import { AsaasCheckoutClient } from "@/infrastructure/billing/asaas-checkout-client";
import { AsaasProductionPilot } from "@/infrastructure/billing/asaas-production-pilot";
import { ProductionPilotLedger } from "@/infrastructure/billing/production-pilot-ledger";

export const dynamic = "force-dynamic";
const INVOICE = "a51a5000-1990-4000-8000-000000000001";
const enabled = () => process.env.FMCC_PILOT_PIX_ISSUANCE_ENABLED === "YES";

/** Explicit administrator-only production pilot. Never enable without approval and certification. */
export async function POST(request: Request) {
  if (!enabled()) return NextResponse.json({ error: "billing.pilot_issuance_disabled" }, { status: 503 });
  try {
    const requestHeaders = await headers();
    const ctx = await resolveTenantContext(requestHeaders);
    requirePermission(ctx, "billing:write");
    if (ctx.role !== "owner" && ctx.role !== "admin")
      return NextResponse.json({ error: "billing.admin_required" }, { status: 403 });

    const data: unknown = await request.json();
    if (!data || typeof data !== "object" || Array.isArray(data))
      return NextResponse.json({ error: "billing.request_invalid" }, { status: 400 });
    const body = data as Record<string, unknown>;
    if (typeof body.password !== "string" || typeof body.name !== "string" ||
        typeof body.cpfCnpj !== "string" || typeof body.authorization !== "string" ||
        body.authorization !== "AUTHORIZE_REAL_PIX_BRL_1_00")
      return NextResponse.json({ error: "billing.request_invalid" }, { status: 400 });

    const proof = await verifyPasswordStepUp(requestHeaders, body.password);
    if (proof.userId !== ctx.userId) return NextResponse.json({ error: "billing.step_up_required" }, { status: 403 });

    const [invoice] = await db.select({
      id: billingInvoices.id, tenantId: billingInvoices.tenantId, customerId: billingInvoices.customerId,
      gatewayId: billingInvoices.gatewayAccountId, amount: billingInvoices.amountMinor,
      currency: billingInvoices.currency, status: billingInvoices.status,
      provider: billingGatewayAccounts.provider, environment: billingGatewayAccounts.environment,
      gatewayStatus: billingGatewayAccounts.status,
    }).from(billingInvoices).innerJoin(billingGatewayAccounts, and(
      eq(billingGatewayAccounts.id, billingInvoices.gatewayAccountId),
      eq(billingGatewayAccounts.tenantId, billingInvoices.tenantId),
    )).where(and(eq(billingInvoices.id, INVOICE),eq(billingInvoices.tenantId,ctx.tenantId))).limit(1);
    if (!invoice || invoice.status !== "pending" || invoice.amount !== 100 || invoice.currency !== "BRL" ||
      invoice.provider !== "asaas" || invoice.environment !== "production" || invoice.gatewayStatus !== "enabled")
      return NextResponse.json({ error: "billing.pilot_not_ready" }, { status: 409 });

    const previous = await db.select({ id: billingProviderPayments.id }).from(billingProviderPayments)
      .where(and(eq(billingProviderPayments.tenantId,ctx.tenantId),eq(billingProviderPayments.invoiceId,INVOICE))).limit(1);
    if (previous.length) return NextResponse.json({ error: "billing.payment_already_exists" }, { status: 409 });

    const [customer] = await db.select({ id: billingCustomers.id, externalId: billingCustomers.externalCustomerId })
      .from(billingCustomers).where(and(eq(billingCustomers.id,invoice.customerId),eq(billingCustomers.tenantId,ctx.tenantId))).limit(1);
    if (!customer) return NextResponse.json({ error: "billing.customer_missing" }, { status: 409 });

    const provider = new AsaasCheckoutClient();
    const reference = "fmcc-buyer-" + customer.id;
    let externalId = customer.externalId;
    if (!/^cus_[A-Za-z0-9_-]+$/.test(externalId)) {
      externalId = await provider.ensureCustomer({
        reference, name: body.name,
        cpfCnpj: body.cpfCnpj.replace(/\D/g,""),
        ...(typeof body.email === "string" ? { email: body.email } : {}),
      });
      const result = await db.update(billingCustomers).set({externalCustomerId: externalId})
        .where(and(eq(billingCustomers.id,customer.id),eq(billingCustomers.tenantId,ctx.tenantId),
          eq(billingCustomers.externalCustomerId,customer.externalId))).returning({ id:billingCustomers.id });
      if (!result.length) return NextResponse.json({ error: "billing.customer_concurrent_change" }, { status: 409 });
    }
    const pilot = new AsaasProductionPilot(new ProductionPilotLedger(pool));
    const dueDate = new Date().toISOString().slice(0,10);
    const created = await pilot.createOneRealPix({
      customerId: externalId, dueDate, authorization: body.authorization,
      tenantId:ctx.tenantId,invoiceId:INVOICE,gatewayAccountId:invoice.gatewayId,
    });
    // Pix QR retrieval is read-only. Failure here never justifies a new payment POST.
    let pix: Awaited<ReturnType<AsaasCheckoutClient["pixCode"]>> | null = null;
    try { pix = await provider.pixCode(created.id); } catch { /* GET-only recovery via payment ID */ }
    return NextResponse.json({ invoiceId:INVOICE, paymentId:created.id, invoiceUrl:created.invoiceUrl,
      pix, status:"payment_pending" }, { headers: { "Cache-Control":"no-store" } });
  } catch {
    // Never reveal provider/secret details, and never retry an uncertain POST automatically.
    return NextResponse.json({ error:"billing.issuance_failed_or_uncertain_reconcile_before_retry" }, {status:409});
  }
}
