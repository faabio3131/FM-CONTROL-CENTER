import { FMCC_IRON_PRODUCT_SLUG } from "@/domain/billing/iron-product-identity";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { billingProductPlans } from "@/infrastructure/db/billing-schema";
import { productDefinitions, sourceDefinitions } from "@/infrastructure/db/platform-schema";
import { appendIronPlanMapping, assertIronPlanMappingRegistrationState, readIronPlanMappings, type IronVersionedPlanMapping } from "@/domain/billing/iron-versioned-plan-mapping";
import { assertIronCommercialPlanActivation, type IronCommercialPlanActivationInput } from "@/domain/billing/iron-commercial-plan-activation";
import { resolveIronPlanMapping } from "@/domain/billing/iron-versioned-plan-mapping";
import type { IronPublishedPlanVersion } from "@/infrastructure/integration/iron-commercial-connector";

export class PostgresIronPlanMappingRepository {
  async list(tenantId: string, productId: string, sourceId: string): Promise<readonly IronVersionedPlanMapping[]> {
    const [source] = await db.select({
      config: sourceDefinitions.config,
      name: sourceDefinitions.name,
      sourceType: sourceDefinitions.sourceType,
      productSlug: productDefinitions.slug,
    }).from(sourceDefinitions).innerJoin(productDefinitions, and(
      eq(productDefinitions.tenantId, sourceDefinitions.tenantId),
      eq(productDefinitions.id, sourceDefinitions.productId),
    )).where(and(
      eq(sourceDefinitions.tenantId, tenantId),
      eq(sourceDefinitions.productId, productId),
      eq(sourceDefinitions.id, sourceId),
    )).limit(1);
    if (!source || source.name !== "IRON FIT CORE Commercial" ||
        source.sourceType !== "iron-commercial-v1" || source.productSlug !== FMCC_IRON_PRODUCT_SLUG)
      throw new Error("billing.iron_mapping_source_scope_denied");
    return readIronPlanMappings(source.config);
  }

  async register(
    tenantId: string, productId: string, sourceId: string,
    input: { commercialPlanCode: string; ironPlanCode: string; ironPlanVersion: number },
  ): Promise<{ mapping: IronVersionedPlanMapping; created: boolean }> {
    return db.transaction(async (tx) => {
      // Order mapping registration against invoice preparation for the same plan.
      const scope = ["fmcc.billing.plan-map.v1", tenantId, productId,
        input.commercialPlanCode.trim().toUpperCase()].join(":");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`);
      const [source] = await tx.select({
        id: sourceDefinitions.id, config: sourceDefinitions.config,
        name: sourceDefinitions.name, sourceType: sourceDefinitions.sourceType,
        authoritativeDomain: sourceDefinitions.authoritativeDomain,
        secretRef: sourceDefinitions.secretRef, productSlug: productDefinitions.slug,
      }).from(sourceDefinitions).innerJoin(productDefinitions, and(
        eq(productDefinitions.tenantId, sourceDefinitions.tenantId),
        eq(productDefinitions.id, sourceDefinitions.productId),
        eq(productDefinitions.status, "active"),
      )).where(and(
        eq(sourceDefinitions.tenantId, tenantId),
        eq(sourceDefinitions.productId, productId),
        eq(sourceDefinitions.id, sourceId),
      )).for("update", { of: sourceDefinitions }).limit(1);
      if (!source || source.name !== "IRON FIT CORE Commercial" ||
          source.sourceType !== "iron-commercial-v1" ||
          source.authoritativeDomain !== "commercial" ||
          source.secretRef !== "env:FMCC_IRON_CONTROL_PLANE_TOKEN" ||
          source.productSlug !== FMCC_IRON_PRODUCT_SLUG)
        throw new Error("billing.iron_mapping_source_scope_denied");

      // A new FM plan begins inactive: register its immutable IRON version
      // binding while it is still a draft. This does NOT activate the plan,
      // issue invoices, or grant any SaaS entitlement. Invoice preparation
      // independently requires status=active and a matching binding.
      const [plan] = await tx.select({
        code: billingProductPlans.planCode,
        status: billingProductPlans.status,
      }).from(billingProductPlans).where(and(
        eq(billingProductPlans.tenantId, tenantId),
        eq(billingProductPlans.productId, productId),
        eq(billingProductPlans.planCode, input.commercialPlanCode.trim().toUpperCase()),
      )).limit(1);
      if (!plan) throw new Error("billing.iron_commercial_plan_not_found");
      // Never attach a new IRON entitlement version to an already-active
      // commercial price. Replays of the existing immutable binding remain
      // idempotent, even after the FM plan was activated separately.
      const result = appendIronPlanMapping(source.config, input);
      assertIronPlanMappingRegistrationState(plan.status, result.created);
      if (result.created) {
        await tx.update(sourceDefinitions).set({ config: result.config, updatedAt: new Date() }).where(and(
          eq(sourceDefinitions.tenantId, tenantId),
          eq(sourceDefinitions.productId, productId),
          eq(sourceDefinitions.id, sourceId),
        ));
      }
      return { mapping: result.mapping, created: result.created };
    });
  }
  /**
   * Makes a reviewed FM price selectable. This does not issue an invoice,
   * contact a provider or grant rights within the IRON SaaS.
   */
  async activateCommercialPlan(
    tenantId: string, productId: string, sourceId: string,
    input: IronCommercialPlanActivationInput,
    published: IronPublishedPlanVersion,
  ): Promise<{ changed: boolean; plan: { id: string; productId: string; planCode: string; name: string; amountMinor: number; interval: string; currency: string; status: "active" } }> {
    return db.transaction(async (tx) => {
      const scope = ["fmcc.billing.plan-map.v1", tenantId, productId, input.commercialPlanCode].join(":");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`);
      const [source] = await tx.select({
        config: sourceDefinitions.config,
        name: sourceDefinitions.name,
        sourceType: sourceDefinitions.sourceType,
        authoritativeDomain: sourceDefinitions.authoritativeDomain,
        secretRef: sourceDefinitions.secretRef,
        productSlug: productDefinitions.slug,
      }).from(sourceDefinitions).innerJoin(productDefinitions, and(
        eq(productDefinitions.tenantId, sourceDefinitions.tenantId),
        eq(productDefinitions.id, sourceDefinitions.productId),
        eq(productDefinitions.status, "active"),
      )).where(and(
        eq(sourceDefinitions.tenantId, tenantId),
        eq(sourceDefinitions.productId, productId),
        eq(sourceDefinitions.id, sourceId),
      )).for("update", { of: sourceDefinitions }).limit(1);
      if (!source || source.productSlug !== FMCC_IRON_PRODUCT_SLUG ||
          source.name !== "IRON FIT CORE Commercial" ||
          source.sourceType !== "iron-commercial-v1" ||
          source.authoritativeDomain !== "commercial" ||
          source.secretRef !== "env:FMCC_IRON_CONTROL_PLANE_TOKEN") {
        throw new Error("billing.iron_activation_source_scope_denied");
      }

      const [plan] = await tx.select().from(billingProductPlans).where(and(
        eq(billingProductPlans.tenantId, tenantId),
        eq(billingProductPlans.productId, productId),
        eq(billingProductPlans.planCode, input.commercialPlanCode),
      )).for("update", { of: billingProductPlans }).limit(1);
      if (!plan) throw new Error("billing.iron_activation_plan_not_found");

      const mapping = resolveIronPlanMapping(source.config, input.commercialPlanCode);
      assertIronCommercialPlanActivation(input, plan, mapping, published);
      if (plan.status === "active") {
        return { changed: false, plan: { id: plan.id, productId, planCode: plan.planCode,
          name: plan.name, amountMinor: plan.amountMinor, interval: plan.interval,
          currency: plan.currency, status: "active" as const } };
      }

      const [updated] = await tx.update(billingProductPlans).set({
        status: "active", updatedAt: new Date(),
      }).where(and(
        eq(billingProductPlans.tenantId, tenantId),
        eq(billingProductPlans.productId, productId),
        eq(billingProductPlans.id, plan.id),
        eq(billingProductPlans.status, "inactive"),
      )).returning();
      if (!updated) throw new Error("billing.iron_activation_concurrent_state_changed");
      return { changed: true, plan: { id: updated.id, productId, planCode: updated.planCode,
        name: updated.name, amountMinor: updated.amountMinor, interval: updated.interval,
        currency: updated.currency, status: "active" as const } };
    });
  }

}
