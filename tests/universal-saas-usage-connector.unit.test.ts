import { describe, expect, it, vi } from "vitest";
import type { ConnectorContext, SourceDefinition } from "@/domain/integration/contracts";
import {
  UNIVERSAL_SAAS_SCHEMA_VERSION, UNIVERSAL_SAAS_SOURCE_TYPE, UNIVERSAL_SAAS_USAGE_PATH,
  isValidSaasSlug, universalSaasSecretRef,
} from "@/domain/integration/universal-saas-contract";
import {
  UniversalSaasUsageConnector, parseUniversalSaasUsage,
} from "@/infrastructure/integration/universal-saas-usage-connector";
import {
  SAAS_ADAPTER_PROFILES, availableSaasProfiles, sourceMatchesAdapter,
} from "@/application/integration/saas-adapter-profiles";
import { buildSaasAdapterPreflight } from "@/application/integration/saas-adapter-preflight";

const tenant = "fm-corporate";
const slug = "gym-pro";
const productId = "product-111";
const context: ConnectorContext = {
  tenantId: tenant, correlationId: "cor-001", timeoutMs: 1200,
};
const source: SourceDefinition = {
  id: "source-111", name: "Gym Pro Usage", productId, tenantId: tenant,
  sourceType: UNIVERSAL_SAAS_SOURCE_TYPE,
  authoritativeDomain: "operational", mappingVersion: UNIVERSAL_SAAS_SOURCE_TYPE,
  status: "configured", syncMode: "pull", secretRef: universalSaasSecretRef(slug),
  config: { baseUrl: "https://api.gym-pro.example", productSlug: slug },
};
const env = {
  FMCC_SAAS_GYM_PRO_CONTROL_TOKEN: "x".repeat(40),
  FMCC_SAAS_GYM_PRO_COMMAND_TENANT_ID: tenant,
  FMCC_SAAS_GYM_PRO_ALLOWED_ORIGINS: "https://api.gym-pro.example",
} as Record<string,string>;
const readEnv = (key: string) => env[key];

function envelope() {
  return {
    schemaVersion: UNIVERSAL_SAAS_SCHEMA_VERSION, productId, productSlug: slug,
    commandTenantId: tenant, correlationId: context.correlationId,
    authority: "saas-runtime", observedAt: "2026-11-06T13:01:00Z",
    dangerousFinancialPayload: { mrr: 999999, secret: "DO_NOT_INGEST" },
    snapshots: [
      { externalTenantRef: "tenant-1", periodStart: "2026-11-01T00:00:00Z",
        periodEnd: "2026-11-30T23:59:59Z", customerName: "NEVER_INGEST_CUSTOMER",
        metrics: [
          { metricId: "fiscal.documents_authorized", unit: "count", quantity: 17, limitStatus: "bounded", limit: 1000 },
          { metricId: "ai.tokens_input", unit: "tokens", quantity: 12000, limitStatus: "unknown", limit: null },
        ],
      },
    ],
  };
}
const expected = { correlationId: context.correlationId, tenantId: tenant, productId, productSlug: slug };
function mockFetch(payload: unknown = envelope(), status = 200) {
  return vi.fn(async (_url?: string, _init?: RequestInit) =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }));
}

describe("Universal SaaS C08 — signed-scope contract without billing authority", () => {
  it("generates per-product token refs; rejects invalid product slugs", () => {
    expect(universalSaasSecretRef("nfcore")).toBe("env:FMCC_SAAS_NFCORE_CONTROL_TOKEN");
    expect(universalSaasSecretRef("gym-pro")).toBe("env:FMCC_SAAS_GYM_PRO_CONTROL_TOKEN");
    expect(isValidSaasSlug("gym-pro")).toBe(true);
    for (const invalid of ["../nfcore", "my_app", "UPPER", "a--b", "localhost:443", ""]) {
      expect(isValidSaasSlug(invalid)).toBe(false);
    }
  });

  it("accepts bounded usage and preserves no PII, price, invoice or customer identity", () => {
    const result = parseUniversalSaasUsage(envelope(), expected);
    expect(result.facts).toHaveLength(1);
    expect(result.cursor).toMatch(/^[a-f0-9]{64}$/);
    expect(result.facts[0].factType).toBe("saas.usage.snapshot.v1");
    const serialized = JSON.stringify(result.facts);
    expect(serialized).toContain("fiscal.documents_authorized");
    expect(serialized).toContain('"quantity":17');
    expect(serialized).not.toContain("NEVER_INGEST_CUSTOMER");
    expect(serialized).not.toContain("DO_NOT_INGEST");
    expect(serialized).not.toContain('"mrr"');
    expect(serialized).not.toContain('"billing"');
    expect(serialized).toContain("reported_not_financially_reconciled");
  });

  it("retains distinct unknown/unlimited/bounded quota semantics", () => {
    const e = envelope();
    e.snapshots[0].metrics[1].limitStatus = "unlimited";
    expect(parseUniversalSaasUsage(e, expected).facts[0].payload).toHaveProperty("metrics");
    e.snapshots[0].metrics[1].limitStatus = "unknown";
    expect(parseUniversalSaasUsage(e, expected).facts).toHaveLength(1);
    e.snapshots[0].metrics[1].limit = 1000 as unknown as null;
    expect(() => parseUniversalSaasUsage(e, expected)).toThrow("integration.universal_limit_invalid");
  });

  it("does not turn a missing source or missing observations into zero", () => {
    const value = envelope();
    value.snapshots = [];
    const result = parseUniversalSaasUsage(value, expected);
    expect(result.facts).toHaveLength(0);
    expect(result).not.toHaveProperty("total", 0);
  });

  it("rejects forged tenant, product identity, correlation and schema", () => {
    for (const changed of [
      { commandTenantId: "other" }, { productId: "foreign" },
      { productSlug: "wrong" }, { correlationId: "other" },
      { schemaVersion: "unknown/v1" }, { authority: "billing" },
    ]) expect(() => parseUniversalSaasUsage({ ...envelope(), ...changed }, expected)).toThrow();
  });

  it("rejects duplicates, invalid counters, tokens and malformed periods", () => {
    const duplicate = envelope();duplicate.snapshots.push({ ...duplicate.snapshots[0] });
    expect(() => parseUniversalSaasUsage(duplicate, expected)).toThrow("integration.universal_duplicate_tenant_period");
    const badCount = envelope();badCount.snapshots[0].metrics[0].quantity = -1;
    expect(() => parseUniversalSaasUsage(badCount, expected)).toThrow("integration.universal_counter_invalid");
    const badPeriod = envelope();badPeriod.snapshots[0].periodStart = "2026-12-01T00:00:00Z";
    expect(() => parseUniversalSaasUsage(badPeriod, expected)).toThrow("integration.universal_period_invalid");
    const badTenant = envelope();badTenant.snapshots[0].externalTenantRef = "client@pii.example";
    expect(() => parseUniversalSaasUsage(badTenant, expected)).toThrow("integration.universal_external_tenant_invalid");
  });

  it("uses exact allowlisted HTTPS origin, per-product env and no redirects", async () => {
    const fetcher = mockFetch();
    const connector = new UniversalSaasUsageConnector(fetcher as unknown as typeof fetch, readEnv);
    const first = await connector.pull(context, source);
    expect(first.facts).toHaveLength(1);
    const second = await connector.pull(context, source, first.nextCursor);
    expect(second.facts).toHaveLength(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url,init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.gym-pro.example" + UNIVERSAL_SAAS_USAGE_PATH);
    expect(init.redirect).toBe("error");
    expect((init.headers as Record<string,string>).authorization).toBe("Bearer " + "x".repeat(40));
  });

  it("rejects a foreign tenant, slug change, unapproved host and secret-ref spoofing before fetch", async () => {
    const fetcher = mockFetch();
    const c = new UniversalSaasUsageConnector(fetcher as unknown as typeof fetch, readEnv);
    await expect(c.pull({ ...context, tenantId: "wrong" }, source)).rejects.toThrow();
    await expect(c.pull(context, { ...source, config: { ...source.config, productSlug: "nfcore" } })).rejects.toThrow();
    await expect(c.pull(context, { ...source, secretRef: "env:FMCC_KORDENA_TOKEN" })).rejects.toThrow();
    await expect(c.pull(context, { ...source, config: { ...source.config, baseUrl: "https://evil.example" } })).rejects.toThrow();
    await expect(c.pull(context, { ...source, config: { ...source.config, baseUrl: "http://api.gym-pro.example" } })).rejects.toThrow();
    await expect(c.pull(context, { ...source, config: { ...source.config, baseUrl: "https://api.gym-pro.example/path" } })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed if env does not contain an exact dedicated token, tenant or allowlist", async () => {
    const c = new UniversalSaasUsageConnector(mockFetch() as unknown as typeof fetch, () => undefined);
    expect(await c.health(context, source)).toBe("unavailable");
    await expect(c.pull(context, source)).rejects.toThrow("integration.universal_runtime_unconfigured");
  });

  it("bounds large responses and uses one deadline across headers and body", async () => {
    const tooLarge = mockFetch({ ...envelope(), padding: "x".repeat(140000) });
    const large = new UniversalSaasUsageConnector(tooLarge as unknown as typeof fetch, readEnv);
    await expect(large.pull(context,source)).rejects.toThrow("integration.universal_response_oversized");
    const stalled = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {controller.enqueue(new TextEncoder().encode('{"schemaVersion":'));},
    }), { status: 200 }));
    const c = new UniversalSaasUsageConnector(stalled as unknown as typeof fetch, readEnv);
    await expect(c.pull({ ...context, timeoutMs: 150 }, source))
      .rejects.toThrow("integration.universal_timeout");
  });

  it("advertises existing specialized adapters and one universal adapter per active SaaS", () => {
    const profiles = availableSaasProfiles([
      { slug: "nfcore", status: "active" }, { slug: "gym-pro", status: "active" },
      { slug: "gym-pro", status: "active" }, { slug: "inactive", status: "archived" },
    ]);
    expect(SAAS_ADAPTER_PROFILES).toHaveLength(3);
    expect(profiles.filter(p => p.sourceType === UNIVERSAL_SAAS_SOURCE_TYPE)).toHaveLength(2);
    const generic = profiles.find(p => p.productSlug === "gym-pro");
    expect(generic?.secretRef).toBe(universalSaasSecretRef("gym-pro"));
    expect(sourceMatchesAdapter(source, generic!)).toBe(true);
    expect(sourceMatchesAdapter({ ...source, config: { ...source.config, productSlug:"other" } }, generic!)).toBe(false);
  });

  it("preflight accepts both NFCore specialized and universal sources for SAME product", () => {
    const profiles = availableSaasProfiles([{ slug: "nfcore", status: "active" }]);
    const p = { id:"nf-id",tenantId:tenant,name:"NFCore",slug:"nfcore",status:"active" as const,
      category:"saas" as const,createdAt:new Date(),updatedAt:new Date() };
    const universalSource: SourceDefinition = {
      ...source, id:"u-1", productId:"nf-id",
      name:"NFCore Usage",secretRef:universalSaasSecretRef("nfcore"),
      config: {baseUrl:"https://api.nfcore.example",productSlug:"nfcore"},
    };
    const nativeProfile = profiles.find(x=>x.productSlug==="nfcore"&&x.sourceType!=="fmcc-saas-usage-v1")!;
    const nativeSource: SourceDefinition = {
      ...source, id:"native", productId:"nf-id",
      sourceType:nativeProfile.sourceType,authoritativeDomain:nativeProfile.authoritativeDomain,
      secretRef:nativeProfile.secretRef,mappingVersion:nativeProfile.mappingVersion,
      config:{baseUrl:"https://api.nfcore.example"},
    };
    const result = buildSaasAdapterPreflight(tenant,[p] as never,[nativeSource,universalSource],profiles);
    expect(result.rows.map(x=>x.status)).toEqual(["local_contract_ready","local_contract_ready"]);
    expect(result.rows.every(x=>x.authenticatedSaasE2eCertified===false)).toBe(true);
  });
});
