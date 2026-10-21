/** Canonical billing confirmation → durable governed Assistant license binding.
 * Never issue license based on a webhook body, an unpaid invoice, or a
 * customer-supplied tenant ID. Network delivery occurs after the DB commit.
 */
import { randomUUID } from "node:crypto";
import { signAssistantPlanBindingStatus } from "./assistant-plan-license-signer";
import { and, desc, eq, lt } from "drizzle-orm";
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
      actorId:plan.actorId,approvedAt:plan.publishedAt,state:"pending",
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
  // A license must never be dispatched for a subsequently reversed payment
  // or a retired/unpublished commercial policy.
  const token=randomUUID();
  const claimed=await db.transaction(async tx => {
    const [eligibility]=await tx.select({
    invoiceStatus:billingInvoices.status,
    paymentStatus:billingProviderPayments.status,
    planStatus:assistantPlanRevisions.status,
  }).from(billingVendeLicenseOutbox)
    .innerJoin(billingInvoices,and(
      eq(billingInvoices.tenantId,billingVendeLicenseOutbox.tenantId),
      eq(billingInvoices.id,billingVendeLicenseOutbox.invoiceId),
    ))
    .innerJoin(billingProviderPayments,and(
      eq(billingProviderPayments.tenantId,billingInvoices.tenantId),
      eq(billingProviderPayments.invoiceId,billingInvoices.id),
      eq(billingProviderPayments.gatewayAccountId,billingInvoices.gatewayAccountId),
    ))
    .innerJoin(assistantPlanRevisions,and(
      eq(assistantPlanRevisions.tenantId,billingVendeLicenseOutbox.tenantId),
      eq(assistantPlanRevisions.productId,billingVendeLicenseOutbox.productId),
      eq(assistantPlanRevisions.planCode,billingVendeLicenseOutbox.planCode),
      eq(assistantPlanRevisions.revision,billingVendeLicenseOutbox.planRevision),
    )).where(and(
      eq(billingVendeLicenseOutbox.id,outboxId),
      eq(billingVendeLicenseOutbox.tenantId,config.organizationId),
      eq(billingVendeLicenseOutbox.state,"pending"),
    )).for("update").limit(1);
    if (!eligibility || eligibility.invoiceStatus!=="paid" ||
      eligibility.paymentStatus!=="received" ||
      eligibility.planStatus!=="published") throw new AssistantPlanDeliveryUnavailable();
    const [claimed]=await tx.update(billingVendeLicenseOutbox).set({
    state:"processing",claimToken:token,claimedAt:new Date(),
    attempts:1,
  }).where(and(
    eq(billingVendeLicenseOutbox.id,outboxId),
    eq(billingVendeLicenseOutbox.tenantId,config.organizationId),
    eq(billingVendeLicenseOutbox.state,"pending"),
    eq(billingVendeLicenseOutbox.attempts,0),
  )).returning();
    return claimed;
  });
  if (!claimed) throw new AssistantPlanDeliveryUnavailable();
  // Never automatically put a claimed attempt back to pending after a timeout.
  const signed=signAssistantPlanLicenseBind(config,{
    tenantId:claimed.externalTenantId,
    planCode:claimed.planCode,planRevision:claimed.planRevision,
    actorUserId:claimed.actorId,approvedAt:claimed.approvedAt,
  }, new Date(), token);
  try {
    const reply=await http(config.assistantOrigin+
      "/internal/v1/command/assistant-plans/bind",{
      method:"POST",headers:signed.headers,body:signed.body,
      redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(5000),
    });
    if (reply.status!==200) throw new Error("not-confirmed");
    const response:unknown=await reply.json();
    if (!response || typeof response!=="object" || Array.isArray(response) ||
        (response as Record<string,unknown>).status !== "bound"
        ) throw new Error("not-confirmed");
  } catch {
    await db.update(billingVendeLicenseOutbox).set({
      state:"blocked",
    }).where(and(eq(billingVendeLicenseOutbox.id,outboxId),
      eq(billingVendeLicenseOutbox.claimToken,token),
      eq(billingVendeLicenseOutbox.state,"processing")));
    throw new AssistantPlanDeliveryUnavailable();
  }
  // A positive remote ACK is not proof that the commercial grant is STILL
  // authorized. Reversal or plan retirement may occur during network I/O.
  // Lock the canonical payment/plan rows before acknowledging the exact claim.
  // If eligibility was lost, retain the nonce and BLOCK for governed review
  // (the Assistant may already have applied the earlier signed request).
  const outcome=await db.transaction(async tx => {
    const [current]=await tx.select({
      invoiceStatus:billingInvoices.status,
      paymentStatus:billingProviderPayments.status,
      planStatus:assistantPlanRevisions.status,
    }).from(billingVendeLicenseOutbox)
      .innerJoin(billingInvoices,and(
        eq(billingInvoices.tenantId,billingVendeLicenseOutbox.tenantId),
        eq(billingInvoices.id,billingVendeLicenseOutbox.invoiceId),
      ))
      .innerJoin(billingProviderPayments,and(
        eq(billingProviderPayments.tenantId,billingInvoices.tenantId),
        eq(billingProviderPayments.invoiceId,billingInvoices.id),
        eq(billingProviderPayments.gatewayAccountId,billingInvoices.gatewayAccountId),
      ))
      .innerJoin(assistantPlanRevisions,and(
        eq(assistantPlanRevisions.tenantId,billingVendeLicenseOutbox.tenantId),
        eq(assistantPlanRevisions.productId,billingVendeLicenseOutbox.productId),
        eq(assistantPlanRevisions.planCode,billingVendeLicenseOutbox.planCode),
        eq(assistantPlanRevisions.revision,billingVendeLicenseOutbox.planRevision),
      ))
      .where(and(
        eq(billingVendeLicenseOutbox.id,outboxId),
        eq(billingVendeLicenseOutbox.tenantId,config.organizationId),
        eq(billingVendeLicenseOutbox.claimToken,token),
        eq(billingVendeLicenseOutbox.state,"processing"),
      )).for("update").limit(1);
    const eligible=current?.invoiceStatus==="paid" &&
      current.paymentStatus==="received" && current.planStatus==="published";
    const [updated]=await tx.update(billingVendeLicenseOutbox).set(eligible ? {
      state:"delivered",deliveredAt:new Date(),
    } : {
      state:"blocked",
    }).where(and(
      eq(billingVendeLicenseOutbox.id,outboxId),
      eq(billingVendeLicenseOutbox.tenantId,config.organizationId),
      eq(billingVendeLicenseOutbox.claimToken,token),
      eq(billingVendeLicenseOutbox.state,"processing"),
    )).returning({id:billingVendeLicenseOutbox.id});
    return updated && eligible ? "delivered" : "blocked";
  });
  if (outcome!=="delivered") throw new AssistantPlanDeliveryUnavailable();
  return "delivered";
}


/** Bounded single-shot worker entrypoint. Scheduler ownership remains FM Command.
 * Each row is independently claimed before HTTP; competing workers safely
 * lose the CAS. Ambiguous outcomes are left blocked for governed inquiry,
 * never replayed merely because a worker or request times out.
 */
export async function drainVerifiedVendePaidLicenses(
  config:PlanProjectionConfig,
  limit=20,
  http:typeof fetch=fetch,
):Promise<{delivered:number;blocked:number}> {
  if (!Number.isSafeInteger(limit) || limit<1 || limit>50 ||
      config.organizationId!==process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID) {
    throw new AssistantPlanDeliveryUnavailable();
  }
  // Select only currently eligible intents so reversed/retired rows do
  // not monopolize each bounded batch. The claim path still revalidates
  // under row locks immediately before HTTP; no trust in this read snapshot.
  const rows=await db.select({id:billingVendeLicenseOutbox.id})
    .from(billingVendeLicenseOutbox)
    .innerJoin(billingInvoices,and(
      eq(billingInvoices.tenantId,billingVendeLicenseOutbox.tenantId),
      eq(billingInvoices.id,billingVendeLicenseOutbox.invoiceId),
    ))
    .innerJoin(billingProviderPayments,and(
      eq(billingProviderPayments.tenantId,billingInvoices.tenantId),
      eq(billingProviderPayments.invoiceId,billingInvoices.id),
      eq(billingProviderPayments.gatewayAccountId,billingInvoices.gatewayAccountId),
    ))
    .innerJoin(assistantPlanRevisions,and(
      eq(assistantPlanRevisions.tenantId,billingVendeLicenseOutbox.tenantId),
      eq(assistantPlanRevisions.productId,billingVendeLicenseOutbox.productId),
      eq(assistantPlanRevisions.planCode,billingVendeLicenseOutbox.planCode),
      eq(assistantPlanRevisions.revision,billingVendeLicenseOutbox.planRevision),
    ))
    .where(and(
      eq(billingVendeLicenseOutbox.tenantId,config.organizationId),
      eq(billingVendeLicenseOutbox.state,"pending"),
      eq(billingVendeLicenseOutbox.attempts,0),
      eq(billingInvoices.status,"paid"),
      eq(billingProviderPayments.status,"received"),
      eq(assistantPlanRevisions.status,"published"),
    )).orderBy(billingVendeLicenseOutbox.createdAt).limit(limit);
  let delivered=0,blocked=0;
  for (const row of rows) {
    try {
      await dispatchVerifiedVendePaidLicense(row.id,config,http);
      delivered++;
    } catch {
      // Never turn a failed or ambiguous delivery back into an unverified
      // automatic retry. Operator reconciliation inspects the persisted row.
      blocked++;
    }
  }
  return {delivered,blocked};
}


/** Governed recovery: check Assistant's current binding, never replay delivery.
 *
 * A positive signed read-only response can certify an earlier HTTP timeout.
 * A negative/unknown response cannot prove non-delivery, so the row remains
 * blocked; a human must perform a separate, audited remediation.
 */
export async function reconcileBlockedVendePaidLicense(
  outboxId: string,
  config: PlanProjectionConfig,
  http: typeof fetch = fetch,
): Promise<"delivered" | "still_blocked"> {
  if (
    !UUID.test(outboxId) ||
    config.organizationId !== process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID
  ) throw new AssistantPlanDeliveryUnavailable();
  const [row] = await db.select({
    id: billingVendeLicenseOutbox.id,
    externalTenantId: billingVendeLicenseOutbox.externalTenantId,
    planCode: billingVendeLicenseOutbox.planCode,
    planRevision: billingVendeLicenseOutbox.planRevision,
    operationNonce: billingVendeLicenseOutbox.claimToken,
    invoiceStatus: billingInvoices.status,
  }).from(billingVendeLicenseOutbox).innerJoin(
    billingInvoices, and(
      eq(billingInvoices.tenantId, billingVendeLicenseOutbox.tenantId),
      eq(billingInvoices.id, billingVendeLicenseOutbox.invoiceId),
    ),
  ).where(and(
    eq(billingVendeLicenseOutbox.id, outboxId),
    eq(billingVendeLicenseOutbox.tenantId, config.organizationId),
    eq(billingVendeLicenseOutbox.state, "blocked"),
    eq(billingVendeLicenseOutbox.attempts, 1),
  )).limit(1);
  if (!row || row.invoiceStatus !== "paid")
    throw new AssistantPlanDeliveryUnavailable();

  // Reuse the already authorized FM corporate service identity, not
  // a user-provided network URL or an unsigned browser request.
  const signed = signAssistantPlanBindingStatus(config, {
    tenantId: row.externalTenantId,
    planCode: row.planCode,
    planRevision: row.planRevision,
    operationNonce: row.operationNonce ?? "",
  });
  let confirmed = false;
  try {
    const reply = await http(config.assistantOrigin +
      "/internal/v1/command/assistant-plans/binding-status", {
      method: "POST", headers: signed.headers, body: signed.body,
      redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (reply.status !== 200) return "still_blocked";
    const response: unknown = await reply.json();
    confirmed = !!response && typeof response === "object" &&
      !Array.isArray(response) &&
      (response as Record<string, unknown>).status === "bound_confirmed";
  } catch {
    return "still_blocked";
  }
  if (!confirmed) return "still_blocked";
  // The signed status proves only the exact remote attempt. Payment, plan
  // publication and local attempt authority may change while HTTP is in
  // flight. Recheck all of them inside one transaction before certifying.
  return db.transaction(async tx => {
    const [verified] = await tx.select({
      invoiceStatus: billingInvoices.status,
      paymentStatus: billingProviderPayments.status,
      planStatus: assistantPlanRevisions.status,
    }).from(billingVendeLicenseOutbox)
      .innerJoin(billingInvoices, and(
        eq(billingInvoices.tenantId, billingVendeLicenseOutbox.tenantId),
        eq(billingInvoices.id, billingVendeLicenseOutbox.invoiceId),
      ))
      .innerJoin(billingProviderPayments, and(
        eq(billingProviderPayments.tenantId, billingInvoices.tenantId),
        eq(billingProviderPayments.invoiceId, billingInvoices.id),
        eq(billingProviderPayments.gatewayAccountId, billingInvoices.gatewayAccountId),
      ))
      .innerJoin(assistantPlanRevisions, and(
        eq(assistantPlanRevisions.tenantId, billingVendeLicenseOutbox.tenantId),
        eq(assistantPlanRevisions.productId, billingVendeLicenseOutbox.productId),
        eq(assistantPlanRevisions.planCode, billingVendeLicenseOutbox.planCode),
        eq(assistantPlanRevisions.revision, billingVendeLicenseOutbox.planRevision),
      ))
      .where(and(
        eq(billingVendeLicenseOutbox.id, outboxId),
        eq(billingVendeLicenseOutbox.tenantId, config.organizationId),
        eq(billingVendeLicenseOutbox.state, "blocked"),
        eq(billingVendeLicenseOutbox.attempts, 1),
        eq(billingVendeLicenseOutbox.claimToken, row.operationNonce!),
      )).for("update").limit(1);
    if (!verified || verified.invoiceStatus !== "paid" ||
        verified.paymentStatus !== "received" ||
        verified.planStatus !== "published") return "still_blocked";
    const [done] = await tx.update(billingVendeLicenseOutbox).set({
      state: "delivered", deliveredAt: new Date(),
    }).where(and(
      eq(billingVendeLicenseOutbox.id, outboxId),
      eq(billingVendeLicenseOutbox.tenantId, config.organizationId),
      eq(billingVendeLicenseOutbox.state, "blocked"),
      eq(billingVendeLicenseOutbox.attempts, 1),
      eq(billingVendeLicenseOutbox.claimToken, row.operationNonce!),
    )).returning({ id: billingVendeLicenseOutbox.id });
    return done ? "delivered" : "still_blocked";
  });
}


/** Crash recovery for in-flight jobs: quarantine, NEVER implicitly resend.
 *
 * A worker can die between the claim CAS and recording HTTP result.
 * After bounded in-flight lifetime, the operator may use the signed
 * read-only binding-status proof to reconcile the attempt.
 */
export async function quarantineStaleVendeLicenseClaims(
  corporateTenantId: string,
  now: Date = new Date(),
  staleAfterMs = 120_000,
): Promise<number> {
  if (
    corporateTenantId !== process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID ||
    !Number.isFinite(now.getTime()) ||
    !Number.isSafeInteger(staleAfterMs) ||
    staleAfterMs < 60_000 || staleAfterMs > 3_600_000
  ) throw new AssistantPlanDeliveryUnavailable();
  const cutoff = new Date(now.getTime() - staleAfterMs);
  const stale = await db.update(billingVendeLicenseOutbox).set({
    state: "blocked",
  }).where(and(
    eq(billingVendeLicenseOutbox.tenantId, corporateTenantId),
    eq(billingVendeLicenseOutbox.state, "processing"),
    eq(billingVendeLicenseOutbox.attempts, 1),
    lt(billingVendeLicenseOutbox.claimedAt, cutoff),
  )).returning({ id: billingVendeLicenseOutbox.id });
  return stale.length;
}
