import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceDefinition } from "@/domain/integration/contracts";
import { bootstrapIronCommercialRuntime } from "@/application/integration/iron-runtime-bootstrap";
import { bootstrapKordenaCommercialRuntime } from "@/application/integration/kordena-runtime-bootstrap";

afterEach(() => vi.unstubAllEnvs());

const iron: SourceDefinition = {
  id: "source-iron", tenantId: "tenant-fm", productId: "product-iron",
  name: "IRON FIT CORE Commercial", sourceType: "iron-commercial-v1",
  authoritativeDomain: "commercial", status: "configured", syncMode: "pull",
  secretRef: "env:FMCC_IRON_CONTROL_PLANE_TOKEN",
  config: { baseUrl: "https://old-iron.example.test" }, mappingVersion: "iron-commercial-v1",
};
const kordena: SourceDefinition = {
  ...iron, id: "source-kordena", productId: "product-kordena",
  name: "Kordena Commercial", sourceType: "kordena-commercial-v1",
  secretRef: "env:FMCC_KORDENA_CONTROL_PLANE_TOKEN",
  config: { baseUrl: "https://old-kordena.example.test" },
  mappingVersion: "kordena-commercial-v1",
};

function deps(existing: readonly SourceDefinition[]) {
  const sources = {
    list: vi.fn().mockResolvedValue(existing), create: vi.fn().mockRejectedValue(new Error("WRITE_FORBIDDEN")),
  };
  const products = {
    findBySlug: vi.fn().mockImplementation(async (_tenant: string, slug: string) => ({
      tenantId: "tenant-fm", id: slug === "iron" ? "product-iron" : "product-kordena",
      slug, status: "active",
    })),
  };
  const runtime = {
    health: vi.fn().mockResolvedValue("healthy"),
    syncPull: vi.fn().mockRejectedValue(new Error("WRITE_FORBIDDEN")),
  };
  return { sources, products, runtime };
}

function setup(kind: "IRON" | "KORDENA") {
  const url = kind === "IRON" ? "https://api.ironfitcore.com.br" : "https://api.kordenaia.com.br";
  vi.stubEnv(`FMCC_${kind}_RUNTIME_BOOTSTRAP`, "true");
  vi.stubEnv(`FMCC_${kind}_RUNTIME_BOOTSTRAP_VERIFY`, "true");
  vi.stubEnv(`FMCC_${kind}_CONTROL_TENANT_ID`, "tenant-fm");
  vi.stubEnv(`FMCC_${kind}_BASE_URL`, url);
  vi.stubEnv(`FMCC_${kind}_ALLOWED_ORIGINS`, url);
  vi.stubEnv(`FMCC_${kind}_SOURCE_ORIGIN_OVERRIDE`, "true");
}

describe("no-database-write bootstrap for canonical migrated S2S origins", () => {
  it("IRON reuses the existing source with a new in-memory origin; does not sync, create or mutate", async () => {
    setup("IRON");
    const d = deps([iron]);
    const before = JSON.stringify(iron);
    const result = await bootstrapIronCommercialRuntime({
      sources: d.sources as never, products: d.products as never, runtime: d.runtime as never,
    });
    expect(result).toEqual({ status: "ready", sourceId: iron.id, created: false });
    expect(d.sources.create).not.toHaveBeenCalled();
    expect(d.runtime.syncPull).not.toHaveBeenCalled();
    expect(d.runtime.health).not.toHaveBeenCalled();
    expect(JSON.stringify(iron)).toBe(before);
  });

  it("Kordena reuses its existing source with a new in-memory origin, without ingestion", async () => {
    setup("KORDENA");
    const d = deps([kordena]);
    const result = await bootstrapKordenaCommercialRuntime({
      sources: d.sources as never, products: d.products as never, runtime: d.runtime as never,
    });
    expect(result).toEqual({ status: "ready", sourceId: kordena.id, created: false });
    expect(d.sources.create).not.toHaveBeenCalled();
    expect(d.runtime.syncPull).not.toHaveBeenCalled();
    expect(d.runtime.health).not.toHaveBeenCalled();
  });

  it("fails closed when the canonical IRON source is missing instead of writing a new database row", async () => {
    setup("IRON");
    const d = deps([]);
    await expect(bootstrapIronCommercialRuntime({
      sources: d.sources as never, products: d.products as never, runtime: d.runtime as never,
    })).rejects.toThrow("integration.iron_override_requires_existing_source");
    expect(d.sources.create).not.toHaveBeenCalled();
  });

  it("fails closed when the canonical Kordena source is missing instead of writing a new database row", async () => {
    setup("KORDENA");
    const d = deps([]);
    await expect(bootstrapKordenaCommercialRuntime({
      sources: d.sources as never, products: d.products as never, runtime: d.runtime as never,
    })).rejects.toThrow("integration.kordena_override_requires_existing_source");
    expect(d.sources.create).not.toHaveBeenCalled();
  });

  it("refuses a wrong-tenant IRON record without fallback or recreation", async () => {
    setup("IRON");
    const d = deps([{ ...iron, tenantId: "foreign-tenant" }]);
    await expect(bootstrapIronCommercialRuntime({
      sources: d.sources as never, products: d.products as never, runtime: d.runtime as never,
    })).rejects.toThrow("integration.iron_bootstrap_source_mismatch");
    expect(d.sources.create).not.toHaveBeenCalled();
  });
});
