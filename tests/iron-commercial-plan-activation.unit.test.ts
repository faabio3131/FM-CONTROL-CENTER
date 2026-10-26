import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  IronCommercialPlanActivationError,
  assertIronCommercialPlanActivation,
  parseIronPlanActivationInput,
} from "@/domain/billing/iron-commercial-plan-activation";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const input = {
  commercialPlanCode: "IRON_MONTHLY_2026_5",
  expectedAmountMinor: 19990,
  expectedIronPlanCode: "IRON_CORE_PRO",
  expectedIronPlanVersion: 3,
  expectedMappingRevision: 2,
};
const plan = { planCode: "IRON_MONTHLY_2026_5", amountMinor: 19990, currency: "BRL", status: "inactive" };
const mapping = { revision: 2, commercialPlanCode: "IRON_MONTHLY_2026_5",
  ironPlanCode: "IRON_CORE_PRO", ironPlanVersion: 3, effectiveFrom: "2026-10-19T12:00:00Z" };
const published = { planCode: "IRON_CORE_PRO", displayName: "IRON Pro",
  version: 3, publishedAt: "2026-10-19T12:00:00.000Z" };

describe("IRON / FMCC — governança de ativação comercial", () => {
  it("accepts only exact safe integer BRL input and an immutable published-plan fingerprint", () => {
    expect(parseIronPlanActivationInput(input)).toEqual(input);
    for (const bad of [
      null, [], {}, { ...input, commercialPlanCode: "../BAD" },
      { ...input, expectedAmountMinor: 199.9 }, { ...input, expectedAmountMinor: -1 },
      { ...input, expectedAmountMinor: Number.MAX_SAFE_INTEGER + 1 },
      { ...input, expectedIronPlanCode: "not_canonical" },
      { ...input, expectedIronPlanVersion: 0 },
      { ...input, expectedMappingRevision: 0 },
    ]) expect(() => parseIronPlanActivationInput(bad)).toThrow(IronCommercialPlanActivationError);
  });

  it("accepts a valid inactive draft; an already active offer is only idempotent", () => {
    expect(() => assertIronCommercialPlanActivation(input, plan, mapping, published)).not.toThrow();
    expect(() => assertIronCommercialPlanActivation(input, { ...plan, status: "active" }, mapping, published)).not.toThrow();
    expect(() => assertIronCommercialPlanActivation(input, { ...plan, status: "cancelled" }, mapping, published))
      .toThrow("billing.iron_activation_plan_state_invalid");
  });

  it("fails closed if price/currency changed since human review", () => {
    for (const changed of [
      { ...plan, amountMinor: 29990 }, { ...plan, currency: "USD" },
      { ...plan, planCode: "OTHER" },
    ]) expect(() => assertIronCommercialPlanActivation(input, changed, mapping, published))
      .toThrow("billing.iron_activation_price_changed");
  });

  it("fails closed if mapping revision or canonical plan identity changed", () => {
    for (const changed of [
      { ...mapping, revision: 3 },
      { ...mapping, ironPlanVersion: 4 },
      { ...mapping, ironPlanCode: "IRON_CORE_BASIC" },
      { ...mapping, commercialPlanCode: "OTHER" },
    ]) expect(() => assertIronCommercialPlanActivation(input, plan, changed, published))
      .toThrow("billing.iron_activation_mapping_changed");
  });

  it("rejects missing/invalid published authority even when local mapping exists", () => {
    for (const changed of [
      { ...published, version: 4 },
      { ...published, planCode: "IRON_CORE_BASIC" },
      { ...published, publishedAt: "invalid" },
      { ...published, displayName: " " },
    ]) expect(() => assertIronCommercialPlanActivation(input, plan, mapping, changed))
      .toThrow("billing.iron_activation_published_version_unverified");
  });

  it("requires owner/admin, billing:write, explicit approval and password step-up at the real POST boundary", () => {
    const route = source("src/app/api/billing/products/[productId]/iron-plan-mappings/activate/route.ts");
    expect(route).toContain('requirePermission(context, "billing:write")');
    expect(route).toContain('context.role !== "owner" && context.role !== "admin"');
    expect(route).toContain('payload.approval !== "ATIVAR"');
    expect(route).toContain("verifyPasswordStepUp");
    expect(route).toContain("proof.userId !== context.userId");
    expect(route).toContain("new IronCommercialConnector().publishedPlanVersions");
    expect(route).toContain("catalog.truncated");
    expect(route).toContain("activateCommercialPlan(");
    expect(route).toContain('action: "billing.iron_commercial_plan.activate"');
    expect(route).not.toContain("subscriptionCommand(");
    expect(route).not.toContain("asaas");
  });

  it("serializes activation against invoice preparation and validates before DB mutation", () => {
    const repo = source("src/infrastructure/billing/postgres-iron-plan-mapping-repository.ts");
    const billing = source("src/infrastructure/billing/postgres-product-billing-authority-repository.ts");
    const activation = repo.slice(repo.indexOf("async activateCommercialPlan("));
    expect(activation).toContain("fmcc.billing.plan-map.v1");
    expect(billing).toContain("fmcc.billing.plan-map.v1");
    expect(activation).toContain("pg_advisory_xact_lock");
    expect(activation).toContain('for("update", { of: sourceDefinitions })');
    expect(activation).toContain('for("update", { of: billingProductPlans })');
    expect(activation.indexOf("assertIronCommercialPlanActivation("))
      .toBeLessThan(activation.indexOf("tx.update(billingProductPlans)"));
    expect(activation).toContain('eq(billingProductPlans.status, "inactive")');
    expect(activation).toContain('source.productSlug !== FMCC_IRON_PRODUCT_SLUG');
    expect(activation).toContain("if (plan.status === \"active\")");
  });

  it("prevents direct generic plan POST from bypassing the governed activation", () => {
    const repo = source("src/infrastructure/billing/postgres-product-billing-authority-repository.ts");
    const form = source("src/app/dashboard/products/[productId]/billing/iron-commercial-plan-create-form.tsx");
    expect(repo).toContain('product.slug === FMCC_IRON_PRODUCT_SLUG && input.status !== "inactive"');
    expect(repo).toContain('billing.iron_plan_requires_inactive_draft');
    expect(form).toContain('status: "inactive"');
  });

  it("requires human review in the real commercial panel and does not promise checkout", () => {
    const panel = source("src/app/dashboard/products/[productId]/billing/iron-commercial-plans-panel.tsx");
    const form = source("src/app/dashboard/products/[productId]/billing/iron-commercial-plan-activation-form.tsx");
    expect(panel).toContain("<IronCommercialPlanActivationForm");
    expect(form).toContain('approval !== "ATIVAR"');
    expect(form).toContain('type="password"');
    expect(form).toContain('expectedMappingRevision: mapping.revision');
    expect(form).toContain('expectedAmountMinor: plan.amountMinor');
    expect(form).toContain('/iron-plan-mappings/activate');
    expect(form).toContain("router.refresh()");
    expect(form).not.toContain("/api/billing/checkout");
  });
});
