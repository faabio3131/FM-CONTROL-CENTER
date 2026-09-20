import { describe, expect, it } from "vitest";
import { ConnectorRuntime } from "@/application/integration/connector-runtime";
import type { Connector, SourceDefinition } from "@/domain/integration/contracts";
import type { TenantContext } from "@/domain/security/tenant-context";

const context: TenantContext = { tenantId: "tenant-a", userId: "u1", role: "owner", correlationId: "corr-1" };
const source: SourceDefinition = {
  id: "source-1", tenantId: "tenant-a", name: "fixture", sourceType: "fixture",
  authoritativeDomain: "billing", syncMode: "pull", mappingVersion: "v1", secretRef: "render:fixture",
};

function runtimeFor(sourceResult: SourceDefinition | null = source) {
  const completed = new Map<string, string>();
  const facts: unknown[] = [];
  const connector: Connector = {
    sourceType: "fixture", capabilities: ["billing.read"],
    async health() { return "healthy"; },
    async pull() { return { facts: [{ externalId: "invoice-1", factType: "billing.invoice", payload: { amount: 10 }, sourceTimestamp: new Date("2026-09-20T00:00:00Z") }], nextCursor: "next" }; },
  };
  const runtime = new ConnectorRuntime(
    { async findById() { return sourceResult; } },
    {
      async findCompletedByIdempotencyKey(_tenant, key) { const id=completed.get(key); return id ? { id } : null; },
      async start() { return "exec-1"; },
      async complete(input) { completed.set("idem-1", input.id); },
      async fail() {},
    },
    { async ingest(input) { facts.push(input); } },
    [connector],
    100,
  );
  return { runtime, facts };
}

describe("F07 integration fabric", () => {
  it("ingere facts com provenance e respeita idempotência", async () => {
    const { runtime, facts } = runtimeFor();
    const first = await runtime.syncPull(context, { sourceId: "source-1", idempotencyKey: "idem-1" });
    const duplicate = await runtime.syncPull(context, { sourceId: "source-1", idempotencyKey: "idem-1" });
    expect(first).toMatchObject({ status: "completed", ingested: 1, nextCursor: "next" });
    expect(duplicate).toMatchObject({ status: "duplicate", ingested: 0 });
    expect(facts).toHaveLength(1);
  });

  it("falha fechado quando a source não pertence ao tenant", async () => {
    const { runtime } = runtimeFor(null);
    await expect(runtime.syncPull(context, { sourceId: "other", idempotencyKey: "idem-x" }))
      .rejects.toThrow("security.cross_tenant_access_denied");
  });
});
