import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { productDefinitions, sourceDefinitions } from "@/infrastructure/db/platform-schema";
import { billingProductPlans } from "@/infrastructure/db/billing-schema";
import { PostgresIronPlanMappingRepository } from "@/infrastructure/billing/postgres-iron-plan-mapping-repository";
import { PostgresProductBillingAuthorityRepository } from "@/infrastructure/billing/postgres-product-billing-authority-repository";

const enabled = process.env.FMCC_IRON_ACTIVATION_PG_TEST === "YES";
const tenantId = "ci-iron-activation-" + randomUUID();
const code = "IRON_CI_MONTHLY";
const published = {
  planCode: "IRON_CORE_PRO", displayName: "IRON Core Pro", version: 3,
  publishedAt: "2026-10-20T12:00:00.000Z",
};
const mappingRepo = new PostgresIronPlanMappingRepository();

let productId = "";
let sourceId = "";

async function seed(withBinding = true) {
  const [product] = await db.insert(productDefinitions).values({
    tenantId, slug: "iron", name: "IRON CORE CI", status: "active",
  }).returning();
  productId = product.id;
  const [source] = await db.insert(sourceDefinitions).values({
    tenantId, productId, name: "IRON FIT CORE Commercial",
    sourceType: "iron-commercial-v1", authoritativeDomain: "commercial",
    syncMode: "pull", secretRef: "env:FMCC_IRON_CONTROL_PLANE_TOKEN",
    config: { baseUrl: "https://ci.invalid" },
  }).returning();
  sourceId = source.id;
  await db.insert(billingProductPlans).values({
    tenantId, productId, planCode: code, name: "IRON mensal CI",
    interval: "monthly", currency: "BRL", amountMinor: 19990, status: "inactive",
  });
  return withBinding ? (await mappingRepo.register(tenantId, productId, sourceId, {
    commercialPlanCode: code, ironPlanCode: published.planCode,
    ironPlanVersion: published.version,
  })).mapping : undefined;
}

async function status() {
  const [row] = await db.select().from(billingProductPlans).where(and(
    eq(billingProductPlans.tenantId, tenantId),
    eq(billingProductPlans.productId, productId),
    eq(billingProductPlans.planCode, code),
  )).limit(1);
  return row?.status;
}

afterEach(async () => {
  if (!enabled) return;
  await db.delete(billingProductPlans).where(eq(billingProductPlans.tenantId, tenantId));
  await db.delete(sourceDefinitions).where(eq(sourceDefinitions.tenantId, tenantId));
  await db.delete(productDefinitions).where(eq(productDefinitions.tenantId, tenantId));
  productId = "";
  sourceId = "";
});

describe.skipIf(!enabled)("IRON FM commercial activation: disposable PostgreSQL", () => {
  beforeAll(() => {
    const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
    if (!url || process.env.NODE_ENV !== "test" ||
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.port !== "5432" || url.pathname !== "/fmcc_billing_ci" ||
        url.username !== "fmcc_restore_test") {
      throw new Error("iron_activation_requires_disposable_postgres");
    }
  });

  it("persists inactive -> active once; identical replay is idempotent", async () => {
    const binding = await seed();
    const input = {
      commercialPlanCode: code, expectedAmountMinor: 19990,
      expectedIronPlanCode: published.planCode,
      expectedIronPlanVersion: published.version,
      expectedMappingRevision: binding!.revision,
    };
    const activated = await mappingRepo.activateCommercialPlan(
      tenantId, productId, sourceId, input, published);
    expect(activated).toMatchObject({ changed: true, plan: { status: "active", amountMinor: 19990 } });
    expect(await status()).toBe("active");
    const replay = await mappingRepo.activateCommercialPlan(
      tenantId, productId, sourceId, input, published);
    expect(replay).toMatchObject({ changed: false, plan: { id: activated.plan.id, status: "active" } });
    await expect(mappingRepo.register(tenantId, productId, sourceId, {
      commercialPlanCode: code, ironPlanCode: published.planCode, ironPlanVersion: 4,
    })).rejects.toThrow("billing.iron_plan_mapping_immutable");
    expect(await status()).toBe("active");
  });

  it("does not activate a plan without a registered immutable binding", async () => {
    await seed(false);
    await expect(mappingRepo.activateCommercialPlan(
      tenantId, productId, sourceId, {
        commercialPlanCode: code, expectedAmountMinor: 19990,
        expectedIronPlanCode: published.planCode, expectedIronPlanVersion: 3,
        expectedMappingRevision: 1,
      }, published)).rejects.toThrow("billing.iron_plan_mapping_unavailable");
    expect(await status()).toBe("inactive");
  });

  it("rejects drift in price, mapping revision, published version and wrong tenant", async () => {
    const binding = await seed();
    const input = {
      commercialPlanCode: code, expectedAmountMinor: 19990,
      expectedIronPlanCode: published.planCode,
      expectedIronPlanVersion: published.version,
      expectedMappingRevision: binding!.revision,
    };
    await expect(mappingRepo.activateCommercialPlan(tenantId, productId, sourceId,
      { ...input, expectedAmountMinor: 100 }, published))
      .rejects.toThrow("billing.iron_activation_price_changed");
    await expect(mappingRepo.activateCommercialPlan(tenantId, productId, sourceId,
      { ...input, expectedMappingRevision: 2 }, published))
      .rejects.toThrow("billing.iron_activation_mapping_changed");
    await expect(mappingRepo.activateCommercialPlan(tenantId, productId, sourceId,
      input, { ...published, version: 4 }))
      .rejects.toThrow("billing.iron_activation_published_version_unverified");
    await expect(mappingRepo.activateCommercialPlan(tenantId + "-other", productId,
      sourceId, input, published)).rejects.toThrow("billing.iron_activation_source_scope_denied");
    expect(await status()).toBe("inactive");
  });

  it("serializes simultaneous approvals; one transition and one idempotent replay", async () => {
    const binding = await seed();
    const input = {
      commercialPlanCode: code, expectedAmountMinor: 19990,
      expectedIronPlanCode: published.planCode,
      expectedIronPlanVersion: published.version,
      expectedMappingRevision: binding!.revision,
    };
    const results = await Promise.all([
      mappingRepo.activateCommercialPlan(tenantId, productId, sourceId, input, published),
      mappingRepo.activateCommercialPlan(tenantId, productId, sourceId, input, published),
    ]);
    expect(results.map(result => result.changed).sort()).toEqual([false, true]);
    expect(await status()).toBe("active");
  });

  it("rejects generic direct creation of an active IRON price", async () => {
    await seed(false);
    const generic = new PostgresProductBillingAuthorityRepository();
    await expect(generic.upsertPlan(tenantId, productId, {
      planCode: "IRON_DIRECT_BYPASS", name: "Invalid direct offer",
      interval: "monthly", amountMinor: 4990, status: "active",
    })).rejects.toThrow("billing.iron_plan_requires_inactive_draft");
    const listed = await generic.listPlans(tenantId, productId);
    expect(listed.some(plan => plan.planCode === "IRON_DIRECT_BYPASS")).toBe(false);
  });
});
