import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseIronPublishedPlanCatalog,
} from "../src/infrastructure/integration/iron-commercial-connector";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const good = () => ({
  schema_version: "iron.fmcc.plan-versions.v1",
  product_code: "IRON_FIT_CORE",
  source_authority: "IRON_PRODUCT_PLAN_VERSION",
  as_of: "2026-10-20T12:00:00Z",
  truncated: false,
  plans: [{
    plan_code: "IRON_STANDARD", display_name: "IRON Standard",
    version: 2, published_at: "2026-10-19T12:00:00Z",
  }],
});

describe("FMCC ↔ IRON published plan catalog (C01)", () => {
  it("accepts only an authenticated-contract-shaped published catalog", () => {
    expect(parseIronPublishedPlanCatalog(good())).toEqual({
      plans: [{
        planCode: "IRON_STANDARD", displayName: "IRON Standard",
        version: 2, publishedAt: "2026-10-19T12:00:00Z",
      }],
      asOf: "2026-10-20T12:00:00Z", truncated: false,
    });
  });

  it("denies wrong authority, schema, code, version, duplicates and invalid dates", () => {
    for (const override of [
      { schema_version: "iron.invalid" }, { product_code: "KORDENA" },
      { source_authority: "CLIENT" }, { plans: [{...good().plans[0],version:0}] },
      { plans: [{...good().plans[0],plan_code:"../OTHER"}] },
      { plans: [{...good().plans[0],published_at:"invalid"}] },
      { plans: [good().plans[0],good().plans[0]] },
      { truncated: "false" }, { plans: new Array(257).fill(good().plans[0]) },
    ]) {
      expect(() => parseIronPublishedPlanCatalog({ ...good(), ...override })).toThrow();
    }
  });

  it("blocks writes if the IRON catalog is absent or a plan is not published", () => {
    const route = source("src/app/api/billing/products/[productId]/iron-plan-mappings/route.ts");
    const page = source("src/app/dashboard/products/[productId]/billing/page.tsx");
    const form = source("src/app/dashboard/products/[productId]/billing/iron-plan-version-binding-form.tsx");
    expect(route).toContain("new IronCommercialConnector().publishedPlanVersions");
    expect(route).toContain("catalog.truncated");
    expect(route).toContain("catalog.plans.some");
    expect(route).toContain("verifyPasswordStepUp");
    expect(route).toContain("PostgresIronPlanMappingRepository().register");
    expect(page).toContain("publishedIronPlansAvailable");
    expect(form).toContain('status === "inactive"');
    expect(form).toContain("confirmed !== fingerprint");
    expect(form).toContain("router.refresh()");
    expect(form).not.toContain("/tenant/configurations");
  });
});
