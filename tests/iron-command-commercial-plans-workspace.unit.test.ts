import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseIronCommercialAmount } from "../src/domain/billing/iron-commercial-price-input";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Command C01 — IRON commercial plan workspace", () => {
  it("parses BRL amounts strictly into centavos without rounding or invented prices", () => {
    expect(parseIronCommercialAmount("269,00")).toBe(26900);
    expect(parseIronCommercialAmount("269.9")).toBe(26990);
    expect(parseIronCommercialAmount("0,01")).toBe(1);
    for (const value of ["0", "0,00", "-1", "1.234,00", "10.999", "1e6", "", "NaN", "Infinity"]) {
      expect(parseIronCommercialAmount(value)).toBeNull();
    }
  });

  it("keeps historical IRON prices immutable under concurrent same-code attempts", () => {
    const repo = source("src/infrastructure/billing/postgres-product-billing-authority-repository.ts");
    expect(repo).toContain("product.slug === FMCC_IRON_PRODUCT_SLUG");
    expect(repo).toContain("insertPlan.onConflictDoNothing");
    expect(repo).toContain("billing.iron_plan_code_immutable");
    expect(repo).toContain("onConflictDoUpdate");
    expect(repo).toContain("slug: productDefinitions.slug");
  });

  it("uses real FM billing API with server-side permissions, step-up and inactive registration", () => {
    const page = source("src/app/dashboard/products/[productId]/billing/page.tsx");
    const form = source("src/app/dashboard/products/[productId]/billing/iron-commercial-plan-create-form.tsx");
    const api = source("src/app/api/billing/products/[productId]/plans/route.ts");
    expect(page).toContain("product.slug === FMCC_IRON_PRODUCT_SLUG");
    expect(page).toContain('roleHasPermission(context.role,"billing:write")');
    expect(form).toContain('status: "inactive"');
    expect(form).toContain('/plans`');
    expect(form).toContain("existingCodes.includes(planCode)");
    expect(form).toContain('type="password"');
    expect(api).toContain("verifyPasswordStepUp");
    expect(api).toContain('context.role !== "owner" && context.role !== "admin"');
    expect(api).toContain('service.listPlans(context, productId)');
    expect(api).not.toContain("clientSecret");
  });

  it("permits safe plan-version binding for inactive drafts without activating payment", () => {
    const repo = source("src/infrastructure/billing/postgres-iron-plan-mapping-repository.ts");
    const billing = source("src/infrastructure/billing/postgres-product-billing-authority-repository.ts");
    expect(repo).toContain('plan.status !== "inactive" && plan.status !== "active"');
    expect(repo).toContain("appendIronPlanMapping(source.config, input)");
    expect(billing).toContain('eq(billingProductPlans.status, "active")');
    expect(billing).toContain("resolveIronPlanMapping(sources[0].config, plan.planCode)");
  });

  it("reads canonical IRON mapping without exposing an unvalidated entitlement write button", () => {
    const panel = source("src/app/dashboard/products/[productId]/billing/iron-commercial-plans-panel.tsx");
    const page = source("src/app/dashboard/products/[productId]/billing/page.tsx");
    expect(page).toContain("PostgresIronPlanMappingRepository");
    expect(page).toContain("ironSources.length === 1");
    expect(panel).toContain("mappingAvailable");
    expect(panel).toContain("mappings.map");
    expect(panel).not.toContain("/tenant/configurations");
    expect(panel).not.toContain('iron-plan-mappings`, { method: "POST"');
  });
});
