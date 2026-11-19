import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  IRON_COMMERCIAL_SECRET_REF, IRON_COMMERCIAL_SOURCE_TYPE,
  IronCommercialConnector, parseIronPlanGovernanceCatalog,
} from "@/infrastructure/integration/iron-commercial-connector";

const source = {
  id: "source-iron", tenantId: "fm-tenant", productId: "product-iron",
  name: "IRON FIT CORE Commercial", sourceType: IRON_COMMERCIAL_SOURCE_TYPE,
  authoritativeDomain: "commercial", status: "configured" as const,
  syncMode: "pull" as const, secretRef: IRON_COMMERCIAL_SECRET_REF,
  config: { baseUrl: "https://iron.example.test" }, freshnessSeconds: 300,
  mappingVersion: "iron-commercial-v1",
};
const context = { tenantId: "fm-tenant", correlationId: "corr-plan-governance", timeoutMs: 5000 };
const planId = "d34ad798-7b7c-4b35-9e1a-f764293a9ed8";
const valid = {
  schema_version: "iron.fmcc.plan-governance.v1", product_code: "IRON_FIT_CORE",
  plans: [{ id: planId, code: "IRON_V1", name: "IRON V1", versions: [{
    version: 2, status: "DRAFT", entitlements: [
      {featureKey:"ai.workout_monthly_max",kind:"LIMIT",featureEnabled:null,limitValue:300,policyValues:null},
    ],
  }] }],
  capabilities: [{ key:"ai.workout_monthly_max",kind:"LIMIT",domain:"AI",
    description:"Limite mensal de geração de treinos",status:"ACTIVE",allowedPolicyValues:null }],
};
const resolve = (ref: string) => ref === IRON_COMMERCIAL_SECRET_REF
  ? "billing-readback-credential-123456789012"
  : ref === "env:FMCC_IRON_PLAN_GOVERNANCE_TOKEN"
  ? "plan-governance-credential-123456789012" : undefined;

describe("IRON plan governance is a distinct FM authority with real canonical readback", () => {
  it("rejects invalid, duplicated, or ambiguous IRON plan and capability read models", () => {
    expect(parseIronPlanGovernanceCatalog(valid).plans[0]?.versions[0]?.status).toBe("DRAFT");
    expect(() => parseIronPlanGovernanceCatalog({...valid,product_code:"KORDENA"})).toThrow();
    expect(() => parseIronPlanGovernanceCatalog({...valid, plans:[valid.plans[0],valid.plans[0]]})).toThrow();
    expect(() => parseIronPlanGovernanceCatalog({...valid, capabilities:[valid.capabilities[0],valid.capabilities[0]]})).toThrow();
    expect(() => parseIronPlanGovernanceCatalog({...valid, plans:[{ ...valid.plans[0],id:"invented" }]})).toThrow();
  });

  it("uses separate token, exact allowed HTTPS origin, no redirects, and never sends password or paid license", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(valid), {status:200}));
    const client = new IronCommercialConnector(resolve, fetcher as typeof fetch,
      () => ["https://iron.example.test"], () => "fm-tenant");
    const result = await client.governanceCatalog(context,source);
    expect(result.plans[0]?.code).toBe("IRON_V1");
    await client.governPlan(context,source,"setEntitlement",planId,2,
      {featureKey:"ai.workout_monthly_max",limitValue:500});
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toContain("/api/v1/control-plane/fmcc/plan-governance/catalog");
    expect(calls[1]?.[0]).toContain("/api/v1/control-plane/fmcc/plan-governance/plans/");
    expect(calls[1]?.[1].method).toBe("PUT");
    for (const [, init] of calls) {
      expect(init.redirect).toBe("error");
      expect(init.cache).toBe("no-store");
      const headers = init.headers as Headers;
      expect(headers.get("authorization")).toBe("Bearer plan-governance-credential-123456789012");
      expect(headers.get("x-correlation-id")).toBe(context.correlationId);
      expect(JSON.stringify(init.body ?? "")).not.toMatch(/password|gateway|subscription/);
    }
  });

  it("blocks missing/matching plan-write token, foreign tenant, untrusted origin, bad paths", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(valid), {status:200}));
    const connector = new IronCommercialConnector(
      ref => ref === IRON_COMMERCIAL_SECRET_REF ? "x".repeat(40) : undefined,
      fetcher as typeof fetch, () => ["https://iron.example.test"], () => "fm-tenant");
    await expect(connector.governanceCatalog(context, source)).rejects.toThrow("integration.iron_plan_governance_secret_unavailable");
    const matching = new IronCommercialConnector(() => "x".repeat(40),
      fetcher as typeof fetch, () => ["https://iron.example.test"], () => "fm-tenant");
    await expect(matching.governanceCatalog(context, source)).rejects.toThrow("integration.iron_plan_governance_secret_unavailable");
    const proper = new IronCommercialConnector(resolve, fetcher as typeof fetch,
      () => ["https://iron.example.test"], () => "fm-tenant");
    await expect(proper.governanceCatalog({...context,tenantId:"other"}, source)).rejects.toThrow("integration.iron_control_tenant_denied");
    await expect(proper.governPlan(context,source,"publishVersion","not-a-uuid",2)).rejects.toThrow("integration.iron_governance_plan_id_invalid");
    const badOrigin = new IronCommercialConnector(resolve, fetcher as typeof fetch,
      () => ["https://wrong.example.test"], () => "fm-tenant");
    await expect(badOrigin.governanceCatalog(context,source)).rejects.toThrow("integration.iron_origin_not_allowed");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires FM owner/admin, billing:write, password step-up and an exact confirmation to publish", () => {
    const route = readFileSync("src/app/api/billing/products/[productId]/iron-entitlements/route.ts", "utf8");
    const page = readFileSync("src/app/dashboard/products/[productId]/billing/page.tsx", "utf8");
    const ui = readFileSync("src/app/dashboard/products/[productId]/billing/iron-entitlements-governance-panel.tsx", "utf8");
    expect(route).toContain('requirePermission(context, "billing:write")');
    expect(route).toContain('requirePermission(context, "billing:read")');
    expect(route).toContain("verifyPasswordStepUp(requestHeaders, data.password)");
    expect(route).toContain('data.confirm !== "PUBLICAR_VERSAO_IMUTAVEL"');
    expect(route).toContain("source.secretRef === IRON_COMMERCIAL_SECRET_REF");
    expect(route).toContain("environmentIronControlTenantId()");
    expect(route).not.toContain("gymId");
    expect(page).toContain("<IronEntitlementsGovernancePanel");
    expect(ui).toContain("Alteração confirmada pela autoridade canônica");
    expect(ui).toContain("await refreshCatalog()");
    expect(ui).toContain("preview !== fingerprint");
    expect(ui).not.toContain("localStorage");
  });
});
