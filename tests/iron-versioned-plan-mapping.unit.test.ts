import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  IRON_PLAN_MAPPING_SCHEMA,
  IronPlanMappingError,
  appendIronPlanMapping,
  assertIronPlanMappingRegistrationState,
  readIronPlanMappings,
  resolveIronPlanMapping,
} from "@/domain/billing/iron-versioned-plan-mapping";

const first = { commercialPlanCode: "IRON_MONTHLY_2026_1", ironPlanCode: "IRON_CORE_PRO", ironPlanVersion: 3 };

describe("D11 immutable Command → IRON versioned entitlement mapping", () => {
  it("creates a durable revision and replays the exact same mapping idempotently", () => {
    const created = appendIronPlanMapping({ baseUrl: "https://iron.example.test" }, first);
    expect(created.created).toBe(true);
    expect(created.mapping).toMatchObject({ ...first, revision: 1 });
    expect(new Date(created.mapping.effectiveFrom).getTime()).toBeLessThanOrEqual(Date.now());
    expect(readIronPlanMappings(created.config)).toHaveLength(1);
    expect(resolveIronPlanMapping(created.config, first.commercialPlanCode)).toEqual(created.mapping);
    const replay = appendIronPlanMapping(created.config, first);
    expect(replay.created).toBe(false);
    expect(replay.mapping).toEqual(created.mapping);
  });

  it("never rewrites an old mapping; a new IRON version requires a new commercial plan code", () => {
    const original = appendIronPlanMapping({}, first);
    expect(() => appendIronPlanMapping(original.config, {
      ...first, ironPlanVersion: 4,
    })).toThrow("billing.iron_plan_mapping_immutable");
    const next = appendIronPlanMapping(original.config, {
      commercialPlanCode: "IRON_MONTHLY_2026_2",
      ironPlanCode: first.ironPlanCode,
      ironPlanVersion: 4,
    });
    expect(next.mapping.revision).toBe(2);
    expect(readIronPlanMappings(next.config)[0]).toEqual(original.mapping);
  });

  it("fails closed on missing, corrupt, duplicate or tampered source configuration", () => {
    expect(() => resolveIronPlanMapping({}, first.commercialPlanCode))
      .toThrow("billing.iron_plan_mapping_unavailable");
    expect(() => readIronPlanMappings({ ironCommercialPlanMappings: { schemaVersion: "wrong", mappings: [] } }))
      .toThrow(IronPlanMappingError);
    const original = appendIronPlanMapping({}, first);
    const record = original.config.ironCommercialPlanMappings as { schemaVersion: string; mappings: unknown[] };
    expect(record.schemaVersion).toBe(IRON_PLAN_MAPPING_SCHEMA);
    expect(() => readIronPlanMappings({ ironCommercialPlanMappings: {
      schemaVersion: IRON_PLAN_MAPPING_SCHEMA,
      mappings: [...record.mappings, record.mappings[0]],
    } })).toThrow("billing.iron_plan_mapping_invalid");
    expect(() => readIronPlanMappings({ ironCommercialPlanMappings: {
      schemaVersion: IRON_PLAN_MAPPING_SCHEMA,
      mappings: [{ ...original.mapping, ironPlanVersion: 0 }],
    } })).toThrow("billing.iron_plan_mapping_invalid");
  });

  it("rejects new mapping for active FM plan but retains existing immutable replay", () => {
    expect(() => assertIronPlanMappingRegistrationState("inactive", true)).not.toThrow();
    expect(() => assertIronPlanMappingRegistrationState("active", true))
      .toThrow("billing.iron_mapping_requires_inactive_draft");
    expect(() => assertIronPlanMappingRegistrationState("active", false)).not.toThrow();
    expect(() => assertIronPlanMappingRegistrationState("inactive", false)).not.toThrow();
    for (const status of ["cancelled", "unknown", ""]) {
      expect(() => assertIronPlanMappingRegistrationState(status, false))
        .toThrow("billing.iron_mapping_requires_inactive_draft");
    }
  });

  it("registers under the existing source lock and validates draft state before writing", async () => {
    const source = await readFile("src/infrastructure/billing/postgres-iron-plan-mapping-repository.ts", "utf8");
    // Scope the ordering guard to register(): the batch publisher also writes
    // sourceDefinitions, under its own lock and validation.
    const register = source.slice(source.indexOf("  async register("), source.indexOf("  async retireUnboundVersion("));
    const lock = register.indexOf('for("update", { of: sourceDefinitions })');
    const assertion = register.indexOf("assertIronPlanMappingRegistrationState(plan.status, result.created)");
    const write = register.indexOf("await tx.update(sourceDefinitions).set");
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(assertion).toBeGreaterThan(lock);
    expect(write).toBeGreaterThan(assertion);
  });

  it("guards batch publication with the same mapping lock, draft check and activation check before writes", async () => {
    const source = await readFile("src/infrastructure/billing/postgres-iron-plan-mapping-repository.ts", "utf8");
    const batch = source.slice(source.indexOf("  async publishFourTiers("), source.indexOf("  async list("));
    const lock = batch.indexOf('for("update",{of:sourceDefinitions})');
    const provider = batch.indexOf("if(!verifyOffer(");
    const assertion = batch.indexOf("assertIronPlanMappingRegistrationState(plan.status,mappingResult.created)");
    const activation = batch.indexOf("assertIronCommercialPlanActivation({");
    const planWrite = batch.indexOf("await tx.update(billingProductPlans)");
    const mappingWrite = batch.indexOf("await tx.update(sourceDefinitions).set");
    expect(batch).toContain("fmcc.billing.plan-map.v1");
    expect(batch).toContain("pg_advisory_xact_lock");
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(provider).toBeGreaterThan(lock);
    expect(assertion).toBeGreaterThan(provider);
    expect(activation).toBeGreaterThan(assertion);
    expect(planWrite).toBeGreaterThan(activation);
    expect(mappingWrite).toBeGreaterThan(planWrite);
  });

  it("binds mapping registration and invoice preparation through the same PostgreSQL lock", async () => {
    const mapRepository = await readFile("src/infrastructure/billing/postgres-iron-plan-mapping-repository.ts", "utf8");
    const invoiceRepository = await readFile("src/infrastructure/billing/postgres-product-billing-authority-repository.ts", "utf8");
    for (const file of [mapRepository, invoiceRepository]) {
      expect(file).toContain("fmcc.billing.plan-map.v1");
      expect(file).toContain("pg_advisory_xact_lock");
    }
    expect(mapRepository).toContain('for("update", { of: sourceDefinitions })');
    expect(invoiceRepository).toContain('resolveIronPlanMapping(');
  });

  it("uses existing Integration Fabric persistence and requires FM billing step-up", async () => {
    const api = await readFile("src/app/api/billing/products/[productId]/iron-plan-mappings/route.ts", "utf8");
    const repo = await readFile("src/infrastructure/billing/postgres-iron-plan-mapping-repository.ts", "utf8");
    expect(api).toContain("verifyPasswordStepUp");
    expect(api).toContain('requirePermission(context, "billing:write")');
    expect(api).toContain('context.role !== "owner" && context.role !== "admin"');
    expect(repo).toContain("sourceDefinitions.config");
    expect(repo).not.toContain("userPassword");
    expect(api).not.toMatch(/input\.amountMinor|input\.gatewayAccountId|input\.externalTenantId/);
  });
});
