/** Canonical billing confirmation → durable governed Assistant license binding.
 * Never issue license based on a webhook body, an unpaid invoice, or a
 * customer-supplied tenant ID. Network delivery occurs after the DB commit.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import {
  billingCustomerBindings, billingGatewayAccounts, billingInvoices,
  billingProviderPayments, billingSubscriptions, billingVendeLicenseOutbox,
} from "@/infrastructure/db/billing-schema";
import { assistantPlanRevisions } from "@/infrastructure/db/assistant-plan-schema";
import { productDefinitions } from "@/infrastructure/db/platform-schema";
import {
  AssistantPlanDeliveryUnavailable, signAssistantPlanLicenseBind,
  type PlanProjectionConfig,
} from "@/application/billing/assistant-plan-outbox-dispatcher";

export class VendeLicenseProofDenied extends Error {
  constructor() { super("vende.license_payment_proof_denied"); }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f-]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Must be invoked only after provider-reconciled canonical billing settlement.
 * Invoice lock, payment/binding and outbox intent share one PostgreSQL TX.
 */
export async function enqueueVerifiedVendePaidLicense(
  corporateTenantId: string, invoiceId: string,
): Promise<"queued"|"already_queued"> {
  if (!corporateTenantId || corporateTenantId !== process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID ||
      !UUID.test(invoiceId)) throw new VendeLicenseProofDenied();

  return db.transaction(async tx => {
    const [invoice] = await tx.select().from(billingInvoices).where(and(
      eq(billingInvoices.tenantId,corporateTenantId),
      eq(billingInvoices.id,invoiceId),
    )).for("update").limit(1);
    if (!invoice || invoice.status !== "paid" || invoice.currency !== "BRL") {
      throw new VendeLicenseProofDenied();
    }
    const [proof] = await tx.select({
      planCode: billingSubscriptions.planCode,
      externalTenantId: billingCustomerBindings.externalTenantId,
      productSlug: productDefinitions.slug,
      providerStatus: billingProviderPayments.status,
      providerGateway: billingProviderPayments.gatewayAccountId,
      gatewayEnvironment: billingGatewayAccounts.environment,
    }).from(billingSubscriptions)
      .innerJoin(billingCustomerBindings,and(
        eq(billingCustomerBindings.tenantId,billingSubscriptions.tenantId),
        eq(billingCustomerBindings.productId,billingSubscriptions.productId),
        eq(billingCustomerBindings.customerId,billingSubscriptions.customerId),
      ))
      .innerJoin(productDefinitions,and(
        eq(productDefinitions.tenantId,billingSubscriptions.tenantId),
        eq(productDefinitions.id,billingSubscriptions.productId),
      ))
      .innerJoin(billingProviderPayments,and(
        eq(billingProviderPayments.tenantId,billingSubscriptions.tenantId),
        eq(billingProviderPayments.invoiceId,invoice.id),
        eq(billingProviderPayments.gatewayAccountId,invoice.gatewayAccountId),
      ))
      .innerJoin(billingGatewayAccounts,and(
        eq(billingGatewayAccounts.tenantId,billingProviderPayments.tenantId),
        eq(billingGatewayAccounts.id,billingProviderPayments.gatewayAccountId),
      ))
      .where(and(
        eq(billingSubscriptions.tenantId,corporateTenantId),
        eq(billingSubscriptions.id,invoice.subscriptionId),
        eq(billingSubscriptions.productId,invoice.productId),
        eq(billingSubscriptions.customerId,invoice.customerId),
      )).limit(1);
    if (!proof || proof.productSlug !== "vendeatendeia" ||
        proof.providerStatus !== "received" ||
        proof.providerGateway !== invoice.gatewayAccountId ||
        !["sandbox","production"].includes(proof.gatewayEnvironment) ||
        !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(proof.externalTenantId)) {
      throw new VendeLicenseProofDenied();
    }
    const [plan] = await tx.select().from(assistantPlanRevisions).where(and(
      eq(assistantPlanRevisions.tenantId,corporateTenantId),
      eq(assistantPlanRevisions.productId,invoice.productId),
      eq(assistantPlanRevisions.planCode,proof.planCode),
      eq(assistantPlanRevisions.status,"published"),
    )).orderBy(desc(assistantPlanRevisions.revision)).limit(1);
    if (!plan || !plan.publishedAt) throw new VendeLicenseProofDenied();
    const [inserted] = await tx.insert(billingVendeLicenseOutbox).values({
      tenantId:corporateTenantId,productId:invoice.productId,
      invoiceId:invoice.id,subscriptionId:invoice.subscriptionId,
      externalTenantId:proof.externalTenantId,
      planCode:plan.planCode,planRevision:plan.revision,
      actorId:plan.actorId,state:"pending",
    }).onConflictDoNothing().returning({id:billingVendeLicenseOutbox.id});
    if (inserted) return "queued";
    const [existing] = await tx.select().from(billingVendeLicenseOutbox).where(and(
      eq(billingVendeLicenseOutbox.tenantId,corporateTenantId),
      eq(billingVendeLicenseOutbox.invoiceId,invoice.id),
    )).limit(1);
    if (!existing || existing.subscriptionId !== invoice.subscriptionId ||
        existing.externalTenantId !== proof.externalTenantId ||
        existing.planCode !== plan.planCode || existing.planRevision !== plan.revision) {
      throw new VendeLicenseProofDenied();
    }
    return "already_queued";
  });
}

/** Claim persisted intent before network I/O; CAS after response prevents
 * concurrent dispatchers from double-marking. Uncertain outcomes stay blocked
 * until an operator reconciles Assistant state (no blind repeat).
 */
export async function dispatchVerifiedVendePaidLicense(
  outboxId:string,config:PlanProjectionConfig,
  http:typeof fetch=fetch,
):Promise<"delivered"> {
  if (!UUID.test(outboxId) ||
      config.organizationId!==process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID)
    throw new AssistantPlanDeliveryUnavailable();
  const token=randomUUID();
  const [claimed]=await db.update(billingVendeLicenseOutbox).set({
    state:"processing",claimToken:token,claimedAt:new Date(),
    attempts:1,
  }).where(and(
    eq(billingVendeLicenseOutbox.id,outboxId),
    eq(billingVendeLicenseOutbox.tenantId,config.organizationId),
    eq(billingVendeLicenseOutbox.state,"pending"),
    eq(billingVendeLicenseOutbox.attempts,0),
  )).returning();
  if (!claimed) throw new AssistantPlanDeliveryUnavailable();
  // Never automatically put a claimed attempt back to pending after a timeout.
  const signed=signAssistantPlanLicenseBind(config,{
    tenantId:claimed.externalTenantId,
    planCode:claimed.planCode,planRevision:claimed.planRevision,
    actorUserId:claimed.actorId,approvedAt:claimed.createdAt,
  });
  try {
    const reply=await http(config.assistantOrigin+
      "/internal/v1/command/assistant-plans/bind",{
      method:"POST",headers:signed.headers,body:signed.body,
      redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(5000),
    });
    if (reply.status!==200) throw new Error("not-confirmed");
    const response:unknown=await reply.json();
    if (!response || typeof response!=="object" || Array.isArray(response) ||
        !["bound","already_bound"].includes(
          (response as Record<string,unknown>).status as string,
        )) throw new Error("not-confirmed");
  } catch {
    await db.update(billingVendeLicenseOutbox).set({
      state:"blocked",
    }).where(and(eq(billingVendeLicenseOutbox.id,outboxId),
      eq(billingVendeLicenseOutbox.claimToken,token),
      eq(billingVendeLicenseOutbox.state,"processing")));
    throw new AssistantPlanDeliveryUnavailable();
  }
  const [done]=await db.update(billingVendeLicenseOutbox).set({
    state:"delivered",deliveredAt:new Date(),
  }).where(and(
    eq(billingVendeLicenseOutbox.id,outboxId),
    eq(billingVendeLicenseOutbox.claimToken,token),
    eq(billingVendeLicenseOutbox.state,"processing"),
  )).returning({id:billingVendeLicenseOutbox.id});
  if (!done) throw new AssistantPlanDeliveryUnavailable();
  return "delivered";
}
