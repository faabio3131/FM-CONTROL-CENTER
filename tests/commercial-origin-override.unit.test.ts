import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceDefinition } from "@/domain/integration/contracts";
import { commercialOriginOverride, commercialOriginOverrideEnabled } from "@/application/integration/commercial-origin-override";
import { IronCommercialConnector } from "@/infrastructure/integration/iron-commercial-connector";
import { KordenaCommercialConnector } from "@/infrastructure/integration/kordena-commercial-connector";

const iron: SourceDefinition = {
  id: "iron-source", tenantId: "fm-tenant", productId: "iron-product",
  name: "IRON FIT CORE Commercial", sourceType: "iron-commercial-v1",
  authoritativeDomain: "commercial", status: "configured", syncMode: "pull",
  secretRef: "env:FMCC_IRON_CONTROL_PLANE_TOKEN",
  mappingVersion: "iron-commercial-v1", config: { baseUrl: "https://old-iron.example.test" },
};
const kordena: SourceDefinition = {
  ...iron, id: "kordena-source", productId: "kordena-product", name: "Kordena Commercial",
  sourceType: "kordena-commercial-v1",
  secretRef: "env:FMCC_KORDENA_CONTROL_PLANE_TOKEN",
  mappingVersion: "kordena-commercial-v1", config: { baseUrl: "https://old-kordena.example.test" },
};
const settings = {
  enabled: true, controlTenantId: "fm-tenant",
  sourceType: "iron-commercial-v1",
  secretRef: "env:FMCC_IRON_CONTROL_PLANE_TOKEN",
  configuredBaseUrl: "https://api.ironfitcore.com.br",
  allowedOrigins: ["https://api.ironfitcore.com.br"],
};
const context = { tenantId: "fm-tenant", correlationId: "read-only-origin-test", timeoutMs: 1000 };

afterEach(() => vi.unstubAllEnvs());

describe("governed S2S origin correction without persistence changes", () => {
  it("is opt-in and preserves the stored source unchanged", () => {
    const before = JSON.stringify(iron);
    expect(commercialOriginOverrideEnabled(undefined)).toBe(false);
    expect(commercialOriginOverride(iron, { ...settings, enabled: false })).toBeNull();
    expect(JSON.stringify(iron)).toBe(before);
  });

  it("accepts only the allowlisted HTTPS origin for the matching canonical source", () => {
    expect(commercialOriginOverride(iron, settings)).toBe("https://api.ironfitcore.com.br");
    expect(JSON.stringify(iron.config)).toContain("old-iron.example.test");
  });

  it.each([
    { configuredBaseUrl: "http://api.ironfitcore.com.br" },
    { configuredBaseUrl: "https://user:pass@api.ironfitcore.com.br" },
    { configuredBaseUrl: "https://api.ironfitcore.com.br/prefix" },
    { configuredBaseUrl: "https://api.ironfitcore.com.br?token=secret" },
    { configuredBaseUrl: "https://api.ironfitcore.com.br:444" },
    { configuredBaseUrl: "not-a-url" },
    { configuredBaseUrl: undefined },
  ])("fails closed for an unsafe or absent runtime destination: %j", ({ configuredBaseUrl }) => {
    expect(() => commercialOriginOverride(iron, { ...settings, configuredBaseUrl })).toThrow();
  });

  it("refuses unapproved origins and does not fall back to the old destination", () => {
    expect(() => commercialOriginOverride(iron, {
      ...settings, allowedOrigins: ["https://old-iron.example.test"],
    })).toThrow("integration.commercial_origin_override_not_allowlisted");
  });

  it.each([
    { tenantId: "foreign-tenant" },
    { productId: undefined },
    { sourceType: "kordena-commercial-v1" },
    { secretRef: "env:OTHER_TOKEN" },
    { authoritativeDomain: "student-finance" },
  ])("rejects unsafe tenant/product/secret/domain scope: %j", (changes) => {
    expect(() => commercialOriginOverride({ ...iron, ...changes }, settings))
      .toThrow("integration.commercial_origin_override_scope_denied");
  });

  it("routes the IRON connector to the new URL only when explicitly enabled", async () => {
    vi.stubEnv("FMCC_IRON_CONTROL_TENANT_ID", "fm-tenant");
    vi.stubEnv("FMCC_IRON_BASE_URL", "https://api.ironfitcore.com.br");
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 }));
    const connector = new IronCommercialConnector(
      () => "x".repeat(40), fetcher as typeof fetch,
      () => ["https://old-iron.example.test", "https://api.ironfitcore.com.br"],
      () => "fm-tenant",
    );
    expect(await connector.health(context, iron)).toBe("healthy");
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://old-iron.example.test/api/v1/control-plane/fmcc/health");

    vi.stubEnv("FMCC_IRON_SOURCE_ORIGIN_OVERRIDE", "true");
    expect(await connector.health(context, iron)).toBe("healthy");
    expect(fetcher.mock.calls[1]?.[0]).toBe("https://api.ironfitcore.com.br/api/v1/control-plane/fmcc/health");
    expect(iron.config.baseUrl).toBe("https://old-iron.example.test");
  });

  it("fails closed for a misconfigured IRON override without contacting the legacy URL", async () => {
    vi.stubEnv("FMCC_IRON_CONTROL_TENANT_ID", "fm-tenant");
    vi.stubEnv("FMCC_IRON_BASE_URL", "https://untrusted.example.test");
    vi.stubEnv("FMCC_IRON_SOURCE_ORIGIN_OVERRIDE", "true");
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 }));
    const connector = new IronCommercialConnector(
      () => "x".repeat(40), fetcher as typeof fetch,
      () => ["https://old-iron.example.test"], () => "fm-tenant",
    );
    expect(await connector.health(context, iron)).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("routes the Kordena connector without changing its canonical source record", async () => {
    vi.stubEnv("FMCC_KORDENA_CONTROL_TENANT_ID", "fm-tenant");
    vi.stubEnv("FMCC_KORDENA_BASE_URL", "https://api.kordenaia.com.br");
    vi.stubEnv("FMCC_KORDENA_SOURCE_ORIGIN_OVERRIDE", "true");
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 }));
    const connector = new KordenaCommercialConnector(
      () => "x".repeat(40), fetcher as typeof fetch,
      () => ["https://api.kordenaia.com.br"], () => "fm-tenant",
    );
    expect(await connector.health(context, kordena)).toBe("healthy");
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.kordenaia.com.br/v1/control-plane/fmcc/health");
    expect(kordena.config.baseUrl).toBe("https://old-kordena.example.test");
  });
});
