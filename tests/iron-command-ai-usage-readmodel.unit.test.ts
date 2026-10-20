import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  IRON_COMMERCIAL_SOURCE_TYPE, IRON_COMMERCIAL_SECRET_REF,
  IronCommercialConnector,
} from "@/infrastructure/integration/iron-commercial-connector";

const source = {
  id: "iron-source", tenantId: "fm", productId: "iron", name: "IRON FIT CORE Commercial",
  sourceType: IRON_COMMERCIAL_SOURCE_TYPE, authoritativeDomain: "commercial",
  status: "configured" as const, syncMode: "pull" as const,
  secretRef: IRON_COMMERCIAL_SECRET_REF,
  config: { baseUrl: "https://iron.example.test" },
  freshnessSeconds: 300, mappingVersion: "iron-commercial-v1",
};
const context = { tenantId: "fm", correlationId: "corr-iron", timeoutMs: 5000 };
const valid = {
  schema_version: "iron.fmcc.ai-usage.v1", product_code: "IRON_FIT_CORE",
  metric: "ai_execution_trace_count",
  as_of: "2026-10-19T17:00:00.000Z", window_start: "2026-09-19T17:00:00.000Z",
  window_days: 30,
  unavailable_metrics: ["input_tokens", "output_tokens", "provider_cost_minor"],
  usage: [{
    tenant_id: "gym-1", capability: "WORKOUT_GENERATION", provider_code: "null_provider",
    model_code: "offline", status: "UNAVAILABLE", execution_count: 2,
  }],
};
const connector = (fetcher: typeof fetch) => new IronCommercialConnector(
  () => "s".repeat(40), fetcher, () => ["https://iron.example.test"], () => "fm",
);
describe("Command C07 — canonical IRON AI usage read model", () => {
  it("reads authenticated usage counts without fabricating token or financial measurements", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(valid), { status: 200 }));
    const value = await connector(fetcher as typeof fetch).aiUsage(context, source);
    expect(value.usage[0].execution_count).toBe(2);
    expect(value.usage[0].status).toBe("UNAVAILABLE");
    expect(value.unavailable_metrics).toContain("provider_cost_minor");
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe("https://iron.example.test/api/v1/control-plane/fmcc/usage/ai?days=30");
    expect((calls[0][1].headers as Headers).get("authorization")).toBe("Bearer " + "s".repeat(40));
  });
  it("rejects fabricated metrics, malformed counts and foreign-tenant service access", async () => {
    for (const payload of [
      { ...valid, schema_version: "unknown" },
      { ...valid, unavailable_metrics: [] },
      { ...valid, usage: [{ ...valid.usage[0], execution_count: -1 }] },
    ]) {
      const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
      await expect(connector(fetcher as typeof fetch).aiUsage(context, source))
        .rejects.toThrow("integration.iron_ai_usage_contract_invalid");
    }
    const fetcher = vi.fn(async () => new Response(JSON.stringify(valid), { status: 200 }));
    await expect(connector(fetcher as typeof fetch).aiUsage({ ...context, tenantId: "other" }, source))
      .rejects.toThrow("integration.iron_control_tenant_denied");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("limits UI to IRON product, FM financial readers and truthful missing-data state", () => {
    const page = readFileSync("src/app/dashboard/products/[productId]/usage/page.tsx", "utf8");
    expect(page).toContain("product.slug !== FMCC_IRON_PRODUCT_SLUG");
    expect(page).toContain('roleHasPermission(context.role, "billing:read")');
    expect(page).toContain('context.role !== "owner" && context.role !== "admin"');
    expect(page).toContain("matches.length === 1");
    expect(page).toContain("Indisponível");
    expect(page).not.toContain("provider_cost_minor /");
  });
});
