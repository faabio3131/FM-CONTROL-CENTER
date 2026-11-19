import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/infrastructure/db/client";
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
  // Same isolated tenant and existing cleanup; delete references in FK order.
  for (const table of [
    "fmcc_billing_command_request", "fmcc_billing_provider_payment", "fmcc_billing_invoice",
    "fmcc_billing_subscription", "fmcc_billing_customer_binding", "fmcc_billing_product_route",
    "fmcc_billing_gateway_account", "fmcc_billing_customer",
  ]) await pool.query("DELETE FROM " + table + " WHERE tenant_id=$1", [tenantId]);
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

  it("refuses retirement of any historically bound commercial version", async () => {
    await seed();
    let called=false;
    await expect(mappingRepo.retireUnboundVersion(tenantId,productId,sourceId,
      published.planCode,published.version,async()=>{called=true;}))
      .rejects.toThrow("billing.iron_retirement_bound_version");
    expect(called).toBe(false);
    expect(await status()).toBe("inactive");
  });

  it("serializes a new binding against retirement and rejects a stale published catalog under lock", async () => {
    await seed(false);
    let markRetirement!:()=>void;
    let finishRetirement!:()=>void;
    const locked=new Promise<void>(resolve=>{markRetirement=resolve;});
    const release=new Promise<void>(resolve=>{finishRetirement=resolve;});
    let canonicalPublished=true;
    const retired=mappingRepo.retireUnboundVersion(tenantId,productId,sourceId,
      published.planCode,published.version,async()=>{
        markRetirement(); await release; canonicalPublished=false;
      });
    await locked;
    const registration=mappingRepo.register(tenantId,productId,sourceId,{
      commercialPlanCode:code,ironPlanCode:published.planCode,ironPlanVersion:published.version,
    },async()=>{
      if(!canonicalPublished) throw new Error("billing.iron_plan_version_unverified");
    });
    const observed=expect(registration).rejects.toThrow("billing.iron_plan_version_unverified");
    finishRetirement();
    await retired;
    await observed;
    expect(await mappingRepo.list(tenantId,productId,sourceId)).toEqual([]);
    expect(await status()).toBe("inactive");
  });


  it("recovers the same pending IRON invoice for new request IDs, even concurrently; denies repricing and active duplicates", async () => {
    const binding = await seed();
    await mappingRepo.activateCommercialPlan(tenantId, productId, sourceId, {
      commercialPlanCode: code, expectedAmountMinor: 19990,
      expectedIronPlanCode: published.planCode, expectedIronPlanVersion: published.version,
      expectedMappingRevision: binding!.revision,
    }, published);
    const gateway = await pool.query(
      "INSERT INTO fmcc_billing_gateway_account(tenant_id,provider,environment,label,secret_ref,status) VALUES($1,'cakto','production','ci','env://FMCC_CAKTO_WEBHOOK_SECRET','enabled') RETURNING id",
      [tenantId]);
    const generic = new PostgresProductBillingAuthorityRepository();
    await generic.configureRoute(tenantId, productId, gateway.rows[0].id);
    const gymId = randomUUID();
    const input = {tenantId, productId, externalTenantId:gymId, planCode:code, payloadHash:"ci-same-payload"};
    const first = await generic.prepareSubscriptionInvoice({...input,idempotencyKey:randomUUID()});
    const results = await Promise.all([generic.prepareSubscriptionInvoice({...input,idempotencyKey:randomUUID()}),
      generic.prepareSubscriptionInvoice({...input,idempotencyKey:randomUUID()})]);
    expect(results.every(x => x.invoiceId===first.invoiceId && x.subscriptionId===first.subscriptionId && x.idempotentReplay)).toBe(true);
    const counts = await pool.query("SELECT count(*)::int AS n FROM fmcc_billing_invoice WHERE tenant_id=$1", [tenantId]);
    expect(counts.rows[0].n).toBe(1);
    await pool.query("UPDATE fmcc_billing_invoice SET amount_minor=amount_minor+1 WHERE id=$1", [first.invoiceId]);
    await expect(generic.prepareSubscriptionInvoice({...input,idempotencyKey:randomUUID()})).rejects.toThrow("billing.subscription_exists");
    await pool.query("UPDATE fmcc_billing_invoice SET amount_minor=amount_minor-1 WHERE id=$1", [first.invoiceId]);
    await pool.query("UPDATE fmcc_billing_subscription SET status='active' WHERE id=$1", [first.subscriptionId]);
    await expect(generic.prepareSubscriptionInvoice({...input,idempotencyKey:randomUUID()})).rejects.toThrow("billing.subscription_exists");
    const second = await generic.prepareSubscriptionInvoice({...input,externalTenantId:randomUUID(),idempotencyKey:randomUUID()});
    expect(second.invoiceId).not.toBe(first.invoiceId);
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
