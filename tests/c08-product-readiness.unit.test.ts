import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildC08IntegrationReadiness,
} from "@/application/integration/c08-product-readiness";
import type { SourceDefinition, SyncOperationalState } from "@/domain/integration/contracts";
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
  it("lists active products and marks missing source without manufacturing health", () => {
    const report = buildC08IntegrationReadiness("fm", products, [], new Map(), now);
    expect(report.contractVersion).toBe("fmcc.c08.integration-readiness.v1");
    expect(report.rows).toHaveLength(3);
    expect(report.rows.every(item => item.state === "not_configured")).toBe(true);
    expect(report.certifiedIntegrations).toBeNull();
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
    expect(rows.every(row => row.authenticatedSaasE2eCertified === false)).toBe(true);
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
    expect(page).toContain("Fonte registrada não equivale a integração homologada");
    expect(page).not.toContain("authenticatedSaasE2eCertified ? \"Sim\"");
  });
});
