import { FMCC_IRON_PRODUCT_SLUG } from "@/domain/billing/iron-product-identity";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "@/infrastructure/db/client";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { billingProductPlans, billingProductRoutes, billingGatewayAccounts } from "@/infrastructure/db/billing-schema";
import { auditEvents } from "@/infrastructure/db/foundation-schema";
import { IRON_FOUR_TIER_OFFERS, IRON_FOUR_TIER_REVIEW_VERSION } from "@/domain/billing/iron-four-tier-offers";
import type { TenantContext } from "@/domain/security/tenant-context";
import { productDefinitions, sourceDefinitions } from "@/infrastructure/db/platform-schema";
import { appendIronPlanMapping, assertIronPlanMappingRegistrationState, readIronPlanMappings, type IronVersionedPlanMapping } from "@/domain/billing/iron-versioned-plan-mapping";
import { assertIronCommercialPlanActivation, type IronCommercialPlanActivationInput } from "@/domain/billing/iron-commercial-plan-activation";
import { resolveIronPlanMapping } from "@/domain/billing/iron-versioned-plan-mapping";
import type { IronPublishedPlanVersion } from "@/infrastructure/integration/iron-commercial-connector";

// One pinned connection for the session fence and its subsequent short SQL
// transaction. No row/transaction lock is acquired while reading the remote
// published catalog. Retirement uses the same fence to prevent stale bindings.
async function withPublicationFence<T>(tenantId: string, productId: string, sourceId: string,
  work: (connection: NodePgDatabase<Record<string, unknown>>) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const key = JSON.stringify(["fmcc.billing.plan-publication.v1",tenantId,productId,sourceId]);
  let locked = false;
  // Discard if acquisition itself fails: the server could have taken the lock.
  let discard = true;
  try {
    const acquired = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired", [key]);
    locked = acquired.rows[0]?.acquired === true;
    discard = false;
    if (!locked) throw new Error("billing.iron_publication_busy");
    return await work(drizzle(client));
  } finally {
    if (locked) {
      try {
        const result = await client.query<{ released: boolean }>(
          "SELECT pg_advisory_unlock(hashtextextended($1,0)) AS released",[key]);
        discard = result.rows[0]?.released !== true;
      } catch { discard = true; }
    }
    // Never return a connection with a possibly held session lock.
    client.release(discard);
  }
}

export class PostgresIronPlanMappingRepository {
  /**
   * One reviewed eight-offer rollout. Reuses the exact mapping lock and immutable
   * pricing/activation invariants of the existing per-plan operations.
   * Any collision or unavailable provider/catalog rolls back the ENTIRE set.
   */
  async publishFourTiers(
    context: TenantContext, productId: string, sourceId: string,
    verifyPublished: () => Promise<readonly IronPublishedPlanVersion[]>,
    verifyOffer: (amountMinor:number, interval:"month"|"year", planCode:string) => boolean,
  ) {
    const tenantId=context.tenantId;
    return withPublicationFence(tenantId,productId,sourceId,async connection=>{
      const published=await verifyPublished();
      // Prove all eight terms before creating a single price.
      for(const offer of IRON_FOUR_TIER_OFFERS){
        if(published.filter(p=>p.planCode===offer.ironPlanCode&&p.version===offer.ironPlanVersion).length!==1)
          throw new Error("billing.iron_rollout_version_not_published");
        if(!verifyOffer(offer.amountMinor,offer.interval==="monthly"?"month":"year",offer.commercialPlanCode))
          throw new Error("billing.iron_rollout_cakto_offer_missing");
      }
      const verifiedAt=Date.now();
      return connection.transaction(async tx=>{
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      for(const offer of [...IRON_FOUR_TIER_OFFERS].sort((a,b)=>a.commercialPlanCode.localeCompare(b.commercialPlanCode))){
        const key=["fmcc.billing.plan-map.v1",tenantId,productId,offer.commercialPlanCode].join(":");
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
      }
      const [source]=await tx.select({
        config:sourceDefinitions.config,name:sourceDefinitions.name,
        sourceType:sourceDefinitions.sourceType,secretRef:sourceDefinitions.secretRef,
        authority:sourceDefinitions.authoritativeDomain,slug:productDefinitions.slug,
      }).from(sourceDefinitions).innerJoin(productDefinitions,and(
        eq(productDefinitions.tenantId,sourceDefinitions.tenantId),
        eq(productDefinitions.id,sourceDefinitions.productId),eq(productDefinitions.status,"active")))
        .where(and(eq(sourceDefinitions.tenantId,tenantId),eq(sourceDefinitions.productId,productId),
          eq(sourceDefinitions.id,sourceId))).for("update",{of:sourceDefinitions}).limit(1);
      if(!source||source.slug!==FMCC_IRON_PRODUCT_SLUG||source.name!=="IRON FIT CORE Commercial"||
        source.sourceType!=="iron-commercial-v1"||source.authority!=="commercial"||
        source.secretRef!=="env:FMCC_IRON_CONTROL_PLANE_TOKEN")
        throw new Error("billing.iron_activation_source_scope_denied");
      const [route]=await tx.select({provider:billingGatewayAccounts.provider,
        environment:billingGatewayAccounts.environment,accountStatus:billingGatewayAccounts.status,
        routeStatus:billingProductRoutes.status}).from(billingProductRoutes)
        .innerJoin(billingGatewayAccounts,and(eq(billingGatewayAccounts.tenantId,billingProductRoutes.tenantId),
          eq(billingGatewayAccounts.id,billingProductRoutes.gatewayAccountId)))
        .where(and(eq(billingProductRoutes.tenantId,tenantId),eq(billingProductRoutes.productId,productId)))
        .for("update",{of:[billingProductRoutes,billingGatewayAccounts]}).limit(1);
      if(!route||route.provider!=="cakto"||route.environment!=="production"||
        route.accountStatus!=="enabled"||route.routeStatus!=="enabled")
        throw new Error("billing.iron_rollout_gateway_not_ready");
      if (Date.now() - verifiedAt > 30_000) throw new Error("billing.iron_rollout_catalog_unverifiable");
      let config=source.config;
      let changed=0;
      const result:{planCode:string;mappingRevision:number;status:"active"}[]=[];
      for(const offer of IRON_FOUR_TIER_OFFERS){
        const where=and(eq(billingProductPlans.tenantId,tenantId),eq(billingProductPlans.productId,productId),
          eq(billingProductPlans.planCode,offer.commercialPlanCode));
        let [plan]=await tx.select().from(billingProductPlans).where(where).for("update").limit(1);
        if(!plan){
          // Competing ordinary draft creation can win: never update or reprice it.
          const inserted=await tx.insert(billingProductPlans).values({tenantId,productId,
            planCode:offer.commercialPlanCode,name:offer.name,interval:offer.interval,
            amountMinor:offer.amountMinor,currency:"BRL",status:"inactive"})
            .onConflictDoNothing().returning();
          if(!inserted[0]) throw new Error("billing.iron_rollout_concurrent_draft");
          plan=inserted[0];
        }
        if(plan.amountMinor!==offer.amountMinor||plan.interval!==offer.interval||plan.currency!=="BRL")
          throw new Error("billing.iron_rollout_immutable_price_conflict");
        const mappingResult=appendIronPlanMapping(config,offer);
        assertIronPlanMappingRegistrationState(plan.status,mappingResult.created);
        config=mappingResult.config;
        const version=published.find(p=>p.planCode===offer.ironPlanCode&&p.version===offer.ironPlanVersion)!;
        assertIronCommercialPlanActivation({
          commercialPlanCode:offer.commercialPlanCode,expectedAmountMinor:offer.amountMinor,
          expectedIronPlanCode:offer.ironPlanCode,expectedIronPlanVersion:offer.ironPlanVersion,
          expectedMappingRevision:mappingResult.mapping.revision,
        },plan,mappingResult.mapping,version);
        if(plan.status==="inactive"){
          const rows=await tx.update(billingProductPlans).set({status:"active",updatedAt:new Date()})
            .where(and(where,eq(billingProductPlans.status,"inactive"))).returning({id:billingProductPlans.id});
          if(rows.length!==1) throw new Error("billing.iron_activation_concurrent_state_changed");
          changed++;
        }
        result.push({planCode:offer.commercialPlanCode,mappingRevision:mappingResult.mapping.revision,status:"active"});
      }
      await tx.update(sourceDefinitions).set({config,updatedAt:new Date()}).where(and(
        eq(sourceDefinitions.id,sourceId),eq(sourceDefinitions.tenantId,tenantId),
        eq(sourceDefinitions.productId,productId)));
      await tx.insert(auditEvents).values({tenantId,actorId:context.userId,actorType:"user",
        action:"billing.iron_four_tiers.publish",resourceType:"billing_product",resourceId:productId,
        result:"success",correlationId:context.correlationId,
        metadata:{proposal:IRON_FOUR_TIER_REVIEW_VERSION,changed,offers:result.map(x=>x.planCode)}});
      return {changed,offers:result,providerConfigurationVerified:true as const,paymentExecuted:false as const};
      });
    });
  }

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
    verifyPublished?: () => Promise<void>,
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
        if (verifyPublished) await verifyPublished();
        await tx.update(sourceDefinitions).set({ config: result.config, updatedAt: new Date() }).where(and(
          eq(sourceDefinitions.tenantId, tenantId),
          eq(sourceDefinitions.productId, productId),
          eq(sourceDefinitions.id, sourceId),
        ));
      }
      return { mapping: result.mapping, created: result.created };
    });
  }
  /** Lock the same canonical source row as registration so a reviewed
   * retirement cannot race with binding a new commercial price. */
  async retireUnboundVersion(tenantId: string, productId: string, sourceId: string,
    planCode: string, version: number, retire: () => Promise<void>): Promise<void> {
    await withPublicationFence(tenantId,productId,sourceId,async connection => connection.transaction(async tx => {
      const [source] = await tx.select({
        config: sourceDefinitions.config, name: sourceDefinitions.name,
        sourceType: sourceDefinitions.sourceType, secretRef: sourceDefinitions.secretRef,
        authoritativeDomain: sourceDefinitions.authoritativeDomain, productSlug: productDefinitions.slug,
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
        source.name !== "IRON FIT CORE Commercial" || source.sourceType !== "iron-commercial-v1" ||
        source.secretRef !== "env:FMCC_IRON_CONTROL_PLANE_TOKEN" || source.authoritativeDomain !== "commercial")
        throw new Error("billing.iron_mapping_source_scope_denied");
      if (readIronPlanMappings(source.config).some(mapping =>
        mapping.ironPlanCode === planCode && mapping.ironPlanVersion === version))
        throw new Error("billing.iron_retirement_bound_version");
      // Only the IRON canonical engine can retire; it also refuses launch,
      // price and subscription dependencies in its own SERIALIZABLE transaction.
      await retire();
    }));
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
