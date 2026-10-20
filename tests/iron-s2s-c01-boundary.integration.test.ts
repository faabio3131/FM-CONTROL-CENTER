import { describe, expect, it, vi } from "vitest";
import {
  IRON_COMMERCIAL_SECRET_REF,
  IRON_COMMERCIAL_SOURCE_TYPE,
  IronCommercialConnector,
  parseIronPublishedPlanCatalog,
} from "@/infrastructure/integration/iron-commercial-connector";

const tenantId = "tenant-fm";
const key = "ci-control-plane-synthetic-" + "x".repeat(40);
const source = {
  id: "iron-source",
  tenantId,
  productId: "iron",
  name: "IRON FIT CORE Commercial",
  sourceType: IRON_COMMERCIAL_SOURCE_TYPE,
  authoritativeDomain: "commercial",
  status: "configured" as const,
  syncMode: "pull" as const,
  secretRef: IRON_COMMERCIAL_SECRET_REF,
  config: { baseUrl: "https://iron-ci.example.test" },
  freshnessSeconds: 300,
  mappingVersion: "iron-commercial-v1",
};
const context = { tenantId, correlationId: "ci-c01-validated", timeoutMs: 5000 };

const published = () => ({
  schema_version: "iron.fmcc.plan-versions.v1",
  product_code: "IRON_FIT_CORE",
  source_authority: "IRON_PRODUCT_PLAN_VERSION",
  as_of: "2026-10-20T12:00:00.000Z",
  truncated: false,
  plans: [{
    plan_code: "IRON_BASIC", display_name: "Plano Básico",
    version: 1, published_at: "2026-10-19T12:00:00.000Z",
  }],
});

function client(fetcher: typeof fetch, resolver: () => string | undefined = () => key) {
  return new IronCommercialConnector(
    resolver,
    fetcher,
    () => ["https://iron-ci.example.test"],
    () => tenantId,
  );
}

describe("FMCC / IRON C01: isolated consumer-provider S2S boundary", () => {
  it("uses one server-held bearer credential and correlates a published response from the IRON contract", async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://iron-ci.example.test/api/v1/control-plane/fmcc/plan-versions");
      expect(init.method ?? "GET").toBe("GET");
      const sent = new Headers(init.headers);
      // Synthetic provider guard checks the same token and correlation contract as IRON.
      if (sent.get("authorization") !== "Bearer " + key ||
          sent.get("x-correlation-id") !== context.correlationId) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      }
      return new Response(JSON.stringify(published()), { status: 200 });
    });
    const catalog = await client(fetcher as typeof fetch).publishedPlanVersions(context, source);
    expect(catalog).toEqual(parseIronPublishedPlanCatalog(published()));
    expect(catalog.plans).toEqual([{
      planCode: "IRON_BASIC", displayName: "Plano Básico",
      version: 1, publishedAt: "2026-10-19T12:00:00.000Z",
    }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails closed when upstream authorization is denied or its catalog is inconsistent", async () => {
    const forbidden = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    await expect(client(forbidden as typeof fetch).publishedPlanVersions(context, source))
      .rejects.toThrow("integration.iron_plan_catalog_unavailable");
    for (const body of [
      { ...published(), plans: [{ ...published().plans[0], published_at: null }] },
      { ...published(), plans: [{ ...published().plans[0], plan_code: "../IRON" }] },
      { ...published(), plans: [{ ...published().plans[0], version: 0 }] },
      { ...published(), plans: [published().plans[0], published().plans[0]] },
    ]) {
      const invalid = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
      await expect(client(invalid as typeof fetch).publishedPlanVersions(context, source))
        .rejects.toThrow(/integration\.iron_plan_catalog_(invalid|duplicate)/);
    }
  });

  it("does not turn an upstream 503 into an empty catalog or an authoritative zero", async () => {
    const unavailable = vi.fn(async () => new Response(
      JSON.stringify({ error: "Catalogo de planos publicados inconsistente" }), { status: 503 },
    ));
    await expect(client(unavailable as typeof fetch).publishedPlanVersions(context, source))
      .rejects.toThrow("integration.iron_upstream_retryable");
    expect(unavailable).toHaveBeenCalledTimes(1);
  });

  it("rejects foreign tenant, wrong source, missing secret and unapproved origin before contacting IRON", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(published()), { status: 200 }));
    const c = client(fetcher as typeof fetch);
    await expect(c.publishedPlanVersions({ ...context, tenantId: "tenant-foreign" }, source))
      .rejects.toThrow("integration.iron_control_tenant_denied");
    await expect(c.publishedPlanVersions(context, { ...source, tenantId: "tenant-foreign" }))
      .rejects.toThrow("integration.iron_source_scope_denied");
    await expect(c.publishedPlanVersions(context, { ...source, secretRef: "env:OTHER_TOKEN" }))
      .rejects.toThrow("integration.iron_source_scope_denied");
    await expect(client(fetcher as typeof fetch, () => undefined).publishedPlanVersions(context, source))
      .rejects.toThrow("integration.iron_service_token_unavailable");
    await expect(c.publishedPlanVersions(context, {
      ...source, config: { baseUrl: "https://untrusted.example.test" },
    })).rejects.toThrow("integration.iron_origin_not_allowed");
    await expect(c.publishedPlanVersions(context, {
      ...source, config: { baseUrl: "http://iron-ci.example.test" },
    })).rejects.toThrow("integration.iron_base_url_insecure");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
