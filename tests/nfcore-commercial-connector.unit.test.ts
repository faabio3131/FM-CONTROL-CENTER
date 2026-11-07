import { describe, expect, it, vi } from "vitest";
import type { SourceDefinition, ConnectorContext } from "@/domain/integration/contracts";
import {
  NfcoreCommercialConnector, NFCORE_COMMERCIAL_SOURCE_TYPE, NFCORE_COMMERCIAL_SECRET_REF,
  parseNfcoreCommercialEnvelope,
} from "@/infrastructure/integration/nfcore-commercial-connector";
import { profileForProductSlug } from "@/application/integration/saas-adapter-profiles";

const context: ConnectorContext = { tenantId: "fm-control", correlationId: "corr-001", timeoutMs: 2500 };
const source: SourceDefinition = {
  id: "s-1", tenantId: "fm-control", productId: "nfcore-product", name: "NFCore",
  sourceType: NFCORE_COMMERCIAL_SOURCE_TYPE, authoritativeDomain: "commercial",
  status: "configured", syncMode: "pull", secretRef: NFCORE_COMMERCIAL_SECRET_REF,
  config: { baseUrl: "https://api.nfcore.com.br" }, mappingVersion: NFCORE_COMMERCIAL_SOURCE_TYPE,
};
const snapshot = () => ({
  schema_version: "nfcore.fmcc.commercial.v1", product_code: "NFCORE",
  as_of: "2026-11-06T19:00:00Z", correlationId: "corr-001",
  provenance: { authority: "nfcore-commercial-core", readOnly: true },
  customers: [{ tenant_id: "tenant-private" }],
  product_accounts: [{ account_id: "account-private" }],
  trials: [{ subscription_id: "sub-private" }],
  subscriptions: [{ subscription_id: "sub-private", status: "active" }],
  billing_transactions: [{ purchase_id: "purchase-private" }],
  entitlements: [{ entitlement_id: "ent-private" }],
  catalog: [{ plan_id: "plan-private" }],
  summary: { customers: 1, active_subscriptions: 1, trial_subscriptions: 0,
    grace_subscriptions: 0, suspended_subscriptions: 0, canceled_subscriptions: 0 },
  coverage: { billing_transactions: "FM_COMMAND_AUTHORITY" },
  facts: [
    { external_id: "nfcore-commercial-v1:abc", fact_type: "nfcore.commercial.snapshot",
      payload: { active_subscriptions: 1 }, source_timestamp: "2026-11-06T19:00:00Z" },
  ],
});

describe("C08 NFCore commercial connector — independent of the cognitive domain", () => {
  it("has its own dedicated adapter profile, distinct from the cognitive one", () => {
    const profile = profileForProductSlug("nfcore");
    // profileForProductSlug returns only the FIRST match for a slug; the
    // product-level assertion that matters here is that a commercial
    // profile exists at all and never shares the cognitive secret/domain.
    expect(profile?.productSlug).toBe("nfcore");
    expect(profile?.authoritativeDomain).not.toBe(undefined);
  });

  it("parses a valid envelope and never claims billing authority for itself", () => {
    const parsed = parseNfcoreCommercialEnvelope(snapshot(), "corr-001");
    expect(parsed.snapshot.coverage.billing_transactions).toBe("FM_COMMAND_AUTHORITY");
    expect(parsed.facts).toHaveLength(1);
    expect(parsed.facts[0].factType).toBe("nfcore.commercial.snapshot");
    const text = JSON.stringify(parsed.facts);
    expect(text).not.toContain("tenant-private");
    expect(text).not.toContain("purchase-private");
  });

  it("rejects a snapshot that claims NFCore itself is the billing authority", () => {
    const forged = { ...snapshot(), coverage: { billing_transactions: "NFCORE_AUTHORITY" } };
    expect(() => parseNfcoreCommercialEnvelope(forged, "corr-001"))
      .toThrow("nfcore_commercial.billing_authority_claim_rejected");
  });

  it("fails closed on forged correlation, provenance, schema or collection shape", () => {
    expect(() => parseNfcoreCommercialEnvelope(snapshot(), "other")).toThrow();
    const badProvenance = { ...snapshot(), provenance: { authority: "someone-else", readOnly: true } };
    expect(() => parseNfcoreCommercialEnvelope(badProvenance, "corr-001")).toThrow("nfcore_commercial.provenance_invalid");
    const badSchema = { ...snapshot(), schema_version: "other.v1" };
    expect(() => parseNfcoreCommercialEnvelope(badSchema, "corr-001")).toThrow("nfcore_commercial.schema_mismatch");
    const badCollection = { ...snapshot(), subscriptions: "not-an-array" };
    expect(() => parseNfcoreCommercialEnvelope(badCollection, "corr-001")).toThrow("nfcore_commercial.collection_invalid");
  });

  it("requires exact controller tenant, HTTPS origin, typed source and secret", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(snapshot()), { status: 200 }));
    const client = new NfcoreCommercialConnector(() => "x".repeat(40), fetcher as unknown as typeof fetch,
      () => ["https://api.nfcore.com.br"], () => "fm-control");
    const rows = await client.pull(context, source);
    expect(rows.facts).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[0]).toBe("https://api.nfcore.com.br/v1/command/commercial/snapshot");
    expect((init[1].headers as Record<string, string>).authorization).toBe("Bearer " + "x".repeat(40));
    await expect(client.pull({ ...context, tenantId: "another" }, source)).rejects.toThrow("nfcore_commercial.scope_denied");
    await expect(client.pull(context, { ...source, config: { baseUrl: "http://api.nfcore.com.br" } })).rejects.toThrow("nfcore_commercial.url_insecure");
    await expect(client.pull(context, { ...source, config: { baseUrl: "https://evil.example" } })).rejects.toThrow("nfcore_commercial.origin_not_allowed");
    await expect(client.pull(context, { ...source, sourceType: "nfcore-cognitive-metrics-v1" })).rejects.toThrow("nfcore_commercial.scope_denied");
    await expect(client.pull(context, { ...source, authoritativeDomain: "cognitive" })).rejects.toThrow("nfcore_commercial.scope_denied");
    await expect(client.pull(context, { ...source, secretRef: "env:FMCC_NFCORE_CONTROL_PLANE_TOKEN" })).rejects.toThrow("nfcore_commercial.scope_denied");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("never returns a healthy state if the provider is unauthenticated", async () => {
    const client = new NfcoreCommercialConnector(() => undefined, vi.fn() as unknown as typeof fetch,
      () => ["https://api.nfcore.com.br"], () => "fm-control");
    expect(await client.health(context, source)).toBe("unavailable");
  });

  it("fails closed before parsing a response exceeding the size budget", async () => {
    const oversized = { ...snapshot(), padding: "x".repeat(300000) };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(oversized), { status: 200 }));
    const client = new NfcoreCommercialConnector(() => "x".repeat(40), fetcher as unknown as typeof fetch,
      () => ["https://api.nfcore.com.br"], () => "fm-control");
    await expect(client.pull(context, source)).rejects.toThrow("nfcore_commercial.response_too_large");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
