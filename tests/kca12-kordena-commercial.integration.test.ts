import { describe, expect, it } from "vitest";
import { KordenaCommercialControlService } from "@/application/integration/kordena-commercial-control-service";
import type { ConnectorContext, SourceDefinition } from "@/domain/integration/contracts";
import type { TenantContext } from "@/domain/security/tenant-context";
import type { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import {
  KordenaCommercialConnector,
  KordenaCommercialConnectorError,
  isKordenaCommercialAction,
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
  secretRef: "env:FMCC_KORDENA_CONTROL_PLANE_TOKEN",
  config: { baseUrl: "https://kordena.example.test" },
  mappingVersion: "kordena-commercial-v1",
};

const context: ConnectorContext = {
  tenantId: "tenant-fmcc",
  correlationId: "corr-kca12",
  timeoutMs: 8000,
};

const controlTenant = () => "tenant-fmcc";

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
    summary: {
      customers: 0,
      internal_test_customers: 0,
      active_trials: 0,
      active_subscriptions: 0,
      past_due_subscriptions: 0,
      suspended_subscriptions: 0,
      confirmed_payments: 0,
      failed_payments: 0,
      reconciled_transactions: 0,
      users: 0,
      units: 0,
    },
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
      controlTenant,
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

  it("rejects an incomplete snapshot instead of converting absence to zero", async () => {
    const incomplete = { ...snapshot(), summary: { customers: 0 } };
    const connector = new KordenaCommercialConnector(
      () => "x".repeat(40),
      async () =>
        new Response(JSON.stringify(incomplete), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      () => ["https://kordena.example.test"],
      controlTenant,
    );

    await expect(connector.snapshot(context, source)).rejects.toThrow(
      "integration.kordena_snapshot_contract_invalid",
    );
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
      controlTenant,
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
        controlTenant,
      ),
    );
    await expect(
      service.snapshot(tenantContext, "source-from-tenant-b"),
    ).rejects.toThrow("security.cross_tenant_access_denied");
  });

  it("denies Kordena access for a different FMCC tenant even with a valid source and secret", async () => {
    const connector = new KordenaCommercialConnector(
      () => "x".repeat(40),
      async () => new Response(JSON.stringify(snapshot()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      () => ["https://kordena.example.test"],
      controlTenant,
    );
    const otherContext = { ...context, tenantId: "tenant-other" };
    const otherSource = { ...source, tenantId: "tenant-other" };

    await expect(
      connector.pull(otherContext, otherSource),
    ).rejects.toThrow("integration.kordena_control_tenant_denied");
  });



  it("rejects unknown commercial actions at the runtime contract boundary", () => {
    expect(isKordenaCommercialAction("price.publish")).toBe(true);
    expect(isKordenaCommercialAction("plan_version.create")).toBe(true);
    expect(isKordenaCommercialAction("price.force_publish")).toBe(false);
    expect(isKordenaCommercialAction("admin.override")).toBe(false);
    expect(isKordenaCommercialAction(null)).toBe(false);
  });

  it("aborts a hung Kordena request using the connector context timeout", async () => {
    let observedSignal: AbortSignal | null = null;
    const connector = new KordenaCommercialConnector(
      () => "x".repeat(40),
      async (_input, init) => {
        observedSignal = init?.signal as AbortSignal;
        return await new Promise<Response>((_resolve, reject) => {
          observedSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        });
      },
      () => ["https://kordena.example.test"],
      controlTenant,
    );

    await expect(
      connector.snapshot({ ...context, timeoutMs: 20 }, source),
    ).rejects.toThrow("integration.kordena_request_timeout");
    expect(observedSignal?.aborted).toBe(true);
  });

  it("fails closed for insecure source URL or unavailable secret", async () => {
    const connector = new KordenaCommercialConnector(
      () => undefined,
      fetch,
      () => ["https://kordena.example.test"],
      controlTenant,
    );
    await expect(connector.pull(context, source)).rejects.toBeInstanceOf(
      KordenaCommercialConnectorError,
    );

    const wrongSecretReference = {
      ...source,
      secretRef: "env:DATABASE_URL",
    };
    const dedicated = new KordenaCommercialConnector(
      () => "t".repeat(40),
      fetch,
      () => ["https://kordena.example.test"],
      controlTenant,
    );
    await expect(
      dedicated.pull(context, wrongSecretReference),
    ).rejects.toThrow("integration.kordena_secret_reference_invalid");

    const insecure = {
      ...source,
      config: { baseUrl: "http://kordena.example.test" },
    };
    const configured = new KordenaCommercialConnector(
      () => "t".repeat(40),
      fetch,
      () => ["https://kordena.example.test"],
      controlTenant,
    );
    await expect(configured.pull(context, insecure)).rejects.toBeInstanceOf(
      KordenaCommercialConnectorError,
    );

    const credentialExfiltrationAttempt = {
      ...source,
      config: { baseUrl: "https://attacker.example.test" },
    };
    await expect(
      configured.pull(context, credentialExfiltrationAttempt),
    ).rejects.toThrow("integration.kordena_origin_not_allowed");
  });
});
