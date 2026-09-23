import { describe, expect, it } from "vitest";
import { KordenaCommercialControlService } from "@/application/integration/kordena-commercial-control-service";
import type { ConnectorContext, SourceDefinition } from "@/domain/integration/contracts";
import type { TenantContext } from "@/domain/security/tenant-context";
import type { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import {
  KordenaCommercialConnector,
  KordenaCommercialConnectorError,
} from "@/infrastructure/integration/kordena-commercial-connector";

const source: SourceDefinition = {
  id: "source-kordena",
  tenantId: "tenant-fmcc",
  productId: "product-kordena",
  name: "Kordena Commercial",
  sourceType: "kordena-commercial-v1",
  authoritativeDomain: "commercial",
  status: "configured",
  syncMode: "pull",
  secretRef: "env:KORDENA_CONTROL_TOKEN",
  config: { baseUrl: "https://kordena.example.test" },
  mappingVersion: "kordena-commercial-v1",
};

const context: ConnectorContext = {
  tenantId: "tenant-fmcc",
  correlationId: "corr-kca12",
  timeoutMs: 8000,
};

function snapshot() {
  return {
    schema_version: "kordena.fmcc.commercial.v1",
    product_code: "KORDENA",
    as_of: "2026-09-23T16:00:00+00:00",
    customers: [],
    product_accounts: [],
    trials: [],
    subscriptions: [],
    billing_transactions: [],
    entitlements: [],
    catalog: [],
    summary: { customers: 0 },
    facts: [
      {
        external_id: "trial:one:started",
        fact_type: "trial.started",
        payload: { trial_id: "one" },
        source_timestamp: "2026-09-23T15:00:00+00:00",
      },
    ],
    coverage: {
      mrr: "pending_governed_semantics",
      arr: "pending_governed_semantics",
      churn: "pending_governed_semantics",
    },
  };
}

describe("KCA-12 Kordena commercial connector", () => {
  it("pulls canonical facts with server-side secret and provenance-ready timestamps", async () => {
    const calls: { url: string; authorization: string | null }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        authorization: headers.get("authorization"),
      });
      return new Response(JSON.stringify(snapshot()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const connector = new KordenaCommercialConnector(
      (ref) => ref === source.secretRef ? "x".repeat(40) : undefined,
      fetcher,
      () => ["https://kordena.example.test"],
    );

    const result = await connector.pull(context, source);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].factType).toBe("trial.started");
    expect(result.facts[0].sourceTimestamp.toISOString()).toBe(
      "2026-09-23T15:00:00.000Z",
    );
    expect(calls[0].url).toBe(
      "https://kordena.example.test/v1/control-plane/fmcc/snapshot",
    );
    expect(calls[0].authorization).toBe(`Bearer ${"x".repeat(40)}`);
  });

  it("forwards catalog command without placing the service token in the payload", async () => {
    let seenBody = "";
    let seenAuthorization = "";
    const connector = new KordenaCommercialConnector(
      () => "s".repeat(40),
      async (_input, init) => {
        seenBody = String(init?.body ?? "");
        seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";
        return new Response(JSON.stringify({ status: "accepted" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      () => ["https://kordena.example.test"],
    );
    const result = await connector.command(
      context,
      source,
      {
        actor: {
          user_id: "owner-1",
          role: "owner",
          step_up_at: "2026-09-23T16:00:00Z",
        },
        action: "plan_version.validate",
        resource_id: "version-1",
        payload: { change_reason: "test" },
      },
      "idem-123",
    );
    expect(result.status).toBe("accepted");
    expect(seenAuthorization).toBe(`Bearer ${"s".repeat(40)}`);
    expect(seenBody).not.toContain("ssssssss");
  });

  it("fails closed when a source is outside the current FMCC tenant", async () => {
    const tenantContext: TenantContext = {
      tenantId: "tenant-a",
      userId: "owner-a",
      role: "owner",
      correlationId: "corr-cross-tenant",
    };
    const sources = {
      async findById() { return null; },
      async list() { return []; },
      async create() { throw new Error("not used"); },
    } as unknown as PostgresSourceRepository;
    const service = new KordenaCommercialControlService(
      sources,
      new KordenaCommercialConnector(
        () => "x".repeat(40),
        fetch,
        () => ["https://kordena.example.test"],
      ),
    );
    await expect(
      service.snapshot(tenantContext, "source-from-tenant-b"),
    ).rejects.toThrow("security.cross_tenant_access_denied");
  });

  it("fails closed for insecure source URL or unavailable secret", async () => {
    const connector = new KordenaCommercialConnector(
      () => undefined,
      fetch,
      () => ["https://kordena.example.test"],
    );
    await expect(connector.pull(context, source)).rejects.toBeInstanceOf(
      KordenaCommercialConnectorError,
    );

    const insecure = {
      ...source,
      config: { baseUrl: "http://kordena.example.test" },
    };
    const configured = new KordenaCommercialConnector(
      () => "t".repeat(40),
      fetch,
      () => ["https://kordena.example.test"],
    );
    await expect(configured.pull(context, insecure)).rejects.toBeInstanceOf(
      KordenaCommercialConnectorError,
    );
  });
});
