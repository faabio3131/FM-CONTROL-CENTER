import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildC08IntegrationReadiness,
} from "@/application/integration/c08-product-readiness";
import type { SourceDefinition, SyncOperationalState } from "@/domain/integration/contracts";
import { buildSaasAdapterPreflight } from "@/application/integration/saas-adapter-preflight";
import { SAAS_ADAPTER_PROFILES } from "@/application/integration/saas-adapter-profiles";
import type { ProductDefinition } from "@/domain/products/contracts";

const now = new Date("2026-10-20T12:00:00Z");
const products: ProductDefinition[] = [
  { id: "p-k", tenantId: "fm", name: "Kordena", slug: "kordena", status: "active" },
  { id: "p-i", tenantId: "fm", name: "IRON", slug: "iron", status: "active" },
  { id: "p-a", tenantId: "fm", name: "Assistant", slug: "assistant", status: "active" },
  { id: "p-x", tenantId: "other", name: "Segredo", slug: "other", status: "active" },
  { id: "p-old", tenantId: "fm", name: "Inativo", slug: "old", status: "inactive" },
];
const s = (id: string, productId: string, status: SourceDefinition["status"] = "healthy",
           freshnessSeconds?: number): SourceDefinition => ({
  id, tenantId: "fm", productId, name: id, sourceType: "iron-commercial-v1",
  authoritativeDomain: "commercial", mappingVersion: "iron-commercial-v1",
  status, syncMode: "pull", config: {}, freshnessSeconds,
});
const op = (successfulAt?: string, lastAttemptStatus?: SyncOperationalState["lastAttemptStatus"],
            attemptAt?: string): SyncOperationalState => ({
  lastSuccessfulAt: successfulAt ? new Date(successfulAt) : undefined,
  lastAttemptStatus,
  lastAttemptAt: attemptAt ? new Date(attemptAt) : undefined,
});

describe("C08 product integration readiness - evidence is not homologation", () => {
  it("identifica produto novo sem adaptador, fonte ausente e contrato compatível", () => {
    const validIron: SourceDefinition = {
      ...s("source-valid", "p-i"), secretRef: "env:FMCC_IRON_CONTROL_PLANE_TOKEN",
    };
    const report = buildSaasAdapterPreflight("fm", products, [validIron]);
    expect(report.contractVersion).toBe("fmcc.c08.adapter-preflight.v1");
    expect(report.rows).toEqual([
      { productId:"p-a", productSlug:"assistant", sourceId:null, status:"adapter_missing", authenticatedSaasE2eCertified:false },
      { productId:"p-i", productSlug:"iron", sourceId:"source-valid", status:"local_contract_ready", authenticatedSaasE2eCertified:false },
      { productId:"p-k", productSlug:"kordena", sourceId:null, status:"source_missing", authenticatedSaasE2eCertified:false },
    ]);
    expect(report.verifiedExternalConnections).toBeNull();
    expect(JSON.stringify(report)).not.toContain("Segredo");
  });

  it("nega vinculação de fonte com versão, origem ou credencial divergente", () => {
    const valid: SourceDefinition = {
      ...s("source", "p-i"), secretRef: "env:FMCC_IRON_CONTROL_PLANE_TOKEN",
    };
    for (const broken of [
      { ...valid, mappingVersion: "v2" },
      { ...valid, sourceType: "kordena-commercial-v1" },
      { ...valid, secretRef: "env:FMCC_KORDENA_CONTROL_PLANE_TOKEN" },
      { ...valid, authoritativeDomain: "billing" },
      { ...valid, syncMode: "webhook" as const },
    ]) {
      const result = buildSaasAdapterPreflight("fm", products, [broken]);
      expect(result.rows.find(row => row.productSlug === "iron")?.status)
        .toBe("binding_mismatch");
      expect(result.verifiedExternalConnections).toBeNull();
    }
  });

  it("prova extensibilidade em fixture sem registrar integração externa", () => {
    const profile = { ...SAAS_ADAPTER_PROFILES[0], productSlug:"future", sourceType:"future-v1",
      mappingVersion:"future-v1", secretRef:"env:FMCC_FUTURE_TOKEN" };
    const future = { id:"future", tenantId:"fm", slug:"future", name:"Futuro", status:"active" as const };
    const source = { ...s("future-source", "future"), sourceType:"future-v1", mappingVersion:"future-v1",
      secretRef:"env:FMCC_FUTURE_TOKEN" };
    const before = buildSaasAdapterPreflight("fm", [future], [source]);
    const after = buildSaasAdapterPreflight("fm", [future], [source], [profile]);
    expect(before.rows[0].status).toBe("adapter_missing");
    expect(after.rows[0].status).toBe("local_contract_ready");
    expect(after.verifiedExternalConnections).toBeNull();
  });

  it("não expõe tenant, fonte ou produto estrangeiro e nega excesso sem truncar", () => {
    const data = buildSaasAdapterPreflight("fm", products,
      [{ ...s("foreign-source", "p-i"), tenantId:"other" }]);
    expect(JSON.stringify(data)).not.toContain("foreign-source");
    expect(JSON.stringify(data)).not.toContain("Segredo");
    expect(() => buildSaasAdapterPreflight("fm", products,
      Array.from({length:257}, (_,i)=>s("source-"+i,"p-i"))))
      .toThrow("integration.c08_snapshot_capacity_unverified");
    expect(() => buildSaasAdapterPreflight("", products, [])).toThrow("integration.c08_tenant_missing");
  });

  it("lists active products and marks missing source without manufacturing health", () => {
    const report = buildC08IntegrationReadiness("fm", products, [], new Map(), now);
    expect(report.contractVersion).toBe("fmcc.c08.integration-readiness.v1");
    expect(report.rows).toHaveLength(3);
    expect(report.rows.every(item => item.state === "not_configured")).toBe(true);
    expect(report.certifiedIntegrations).toBeNull();
    expect(report.localSummary).toEqual({
      activeProducts: 3, boundSources: 0, sourcesWithRecentLocalSync: 0, rowsWithoutRecentLocalSync: 3,
    });
    expect(report.rows.every(row => row.nextAction === "register_source")).toBe(true);
    expect(report.rows.every(item => !item.authenticatedSaasE2eCertified && !item.externallyHomologated)).toBe(true);
    expect(JSON.stringify(report)).not.toContain("Segredo");
  });

  it("does not claim a configured or healthy source was authenticated end-to-end", () => {
    const report = buildC08IntegrationReadiness("fm", products, [s("s1","p-i")], new Map(), now);
    const iron = report.rows.find(item => item.sourceId === "s1")!;
    expect(iron.state).toBe("unverified");
    expect(iron.sourceStatus).toBe("healthy");
    expect(iron.authenticatedSaasE2eCertified).toBe(false);
    expect(iron.externallyHomologated).toBe(false);
    expect(iron.nextAction).toBe("perform_first_sync");
  });

  it("distinguishes recent/stale/unknown freshness and failed/running sync attempts", () => {
    const sources = [
      s("recent","p-i","healthy",300),
      s("stale","p-k","healthy",30),
      s("undefined","p-k"),
      s("failed","p-i","healthy",300),
      s("running","p-i","healthy",300),
      s("unavailable","p-i","unavailable",300),
    ];
    const states = new Map<string, SyncOperationalState>([
      ["recent", op("2026-10-20T11:59:30Z","completed","2026-10-20T11:59:30Z")],
      ["stale", op("2026-10-20T11:00:00Z")],
      ["undefined", op("2026-10-20T11:59:59Z")],
      ["failed", op("2026-10-20T11:59:00Z","failed","2026-10-20T12:00:00Z")],
      ["running", op("2026-10-20T11:59:00Z","running","2026-10-20T12:00:00Z")],
      ["unavailable", op("2026-10-20T11:59:00Z")],
    ]);
    const rows = buildC08IntegrationReadiness("fm", products, sources, states, now).rows;
    const status = (id: string) => rows.find(row => row.sourceId === id)?.state;
    expect(status("recent")).toBe("sync_recent");
    expect(status("stale")).toBe("sync_stale");
    expect(status("undefined")).toBe("freshness_undefined");
    expect(status("failed")).toBe("sync_failed");
    expect(status("running")).toBe("sync_running");
    expect(status("unavailable")).toBe("persisted_unavailable");
    const action = (id: string) => rows.find(row => row.sourceId === id)?.nextAction;
    expect(action("recent")).toBe("certify_authenticated_saas_e2e");
    expect(action("stale")).toBe("refresh_stale_sync");
    expect(action("undefined")).toBe("define_freshness");
    expect(action("failed")).toBe("investigate_failed_sync");
    expect(action("running")).toBe("observe_running_sync");
    expect(action("unavailable")).toBe("investigate_unavailable_source");
    expect(rows.every(row => row.authenticatedSaasE2eCertified === false)).toBe(true);
  });

  it("distinguishes local successful sync from source health evidence", () => {
    const configured = s("configured", "p-i", "configured", 300);
    const degraded = s("degraded", "p-i", "degraded", 300);
    const states = new Map<string, SyncOperationalState>([
      ["configured", op("2026-10-20T11:59:59Z")],
      ["degraded", op("2026-10-20T11:59:59Z")],
    ]);
    const report = buildC08IntegrationReadiness("fm", products, [configured, degraded], states, now);
    expect(report.rows.find(row => row.sourceId === "configured")?.nextAction).toBe("verify_source_health");
    expect(report.rows.find(row => row.sourceId === "degraded")?.nextAction).toBe("investigate_degraded_health");
    expect(report.localSummary).toEqual({
      activeProducts: 3, boundSources: 2, sourcesWithRecentLocalSync: 2, rowsWithoutRecentLocalSync: 2,
    });
    expect(report.certifiedIntegrations).toBeNull();
  });

  it("isolates sources and prevents an unbound/wrong-product source from implying a working SaaS", () => {
    const unknown = s("orphan","p-old");
    const foreign = { ...s("foreign","p-i"), tenantId: "other" };
    const report = buildC08IntegrationReadiness("fm", products, [
      unknown, foreign, { ...s("unbound","p-i"), productId: undefined },
    ], new Map(), now);
    expect(report.unboundSourceCount).toBe(2);
    expect(report.rows.every(row => row.state === "not_configured")).toBe(true);
    expect(JSON.stringify(report)).not.toContain("foreign");
  });

  it("never treats future successful-at or empty tenant as verified evidence", () => {
    const recent = s("source","p-i","healthy",300);
    const result = buildC08IntegrationReadiness("fm", products, [recent], new Map([
      ["source",op("2026-10-21T00:00:00Z")],
    ]), now);
    expect(result.rows.find(row => row.sourceId === "source")?.state).toBe("unverified");
    expect(() => buildC08IntegrationReadiness("", products, [], new Map(), now)).toThrow();
  });

  it("includes readiness beside existing source controls, not a second connector registry", () => {
    const page = readFileSync(resolve("src/app/dashboard/sources/page.tsx"), "utf8");
    expect(page).toContain("buildC08IntegrationReadiness(");
    expect(page).toContain("<SourceControlPanel");
    expect(page).toContain("Próxima verificação: {nextActions[item.nextAction]}");
    expect(page).toContain("Estes números não representam integrações certificadas.");
    expect(page).toContain("Fonte registrada não equivale a integração homologada");
    expect(page).not.toContain("authenticatedSaasE2eCertified ? \"Sim\"");
  });
});
