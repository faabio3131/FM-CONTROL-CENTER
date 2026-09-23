import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ConnectorContext, SourceDefinition } from "@/domain/integration/contracts";
import {
  KordenaCommercialConnector,
  type KordenaCommercialSnapshot,
  type KordenaObservabilityMetric,
} from "@/infrastructure/integration/kordena-commercial-connector";

const source: SourceDefinition = {
  id: "source-kordena-kca13",
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
  correlationId: "corr-kca13",
  timeoutMs: 8000,
};

const metricKeys = [
  "signup_started",
  "signup_completed",
  "tenant_provisioned",
  "trial_started",
  "trial_active",
  "trial_expiring",
  "trial_expired",
  "trial_converted",
  "conversion_rate",
  "subscription_active",
  "past_due",
  "churn",
  "mrr",
  "arr",
  "payment_success",
  "payment_failure",
] as const;

function metric(metricId: string): KordenaObservabilityMetric {
  return {
    metric_id: metricId,
    status: "available",
    value: metricId === "mrr" || metricId === "arr"
      ? { by_currency: [{ currency: "BRL", amount: "100.00" }] }
      : 1,
    unit: metricId === "conversion_rate" || metricId === "churn"
      ? "percent"
      : "count",
    as_of: "2026-09-23T18:00:00Z",
    quality_status: "verified",
    source_authority: "fm_commercial_platform",
    provenance_refs: ["table:governed"],
    definition: "governed test definition",
  };
}

function snapshot(): KordenaCommercialSnapshot {
  return {
    schema_version: "kordena.fmcc.commercial.v1",
    product_code: "KORDENA",
    as_of: "2026-09-23T18:00:00Z",
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
    facts: [],
    observability: {
      schema_version: "kordena.observability.kca13.v1",
      as_of: "2026-09-23T18:00:00Z",
      internal_test_excluded: true,
      metrics: Object.fromEntries(
        metricKeys.map((key) => [key, metric(key)]),
      ),
      antiabuse: {
        signup_rate_last_hour: 0,
        risk_score: null,
        policy_thresholds: "not_configured",
      },
      health: { status: "healthy" },
      finops: {
        ai_cost_per_tenant: { status: "available", tenants: [] },
        infra_cost_per_tenant: {
          status: "unavailable",
          tenants: null,
          reason: "infrastructure_cost_source_not_configured",
        },
      },
      alerts: [],
      tracing: { correlation_ids: ["corr-kca13"] },
      coverage: {
        ai_cost: "existing_ai_finops_read_model",
        infrastructure_cost: "unavailable_source_not_configured",
      },
    },
    coverage: {
      mrr: "available_via_kca13_observability",
      arr: "available_via_kca13_observability",
      churn: "available_when_starting_active_cohort_exists",
    },
  };
}

describe("KCA-13 Kordena observability contract", () => {
  it("accepts governed observability with explicit provenance", async () => {
    const connector = new KordenaCommercialConnector(
      () => "x".repeat(40),
      async () =>
        new Response(JSON.stringify(snapshot()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      () => ["https://kordena.example.test"],
      () => "tenant-fmcc",
    );

    const result = await connector.snapshot(context, source);

    expect(result.observability?.schema_version).toBe(
      "kordena.observability.kca13.v1",
    );
    expect(result.observability?.internal_test_excluded).toBe(true);
    expect(result.observability?.metrics.mrr.provenance_refs).toEqual([
      "table:governed",
    ]);
    expect(
      (result.observability?.finops.infra_cost_per_tenant as Record<string, unknown>)
        .status,
    ).toBe("unavailable");
  });

  it("fails closed when KCA-13 observability is present but malformed", async () => {
    const malformed = {
      ...snapshot(),
      observability: {
        ...snapshot().observability,
        internal_test_excluded: false,
      },
    };
    const connector = new KordenaCommercialConnector(
      () => "x".repeat(40),
      async () =>
        new Response(JSON.stringify(malformed), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      () => ["https://kordena.example.test"],
      () => "tenant-fmcc",
    );

    await expect(connector.snapshot(context, source)).rejects.toThrow(
      "integration.kordena_snapshot_contract_invalid",
    );
  });

  it("keeps unavailable metrics unavailable in the dashboard and read-only in the Core", () => {
    const page = readFileSync(
      new URL(
        "../src/app/dashboard/commercial/kordena/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const capability = readFileSync(
      new URL(
        "../src/application/core/kordena-commercial-summary-capability.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(page).toContain('metric.status === "unavailable"');
    expect(page).toContain('"Indisponível"');
    expect(page).toContain("snapshot.observability");
    expect(capability).toContain("observability: snapshot.observability");
    expect(capability).not.toContain("commercial:write");
  });
});
