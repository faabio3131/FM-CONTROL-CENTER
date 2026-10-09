import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { verifyPasswordStepUp } from "@/application/security/password-step-up";
import { requirePermission } from "@/domain/security/tenant-context";
import { db, pool } from "@/infrastructure/db/client";
import { billingInvoices, billingGatewayAccounts, billingProviderPayments } from "@/infrastructure/db/billing-schema";
import { AsaasProductionPilot, PRODUCTION_PILOT_REFERENCE } from "@/infrastructure/billing/asaas-production-pilot";
import { ProductionPilotLedger } from "@/infrastructure/billing/production-pilot-ledger";

export const dynamic = "force-dynamic";
const INVOICE = "a51a5000-1990-4000-8000-000000000001";

/**
 * Explicit operator recovery for ambiguous provider POST. Provider lookups are
 * READ ONLY; never create payments on recovery. Fail closed on zero or >1.
 * Requires active owner/admin + password reauthentication.
 */
export async function POST(request: Request) {
 if (process.env.FMCC_PILOT_PIX_ISSUANCE_ENABLED !== "YES")
  return NextResponse.json({error:"billing.recovery_disabled"}, {status:503});
 try {
  const h = await headers();
  const ctx = await resolveTenantContext(h);
  requirePermission(ctx, "billing:write");
  if (ctx.role !== "owner" && ctx.role !== "admin")
   return NextResponse.json({error:"billing.admin_required"},{status:403});
  const body:unknown = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof (body as {password?:unknown}).password !== "string")
   return NextResponse.json({error:"billing.invalid_request"},{status:400});
  const proof = await verifyPasswordStepUp(h,(body as {password:string}).password);
  if(proof.userId !== ctx.userId)
   return NextResponse.json({error:"billing.step_up_required"},{status:403});
  const [row] = await db.select({
   invoiceId:billingInvoices.id, gatewayId:billingInvoices.gatewayAccountId,
   status:billingInvoices.status,amount:billingInvoices.amountMinor,
   currency:billingInvoices.currency,provider:billingGatewayAccounts.provider,
   environment:billingGatewayAccounts.environment,
  }).from(billingInvoices).innerJoin(billingGatewayAccounts,and(
   eq(billingGatewayAccounts.id,billingInvoices.gatewayAccountId),
   eq(billingGatewayAccounts.tenantId,billingInvoices.tenantId),
  )).where(and(eq(billingInvoices.tenantId,ctx.tenantId),eq(billingInvoices.id,INVOICE))).limit(1);
  if(!row||row.amount!==100||row.currency!=="BRL"||row.provider!=="asaas"||
     row.environment!=="production"||!["creating","payment_pending","paid"].includes(row.status))
   return NextResponse.json({error:"billing.recovery_scope_invalid"},{status:409});

  const previous = await db.select({id:billingProviderPayments.externalPaymentId})
   .from(billingProviderPayments).where(and(
    eq(billingProviderPayments.tenantId,ctx.tenantId),
    eq(billingProviderPayments.invoiceId,INVOICE),
    eq(billingProviderPayments.gatewayAccountId,row.gatewayId),
   )).limit(1);
  if(previous.length)
   return NextResponse.json({status:"already_recorded",paymentId:previous[0].id},
    {headers:{"Cache-Control":"no-store"}});

  // A missing local payment is recoverable ONLY if this invoice was claimed,
  // AND a single provider payment matches the immutable pilot reference.
  if(row.status!=="creating")
   return NextResponse.json({error:"billing.no_pending_provider_claim"},{status:409});

  const pilot = new AsaasProductionPilot(new ProductionPilotLedger(pool));
  const candidates = await pilot.findPilotPaymentsForRecovery();
  if(candidates.length!==1)
   return NextResponse.json({error:candidates.length===0?
    "billing.provider_payment_not_found_manual_review":"billing.provider_duplicates_manual_review"},{status:409});
  const candidate=candidates[0];
  const result=await pilot.recoverUncertainRealPix({
   tenantId:ctx.tenantId,invoiceId:INVOICE,gatewayAccountId:row.gatewayId,
   externalPaymentId:candidate.id,
  });
  return NextResponse.json({status:result,paymentId:candidate.id,reference:PRODUCTION_PILOT_REFERENCE},
   {headers:{"Cache-Control":"no-store"}});
 } catch {
  return NextResponse.json({error:"billing.recovery_failed_manual_review"},{status:409});
 }
}
