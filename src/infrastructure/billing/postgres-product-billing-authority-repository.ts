import { FMCC_IRON_PRODUCT_SLUG } from "@/domain/billing/iron-product-identity";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  BillingPreparationView,
  BillingProductPlanView,
  BillingProductRouteView,
  ProductBillingAuthorityRepository,
} from "@/application/billing/product-billing-authority-service";
import { db } from "@/infrastructure/db/client";
import {
  billingAuditEvents,
  billingCommandRequests,
  billingCustomerBindings,
  billingCustomers,
  billingGatewayAccounts,
  billingGatewayEvents,
  billingInvoices,
  billingProviderPayments,
  billingProductPlans,
  billingProductRoutes,
  billingSubscriptions,
} from "@/infrastructure/db/billing-schema";
import { productDefinitions, sourceDefinitions } from "@/infrastructure/db/platform-schema";
import { readIronPlanMappings, resolveIronPlanMapping, type IronVersionedPlanMapping } from "@/domain/billing/iron-versioned-plan-mapping";

function asInterval(value: string): "monthly" | "yearly" {
  if (value === "monthly" || value === "yearly") return value;
  throw new Error("billing.plan_interval_invalid");
}

function asPlanStatus(value: string): "active" | "inactive" {
  if (value === "active" || value === "inactive") return value;
  throw new Error("billing.plan_status_invalid");
}

function asEnvironment(value: string): "sandbox" | "production" {
  if (value === "sandbox" || value === "production") return value;
  throw new Error("billing.gateway_environment_invalid");
}

export class PostgresProductBillingAuthorityRepository implements ProductBillingAuthorityRepository {
  /**
   * Canonical client-facing readback for exactly one FM product + IRON gym.
   * Never list subscriptions by an unscoped customer/tenant identifier.
   * Payment rows are recorded evidence, NOT proof of external settlement.
   */
  async readIronCommerceCustomer(tenantId: string, productId: string, gymId: string) {
    if (!tenantId.trim() || !/^[0-9a-f-]{36}$/i.test(productId) ||
        !/^[0-9a-f-]{36}$/i.test(gymId)) throw new Error("iron.commerce_input_invalid");
    const [subscription] = await db.select({
      subscriptionId: billingSubscriptions.id,
      customerId: billingSubscriptions.customerId,
      planCode: billingSubscriptions.planCode,
      planName: billingProductPlans.name,
      interval: billingProductPlans.interval,
      status: billingSubscriptions.status,
      paidThrough: billingSubscriptions.paidThrough,
      createdAt: billingSubscriptions.createdAt,
    }).from(billingSubscriptions).innerJoin(billingCustomerBindings, and(
      eq(billingCustomerBindings.tenantId, billingSubscriptions.tenantId),
      eq(billingCustomerBindings.productId, billingSubscriptions.productId),
      eq(billingCustomerBindings.customerId, billingSubscriptions.customerId),
    )).leftJoin(billingProductPlans, and(
      eq(billingProductPlans.tenantId, billingSubscriptions.tenantId),
      eq(billingProductPlans.productId, billingSubscriptions.productId),
      eq(billingProductPlans.planCode, billingSubscriptions.planCode),
    )).where(and(
      eq(billingSubscriptions.tenantId, tenantId),
      eq(billingSubscriptions.productId, productId),
      eq(billingCustomerBindings.tenantId, tenantId),
      eq(billingCustomerBindings.productId, productId),
      eq(billingCustomerBindings.externalTenantId, gymId),
    )).orderBy(desc(billingSubscriptions.createdAt), desc(billingSubscriptions.id)).limit(1);
    if (!subscription) return { subscription: null, invoices: [], historyTruncated: false, scheduleAnchor: null, caktoManagementAvailable: false };

    const invoices = await db.select({
      invoiceId: billingInvoices.id,
      status: billingInvoices.status,
      amountMinor: billingInvoices.amountMinor,
      currency: billingInvoices.currency,
      periodEnd: billingInvoices.periodEnd,
      createdAt: billingInvoices.createdAt,
      recordedPaymentStatus: billingProviderPayments.status,
      paymentRecordedAt: billingProviderPayments.createdAt,
      gatewayProvider: billingGatewayAccounts.provider,
      gatewayEnvironment: billingGatewayAccounts.environment,
      gatewayStatus: billingGatewayAccounts.status,
    }).from(billingInvoices).leftJoin(billingProviderPayments, and(
      eq(billingProviderPayments.tenantId, billingInvoices.tenantId),
      eq(billingProviderPayments.invoiceId, billingInvoices.id),
      eq(billingProviderPayments.gatewayAccountId, billingInvoices.gatewayAccountId),
    )).innerJoin(billingGatewayAccounts, and(
      eq(billingGatewayAccounts.tenantId,billingInvoices.tenantId),
      eq(billingGatewayAccounts.id,billingInvoices.gatewayAccountId),
    )).where(and(
      eq(billingInvoices.tenantId, tenantId),
      eq(billingInvoices.productId, productId),
      eq(billingInvoices.customerId, subscription.customerId),
    )).orderBy(desc(billingInvoices.createdAt), desc(billingInvoices.id)).limit(25);
    // Determine gateway from immutable invoices, not the product's current route.
    const gateways = await db.selectDistinct({
      provider: billingGatewayAccounts.provider, environment: billingGatewayAccounts.environment,
    }).from(billingInvoices).innerJoin(billingGatewayAccounts, and(
      eq(billingGatewayAccounts.tenantId, billingInvoices.tenantId),
      eq(billingGatewayAccounts.id, billingInvoices.gatewayAccountId),
    )).where(and(
      eq(billingInvoices.tenantId, tenantId),
      eq(billingInvoices.productId, productId),
      eq(billingInvoices.customerId, subscription.customerId),
      eq(billingInvoices.subscriptionId, subscription.subscriptionId),
    )).limit(2);
    const caktoManagementAvailable = gateways.length === 1 && gateways[0].provider === "cakto" &&
      gateways[0].environment === "production";
    // Only the original signed purchase (reference equals its invoice) can
    // bootstrap a provider readback. Renewal invoices never substitute for it.
    const anchors = caktoManagementAvailable && subscription.interval ? await db.select({
      invoiceId: billingInvoices.id, paymentId: billingProviderPayments.externalPaymentId,
      amountMinor: billingInvoices.amountMinor,
    }).from(billingInvoices).innerJoin(billingProviderPayments, and(
      eq(billingProviderPayments.tenantId, billingInvoices.tenantId),
      eq(billingProviderPayments.invoiceId, billingInvoices.id),
      eq(billingProviderPayments.gatewayAccountId, billingInvoices.gatewayAccountId),
    )).innerJoin(billingGatewayEvents, and(
      eq(billingGatewayEvents.tenantId, billingInvoices.tenantId),
      eq(billingGatewayEvents.gatewayAccountId, billingInvoices.gatewayAccountId),
      eq(billingGatewayEvents.externalPaymentId, billingProviderPayments.externalPaymentId),
      eq(billingGatewayEvents.externalReference, sql<string>`${billingInvoices.id}::text`),
      eq(billingGatewayEvents.eventType, "payment_confirmed"),
      eq(billingGatewayEvents.status, "processed"),
    )).where(and(
      eq(billingInvoices.tenantId, tenantId),
      eq(billingInvoices.productId, productId),
      eq(billingInvoices.customerId, subscription.customerId),
      eq(billingInvoices.subscriptionId, subscription.subscriptionId),
    )).limit(2) : [];
    const scheduleAnchor = anchors.length === 1 &&
      (subscription.interval === "monthly" || subscription.interval === "yearly") ? {
        ...anchors[0], planCode: subscription.planCode,
        interval: subscription.interval === "monthly" ? "month" as const : "year" as const,
      } : null;
    return {
      scheduleAnchor, caktoManagementAvailable,
      subscription: {
        id: subscription.subscriptionId,
        planCode: subscription.planCode,
        planName: subscription.planName,
        interval: subscription.interval,
        status: subscription.status,
        paidThrough: subscription.paidThrough,
        createdAt: subscription.createdAt,
      },
      invoices: invoices.slice(0, 24),
      historyTruncated: invoices.length > 24,
    };
  }

  /**
   * Reserve a receipt email attempt under a per-academy lock. The provider
   * order identity is retrieved ONLY from the paid ledger + verified event;
   * renewal events must still point to the same original subscription anchor.
   * Failed/uncertain requests consume the cooldown; no automatic resend.
   */
  async reserveIronReceipt(input: {tenantId:string;productId:string;gymId:string;invoiceId:string;actorId:string;requestId:string}) {
    const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
    if (!input.tenantId.trim() || ![input.productId,input.gymId,input.invoiceId,input.actorId,input.requestId].every(x=>uuid.test(x)))
      throw new Error("iron.receipt_unavailable");
    const anchor=alias(billingInvoices,"receipt_anchor");
    return db.transaction(async tx=>{
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${["iron.receipt",input.tenantId,input.productId,input.gymId].join(":")},0))`);
      const rows=await tx.select({paymentId:billingProviderPayments.externalPaymentId})
        .from(billingInvoices).innerJoin(billingCustomerBindings,and(
          eq(billingCustomerBindings.tenantId,billingInvoices.tenantId),
          eq(billingCustomerBindings.productId,billingInvoices.productId),
          eq(billingCustomerBindings.customerId,billingInvoices.customerId)))
        .innerJoin(billingGatewayAccounts,and(eq(billingGatewayAccounts.tenantId,billingInvoices.tenantId),
          eq(billingGatewayAccounts.id,billingInvoices.gatewayAccountId)))
        .innerJoin(billingProviderPayments,and(eq(billingProviderPayments.tenantId,billingInvoices.tenantId),
          eq(billingProviderPayments.invoiceId,billingInvoices.id),
          eq(billingProviderPayments.gatewayAccountId,billingInvoices.gatewayAccountId)))
        .innerJoin(billingGatewayEvents,and(eq(billingGatewayEvents.tenantId,billingInvoices.tenantId),
          eq(billingGatewayEvents.gatewayAccountId,billingInvoices.gatewayAccountId),
          eq(billingGatewayEvents.externalPaymentId,billingProviderPayments.externalPaymentId)))
        .innerJoin(anchor,and(eq(anchor.tenantId,billingInvoices.tenantId),
          eq(anchor.productId,billingInvoices.productId),eq(anchor.customerId,billingInvoices.customerId),
          eq(anchor.subscriptionId,billingInvoices.subscriptionId),eq(anchor.gatewayAccountId,billingInvoices.gatewayAccountId),
          eq(billingGatewayEvents.externalReference,sql<string>`${anchor.id}::text`)))
        .where(and(eq(billingInvoices.tenantId,input.tenantId),eq(billingInvoices.productId,input.productId),
          eq(billingCustomerBindings.externalTenantId,input.gymId),eq(billingInvoices.id,input.invoiceId),
          eq(billingInvoices.status,"paid"),eq(billingProviderPayments.status,"received"),
          eq(billingGatewayAccounts.provider,"cakto"),eq(billingGatewayAccounts.environment,"production"),
          eq(billingGatewayAccounts.status,"enabled"),eq(billingGatewayEvents.eventType,"payment_confirmed"),
          eq(billingGatewayEvents.status,"processed"))).limit(2);
      if(rows.length!==1 || !uuid.test(rows[0].paymentId)) throw new Error("iron.receipt_unavailable");
      const action="iron.receipt.resend.requested";
      const correlationId="iron-receipt:"+input.invoiceId+":"+input.requestId;
      const previous=await tx.select({createdAt:billingAuditEvents.createdAt,correlationId:billingAuditEvents.correlationId})
        .from(billingAuditEvents).where(and(eq(billingAuditEvents.tenantId,input.tenantId),
          eq(billingAuditEvents.subjectId,input.gymId),eq(billingAuditEvents.action,action),
          gte(billingAuditEvents.createdAt,new Date(Date.now()-3600000)))).orderBy(desc(billingAuditEvents.createdAt)).limit(5);
      if(previous.length>=5 || previous.some(row=>row.correlationId===correlationId ||
        row.createdAt.getTime()>Date.now()-120000)) throw new Error("iron.receipt_cooldown");
      // Replays after cooldown still must not re-send an old request ID.
      const replay=await tx.select({id:billingAuditEvents.id}).from(billingAuditEvents)
        .where(and(eq(billingAuditEvents.tenantId,input.tenantId),eq(billingAuditEvents.subjectId,input.gymId),
          eq(billingAuditEvents.action,action),eq(billingAuditEvents.correlationId,correlationId))).limit(1);
      if(replay.length) throw new Error("iron.receipt_cooldown");
      await tx.insert(billingAuditEvents).values({tenantId:input.tenantId,actorId:input.actorId,
        action,subjectId:input.gymId,correlationId});
      return rows[0].paymentId;
    });
  }

  /**
   * Read-only, scoped, fail-closed commercial -> canonical IRON version bindings.
   * A pricing tier can have distinct monthly/yearly commercial codes that both
   * map to the same immutable IRON plan/version. Never infer this from the name.
   */
  async listIronCommerceMappings(tenantId: string, productId: string): Promise<readonly IronVersionedPlanMapping[]> {
    const sources = await db.select({
      config: sourceDefinitions.config,
      name: sourceDefinitions.name,
      domain: sourceDefinitions.authoritativeDomain,
    }).from(sourceDefinitions).where(and(
      eq(sourceDefinitions.tenantId, tenantId),
      eq(sourceDefinitions.productId, productId),
      eq(sourceDefinitions.sourceType, "iron-commercial-v1"),
    ));
    if (sources.length !== 1 || sources[0].name !== "IRON FIT CORE Commercial" ||
        sources[0].domain !== "commercial")
      throw new Error("billing.iron_plan_mapping_source_missing");
    return readIronPlanMappings(sources[0].config);
  }

  async listPlans(tenantId: string, productId: string): Promise<readonly BillingProductPlanView[]> {
    const rows = await db.select().from(billingProductPlans).where(and(
      eq(billingProductPlans.tenantId, tenantId),
      eq(billingProductPlans.productId, productId),
    ));
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      planCode: row.planCode,
      name: row.name,
      interval: asInterval(row.interval),
      amountMinor: row.amountMinor,
      currency: "BRL" as const,
      status: asPlanStatus(row.status),
    }));
  }

  async upsertPlan(tenantId: string, productId: string, input: {
    planCode: string;
    name: string;
    interval: "monthly" | "yearly";
    amountMinor: number;
    status: "active" | "inactive";
  }): Promise<BillingProductPlanView> {
    const [product] = await db.select({ id: productDefinitions.id, slug: productDefinitions.slug }).from(productDefinitions).where(and(
      eq(productDefinitions.tenantId, tenantId),
      eq(productDefinitions.id, productId),
      eq(productDefinitions.status, "active"),
    )).limit(1);
    if (!product) throw new Error("billing.product_not_found");
    // IRON plans must pass the separate authenticated activation transition.
    // A direct POST /plans may create a draft but must never publish an
    // unbound price, even if the caller bypasses the browser form.
    if (product.slug === FMCC_IRON_PRODUCT_SLUG && input.status !== "inactive") {
      throw new Error("billing.iron_plan_requires_inactive_draft");
    }

    const insertPlan = db.insert(billingProductPlans).values({
      tenantId,
      productId,
      planCode: input.planCode,
      name: input.name,
      interval: input.interval,
      amountMinor: input.amountMinor,
      currency: "BRL",
      status: input.status,
      updatedAt: new Date(),
    });
    // IRON invoices and immutable version bindings must never be repriced by an
    // upsert of the same commercial code. New terms require a NEW plan code.
    // Conflict is rejected atomically by PostgreSQL rather than a racy pre-read.
    const [row] = product.slug === FMCC_IRON_PRODUCT_SLUG
      ? await insertPlan.onConflictDoNothing({
          target: [billingProductPlans.tenantId, billingProductPlans.productId, billingProductPlans.planCode],
        }).returning()
      : await insertPlan.onConflictDoUpdate({
          target: [billingProductPlans.tenantId, billingProductPlans.productId, billingProductPlans.planCode],
          set: {
            name: input.name,
            interval: input.interval,
            amountMinor: input.amountMinor,
            status: input.status,
            updatedAt: new Date(),
          },
        }).returning();
    if (!row) throw new Error("billing.iron_plan_code_immutable");
    return {
      id: row.id,
      productId: row.productId,
      planCode: row.planCode,
      name: row.name,
      interval: asInterval(row.interval),
      amountMinor: row.amountMinor,
      currency: "BRL",
      status: asPlanStatus(row.status),
    };
  }

  async getRoute(tenantId: string, productId: string): Promise<BillingProductRouteView | null> {
    const [row] = await db.select({
      productId: billingProductRoutes.productId,
      gatewayAccountId: billingProductRoutes.gatewayAccountId,
      routeStatus: billingProductRoutes.status,
      provider: billingGatewayAccounts.provider,
      environment: billingGatewayAccounts.environment,
    }).from(billingProductRoutes).innerJoin(billingGatewayAccounts, and(
      eq(billingGatewayAccounts.tenantId, billingProductRoutes.tenantId),
      eq(billingGatewayAccounts.id, billingProductRoutes.gatewayAccountId),
    )).where(and(
      eq(billingProductRoutes.tenantId, tenantId),
      eq(billingProductRoutes.productId, productId),
    )).limit(1);
    if (!row) return null;
    return {
      productId: row.productId,
      gatewayAccountId: row.gatewayAccountId,
      provider: row.provider,
      environment: asEnvironment(row.environment),
      status: row.routeStatus === "enabled" ? "enabled" : "disabled",
    };
  }

  async configureRoute(tenantId: string, productId: string, gatewayAccountId: string): Promise<BillingProductRouteView> {
    const [product] = await db.select({ id: productDefinitions.id }).from(productDefinitions).where(and(
      eq(productDefinitions.tenantId, tenantId),
      eq(productDefinitions.id, productId),
      eq(productDefinitions.status, "active"),
    )).limit(1);
    if (!product) throw new Error("billing.product_not_found");

    const [gateway] = await db.select({
      id: billingGatewayAccounts.id,
      provider: billingGatewayAccounts.provider,
      environment: billingGatewayAccounts.environment,
      status: billingGatewayAccounts.status,
    }).from(billingGatewayAccounts).where(and(
      eq(billingGatewayAccounts.tenantId, tenantId),
      eq(billingGatewayAccounts.id, gatewayAccountId),
    )).limit(1);
    if (!gateway || gateway.status !== "enabled") throw new Error("billing.gateway_not_ready");

    await db.insert(billingProductRoutes).values({
      tenantId,
      productId,
      gatewayAccountId,
      status: "enabled",
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [billingProductRoutes.tenantId, billingProductRoutes.productId],
      set: { gatewayAccountId, status: "enabled", updatedAt: new Date() },
    });

    return {
      productId,
      gatewayAccountId,
      provider: gateway.provider,
      environment: asEnvironment(gateway.environment),
      status: "enabled",
    };
  }

  async prepareSubscriptionInvoice(input: {
    tenantId: string;
    productId: string;
    externalTenantId: string;
    planCode: string;
    idempotencyKey: string;
    payloadHash: string;
  }): Promise<BillingPreparationView> {
    return db.transaction(async (tx) => {
      // Different idempotency keys may target the same SaaS tenant concurrently.
      // Serialize before checking bindings/subscriptions to prevent duplicate invoices.
      const subscriptionLockScope = [
        "fmcc.billing.subscription.v1",
        input.tenantId,
        input.productId,
        input.externalTenantId,
      ].join(":");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${subscriptionLockScope}, 0))`);
      // Serializes invoice issuance with immutable mapping registration.
      // A mapping registered after invoice issuance never authorizes the older invoice.
      const planMappingLockScope = [
        "fmcc.billing.plan-map.v1",
        input.tenantId,
        input.productId,
        input.planCode,
      ].join(":");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${planMappingLockScope}, 0))`);


      const [replay] = await tx.select({
        payloadHash: billingCommandRequests.payloadHash,
        productId: billingCommandRequests.productId,
        invoiceId: billingCommandRequests.resultInvoiceId,
      }).from(billingCommandRequests).where(and(
        eq(billingCommandRequests.tenantId, input.tenantId),
        eq(billingCommandRequests.idempotencyKey, input.idempotencyKey),
      )).limit(1);

      if (replay) {
        if (replay.payloadHash !== input.payloadHash || replay.productId !== input.productId || !replay.invoiceId)
          throw new Error("billing.idempotency_conflict");
        const [existing] = await tx.select({
          productId: billingInvoices.productId,
          customerId: billingInvoices.customerId,
          subscriptionId: billingInvoices.subscriptionId,
          invoiceId: billingInvoices.id,
          amountMinor: billingInvoices.amountMinor,
          currency: billingInvoices.currency,
          invoiceStatus: billingInvoices.status,
          planCode: billingSubscriptions.planCode,
          gatewayAccountId: billingInvoices.gatewayAccountId,
          provider: billingGatewayAccounts.provider,
          environment: billingGatewayAccounts.environment,
          externalTenantId: billingCustomerBindings.externalTenantId,
        }).from(billingInvoices)
          .innerJoin(billingSubscriptions, and(
            eq(billingSubscriptions.tenantId, billingInvoices.tenantId),
            eq(billingSubscriptions.id, billingInvoices.subscriptionId),
          ))
          .innerJoin(billingGatewayAccounts, and(
            eq(billingGatewayAccounts.tenantId, billingInvoices.tenantId),
            eq(billingGatewayAccounts.id, billingInvoices.gatewayAccountId),
          ))
          .innerJoin(billingCustomerBindings, and(
            eq(billingCustomerBindings.tenantId, billingInvoices.tenantId),
            eq(billingCustomerBindings.productId, billingInvoices.productId),
            eq(billingCustomerBindings.customerId, billingInvoices.customerId),
          ))
          .where(and(
            eq(billingInvoices.tenantId, input.tenantId),
            eq(billingInvoices.id, replay.invoiceId),
          )).limit(1);
        if (!existing) throw new Error("billing.idempotency_result_missing");
        return {
          productId: existing.productId,
          externalTenantId: existing.externalTenantId,
          customerId: existing.customerId,
          subscriptionId: existing.subscriptionId,
          invoiceId: existing.invoiceId,
          planCode: existing.planCode,
          amountMinor: existing.amountMinor,
          currency: existing.currency === "BRL" ? "BRL" : "BRL",
          gatewayAccountId: existing.gatewayAccountId,
          gatewayProvider: existing.provider,
          gatewayEnvironment: asEnvironment(existing.environment),
          invoiceStatus: existing.invoiceStatus,
          idempotentReplay: true,
        };
      }

      const [product] = await tx.select({ id: productDefinitions.id, slug: productDefinitions.slug }).from(productDefinitions).where(and(
        eq(productDefinitions.tenantId, input.tenantId),
        eq(productDefinitions.id, input.productId),
        eq(productDefinitions.status, "active"),
      )).limit(1);
      if (!product) throw new Error("billing.product_not_found");

      const [plan] = await tx.select().from(billingProductPlans).where(and(
        eq(billingProductPlans.tenantId, input.tenantId),
        eq(billingProductPlans.productId, input.productId),
        eq(billingProductPlans.planCode, input.planCode),
        eq(billingProductPlans.status, "active"),
      )).limit(1);
      if (!plan) throw new Error("billing.plan_not_found");

      if (product.slug === FMCC_IRON_PRODUCT_SLUG) {
        // Fail closed BEFORE issuing an IRON invoice if no approved immutable
        // commercial→entitlement version mapping exists for its plan.
        const sources = await tx.select({
          config: sourceDefinitions.config,
          name: sourceDefinitions.name,
          type: sourceDefinitions.sourceType,
          domain: sourceDefinitions.authoritativeDomain,
        }).from(sourceDefinitions).where(and(
          eq(sourceDefinitions.tenantId, input.tenantId),
          eq(sourceDefinitions.productId, input.productId),
          eq(sourceDefinitions.sourceType, "iron-commercial-v1"),
        ));
        if (sources.length !== 1 || sources[0].name !== "IRON FIT CORE Commercial" ||
            sources[0].domain !== "commercial") {
          throw new Error("billing.iron_plan_mapping_source_missing");
        }
        resolveIronPlanMapping(sources[0].config, plan.planCode);
      }


      const [route] = await tx.select({
        gatewayAccountId: billingProductRoutes.gatewayAccountId,
        provider: billingGatewayAccounts.provider,
        environment: billingGatewayAccounts.environment,
        gatewayStatus: billingGatewayAccounts.status,
      }).from(billingProductRoutes).innerJoin(billingGatewayAccounts, and(
        eq(billingGatewayAccounts.tenantId, billingProductRoutes.tenantId),
        eq(billingGatewayAccounts.id, billingProductRoutes.gatewayAccountId),
      )).where(and(
        eq(billingProductRoutes.tenantId, input.tenantId),
        eq(billingProductRoutes.productId, input.productId),
        eq(billingProductRoutes.status, "enabled"),
      )).limit(1);
      if (!route || route.gatewayStatus !== "enabled") throw new Error("billing.product_route_not_ready");

      let [binding] = await tx.select({
        customerId: billingCustomerBindings.customerId,
      }).from(billingCustomerBindings).where(and(
        eq(billingCustomerBindings.tenantId, input.tenantId),
        eq(billingCustomerBindings.productId, input.productId),
        eq(billingCustomerBindings.externalTenantId, input.externalTenantId),
      )).limit(1);

      if (!binding) {
        const [customer] = await tx.insert(billingCustomers).values({
          tenantId: input.tenantId,
          externalCustomerId: "pending:" + randomUUID(),
        }).returning({ id: billingCustomers.id });
        await tx.insert(billingCustomerBindings).values({
          tenantId: input.tenantId,
          productId: input.productId,
          customerId: customer.id,
          externalTenantId: input.externalTenantId,
        });
        binding = { customerId: customer.id };
      }

      const liveRows = await tx.select({ id: billingSubscriptions.id, status: billingSubscriptions.status, planCode: billingSubscriptions.planCode }).from(billingSubscriptions).where(and(
        eq(billingSubscriptions.tenantId, input.tenantId),
        eq(billingSubscriptions.productId, input.productId),
        eq(billingSubscriptions.customerId, binding.customerId),
        // IRON must never create a second paid subscription if a prior
        // commercial subscription is suspended and needs recovery instead.
        inArray(billingSubscriptions.status, product.slug === FMCC_IRON_PRODUCT_SLUG
          ? ["pending", "active", "past_due", "suspended"]
          : ["pending", "active", "past_due"]),
      )).for("update").limit(2);
      if (liveRows.length) {
        const live = liveRows[0];
        // Reopen exactly the original pending checkout after a reload or lost
        // idempotency key. Never create a second subscription or reprice an invoice.
        if (product.slug !== FMCC_IRON_PRODUCT_SLUG || liveRows.length !== 1 ||
            live.status !== "pending" || live.planCode !== plan.planCode ||
            route.provider !== "cakto" || route.environment !== "production")
          throw new Error("billing.subscription_exists");
        const pending = await tx.select().from(billingInvoices).where(and(
          eq(billingInvoices.tenantId, input.tenantId),
          eq(billingInvoices.productId, input.productId),
          eq(billingInvoices.customerId, binding.customerId),
          eq(billingInvoices.subscriptionId, live.id),
        )).for("update").limit(2);
        const existing = pending[0];
        if (pending.length !== 1 || existing.status !== "pending" ||
            existing.gatewayAccountId !== route.gatewayAccountId ||
            existing.amountMinor !== plan.amountMinor || existing.currency !== "BRL" ||
            existing.periodEnd !== null)
          throw new Error("billing.subscription_exists");
        await tx.insert(billingCommandRequests).values({
          tenantId: input.tenantId, productId: input.productId,
          idempotencyKey: input.idempotencyKey, action: "prepare_subscription_invoice",
          payloadHash: input.payloadHash, resultInvoiceId: existing.id,
        });
        return {
          productId: input.productId, externalTenantId: input.externalTenantId,
          customerId: binding.customerId, subscriptionId: live.id,
          invoiceId: existing.id, planCode: live.planCode, amountMinor: existing.amountMinor,
          currency: "BRL", gatewayAccountId: route.gatewayAccountId,
          gatewayProvider: route.provider, gatewayEnvironment: asEnvironment(route.environment),
          invoiceStatus: existing.status, idempotentReplay: true,
        };
      }

      const [subscription] = await tx.insert(billingSubscriptions).values({
        tenantId: input.tenantId,
        productId: input.productId,
        customerId: binding.customerId,
        planCode: plan.planCode,
        status: "pending",
      }).returning({ id: billingSubscriptions.id });

      const [invoice] = await tx.insert(billingInvoices).values({
        tenantId: input.tenantId,
        productId: input.productId,
        customerId: binding.customerId,
        subscriptionId: subscription.id,
        gatewayAccountId: route.gatewayAccountId,
        currency: "BRL",
        amountMinor: plan.amountMinor,
        status: "pending",
      }).returning({ id: billingInvoices.id, status: billingInvoices.status });

      await tx.insert(billingCommandRequests).values({
        tenantId: input.tenantId,
        productId: input.productId,
        idempotencyKey: input.idempotencyKey,
        action: "prepare_subscription_invoice",
        payloadHash: input.payloadHash,
        resultInvoiceId: invoice.id,
      });

      return {
        productId: input.productId,
        externalTenantId: input.externalTenantId,
        customerId: binding.customerId,
        subscriptionId: subscription.id,
        invoiceId: invoice.id,
        planCode: plan.planCode,
        amountMinor: plan.amountMinor,
        currency: "BRL",
        gatewayAccountId: route.gatewayAccountId,
        gatewayProvider: route.provider,
        gatewayEnvironment: asEnvironment(route.environment),
        invoiceStatus: invoice.status,
        idempotentReplay: false,
      };
    });
  }
}
