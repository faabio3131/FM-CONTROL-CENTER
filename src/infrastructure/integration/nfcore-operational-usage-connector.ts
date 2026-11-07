import { createHash } from "node:crypto";
import {
  type Connector, type ConnectorContext, type SourceDefinition,
} from "@/domain/integration/contracts";
import {
  OperationalUsageConnectorError, readOperationalUsageEnvelope,
  type UsageSecretResolver, type UsageSettings,
} from "@/infrastructure/integration/operational-usage-http";

export const NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE = "nfcore-operational-usage-v1";
export const NFCORE_OPERATIONAL_USAGE_SECRET_REF =
  "env:FMCC_NFCORE_OPERATIONAL_USAGE_CONTROL_PLANE_TOKEN";
const config = {
  sourceType: NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE,
  secretRef: NFCORE_OPERATIONAL_USAGE_SECRET_REF,
  tokenName: "FMCC_NFCORE_OPERATIONAL_USAGE_CONTROL_PLANE_TOKEN",
  tenantName: "FMCC_NFCORE_CONTROL_TENANT_ID",
  originsName: "FMCC_NFCORE_ALLOWED_ORIGINS",
  path: "/v1/command/operational-usage/snapshot",
} as const;

export interface NfcoreOperationalUsageSnapshot {
  readonly schema_version: "nfcore.fmcc.operational-usage.v1";
  readonly product_code: "NFCORE";
  readonly as_of: string;
  readonly consumption: readonly {
    readonly subscription_id: string;
    readonly tenant_id: string;
    readonly plan_id: string;
    readonly status: string;
    readonly metrics: readonly {
      readonly metric_id: string;
      readonly limit: number;
      readonly used: number | null;
      readonly unavailable: boolean;
    }[];
  }[];
  readonly summary: {
    readonly subscriptions_with_quotas: number;
    readonly metrics_reported: number;
    readonly metrics_unavailable: number;
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OperationalUsageConnectorError("operational_usage.nfcore_schema_invalid");
  }
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 128): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function time(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
}
function assertNoUnexpectedKeys(
  item: Record<string, unknown>, expected: readonly string[],
): void {
  if (Object.keys(item).some(key => !expected.includes(key))) {
    throw new OperationalUsageConnectorError("operational_usage.nfcore_unexpected_fields");
  }
}
function pythonCanonicalSummary(asOf: string, summary: {
  readonly subscriptions_with_quotas: number;
  readonly metrics_reported: number;
  readonly metrics_unavailable: number;
}): string {
  // Python json.dumps(..., sort_keys=True), preserving spaces after separators.
  return '{"as_of": ' + JSON.stringify(asOf) +
    ', "metrics_reported": ' + summary.metrics_reported +
    ', "metrics_unavailable": ' + summary.metrics_unavailable +
    ', "subscriptions_with_quotas": ' + summary.subscriptions_with_quotas + '}';
}

/** Explicitly verify the product's deterministic summary fact; raw subscription IDs stay server-side. */
export function parseNfcoreOperationalUsageSnapshot(
  input: unknown, correlationId: string,
): NfcoreOperationalUsageSnapshot {
  const body = object(input);
  assertNoUnexpectedKeys(body, [
    "correlationId", "provenance", "schema_version", "product_code",
    "as_of", "consumption", "summary", "facts",
  ]);
  const provenance = object(body.provenance);
  if (body.schema_version !== "nfcore.fmcc.operational-usage.v1" ||
      body.product_code !== "NFCORE" || body.correlationId !== correlationId ||
      provenance.authority !== "nfcore-operational-usage-core" ||
      provenance.readOnly !== true || !time(body.as_of) ||
      !Array.isArray(body.consumption) || body.consumption.length > 5000) {
    throw new OperationalUsageConnectorError("operational_usage.nfcore_schema_invalid");
  }
  const summary = object(body.summary);
  assertNoUnexpectedKeys(summary, [
    "subscriptions_with_quotas", "metrics_reported", "metrics_unavailable",
  ]);
  if (!count(summary.subscriptions_with_quotas) ||
      !count(summary.metrics_reported) || !count(summary.metrics_unavailable)) {
    throw new OperationalUsageConnectorError("operational_usage.nfcore_summary_invalid");
  }
  const entries = body.consumption.map(value => {
    const row = object(value);
    assertNoUnexpectedKeys(row, [
      "subscription_id", "tenant_id", "plan_id", "status", "metrics",
    ]);
    if (!string(row.subscription_id) || !string(row.tenant_id) ||
        !string(row.plan_id) || !string(row.status) ||
        !Array.isArray(row.metrics) || row.metrics.length === 0 || row.metrics.length > 256) {
      throw new OperationalUsageConnectorError("operational_usage.nfcore_row_invalid");
    }
    const metrics = row.metrics.map(metric => {
      const m = object(metric);
      assertNoUnexpectedKeys(m, ["metric_id", "limit", "used", "unavailable"]);
      if (!string(m.metric_id) || !count(m.limit) ||
          typeof m.unavailable !== "boolean" ||
          (m.unavailable ? m.used !== null : !count(m.used))) {
        throw new OperationalUsageConnectorError("operational_usage.nfcore_metric_invalid");
      }
      return {
        metric_id: m.metric_id as string,
        limit: m.limit as number,
        used: m.used as number | null,
        unavailable: m.unavailable as boolean,
      };
    });
    if (new Set(metrics.map(m => m.metric_id)).size !== metrics.length) {
      throw new OperationalUsageConnectorError("operational_usage.nfcore_duplicate_metric");
    }
    return {
      subscription_id: row.subscription_id as string,
      tenant_id: row.tenant_id as string,
      plan_id: row.plan_id as string,
      status: row.status as string,
      metrics,
    };
  });
  if (new Set(entries.map(e => e.subscription_id)).size !== entries.length) {
    throw new OperationalUsageConnectorError("operational_usage.nfcore_duplicate_subscription");
  }
  const metricCount = entries.reduce((n, entry) => n + entry.metrics.length, 0);
  const unknownCount = entries.reduce((n, entry) =>
    n + entry.metrics.filter(m => m.unavailable).length, 0);
  if (summary.subscriptions_with_quotas !== entries.length ||
      summary.metrics_reported !== metricCount ||
      summary.metrics_unavailable !== unknownCount) {
    throw new OperationalUsageConnectorError("operational_usage.nfcore_summary_mismatch");
  }
  if (!Array.isArray(body.facts) || body.facts.length !== 1) {
    throw new OperationalUsageConnectorError("operational_usage.nfcore_fact_invalid");
  }
  const fact = object(body.facts[0]);
  const payload = object(fact.payload);
  const canonical = pythonCanonicalSummary(body.as_of as string, {
    subscriptions_with_quotas: entries.length,
    metrics_reported: metricCount,
    metrics_unavailable: unknownCount,
  });
  const digest = createHash("sha256").update(canonical).digest("hex");
  if (fact.external_id !== "nfcore-operational-usage-v1:" + digest ||
      fact.fact_type !== "nfcore.operational_usage.snapshot" ||
      fact.source_timestamp !== body.as_of ||
      payload.as_of !== body.as_of ||
      payload.subscriptions_with_quotas !== entries.length ||
      payload.metrics_reported !== metricCount ||
      payload.metrics_unavailable !== unknownCount) {
    throw new OperationalUsageConnectorError("operational_usage.nfcore_fact_invalid");
  }
  return {
    schema_version: "nfcore.fmcc.operational-usage.v1",
    product_code: "NFCORE",
    as_of: body.as_of as string,
    consumption: entries,
    summary: {
      subscriptions_with_quotas: entries.length,
      metrics_reported: metricCount,
      metrics_unavailable: unknownCount,
    },
  };
}

export class NfcoreOperationalUsageConnector implements Connector {
  readonly sourceType = NFCORE_OPERATIONAL_USAGE_SOURCE_TYPE;
  readonly capabilities = ["operational.quota_usage.readonly"] as const;
  constructor(
    private readonly resolveSecret?: UsageSecretResolver,
    private readonly fetcher?: typeof fetch,
    private readonly settings?: UsageSettings,
  ) {}
  async snapshot(
    context: ConnectorContext, source: SourceDefinition,
  ): Promise<NfcoreOperationalUsageSnapshot> {
    return parseNfcoreOperationalUsageSnapshot(
      await readOperationalUsageEnvelope(context, source, config, {
        resolveSecret: this.resolveSecret, fetcher: this.fetcher, settings: this.settings,
      }),
      context.correlationId,
    );
  }
  async health(context: ConnectorContext, source: SourceDefinition): Promise<"healthy" | "unavailable"> {
    try { await this.snapshot(context, source); return "healthy"; }
    catch { return "unavailable"; }
  }
}
