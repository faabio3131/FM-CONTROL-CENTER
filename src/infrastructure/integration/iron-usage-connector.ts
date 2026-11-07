import {
  type Connector, type ConnectorContext, type SourceDefinition,
} from "@/domain/integration/contracts";
import {
  OperationalUsageConnectorError, readOperationalUsageEnvelope,
  type UsageSecretResolver, type UsageSettings,
} from "@/infrastructure/integration/operational-usage-http";

export const IRON_USAGE_SOURCE_TYPE = "iron-usage-v1";
export const IRON_USAGE_SECRET_REF = "env:FMCC_IRON_USAGE_CONTROL_PLANE_TOKEN";
const config = {
  sourceType: IRON_USAGE_SOURCE_TYPE,
  secretRef: IRON_USAGE_SECRET_REF,
  tokenName: "FMCC_IRON_USAGE_CONTROL_PLANE_TOKEN",
  tenantName: "FMCC_IRON_CONTROL_TENANT_ID",
  originsName: "FMCC_IRON_ALLOWED_ORIGINS",
  path: "/api/v1/control-plane/fmcc/usage/ai?days=30",
} as const;

export interface IronUsageSnapshot {
  readonly schema_version: "iron.fmcc.ai-usage.v1";
  readonly product_code: "IRON_FIT_CORE";
  readonly as_of: string;
  readonly window_start: string;
  readonly window_days: 30;
  readonly usage: readonly {
    readonly tenant_id: string;
    readonly capability: string;
    readonly provider_code: string;
    readonly model_code: string;
    readonly status: string;
    readonly execution_count: number;
  }[];
  readonly unavailable_metrics: readonly string[];
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OperationalUsageConnectorError("operational_usage.iron_schema_invalid");
  }
  return value as Record<string, unknown>;
}
function validDate(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
}
function bounded(value: unknown, max = 128): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

/** Whitelist validated counters only; tenant identifiers never leave the connector as UI output. */
export function parseIronUsageSnapshot(input: unknown): IronUsageSnapshot {
  const body = object(input);
  const usage = body.usage;
  const unavailable = body.unavailable_metrics;
  const provenance = object(body.provenance);
  if (body.schema_version !== "iron.fmcc.ai-usage.v1" ||
      body.product_code !== "IRON_FIT_CORE" ||
      body.metric !== "ai_execution_trace_count" ||
      !validDate(body.as_of) || !validDate(body.window_start) ||
      body.window_days !== 30 ||
      new Date(body.window_start).getTime() > new Date(body.as_of).getTime() ||
      !Array.isArray(usage) || usage.length > 10000 ||
      !Array.isArray(unavailable) ||
      unavailable.length !== 3 ||
      !["input_tokens", "output_tokens", "provider_cost_minor"].every(m => unavailable.includes(m)) ||
      provenance.source !== "IRON_CANONICAL_AI_EXECUTION_TRACE" ||
      provenance.calculation !== "GROUP_BY_TENANT_CAPABILITY_PROVIDER_MODEL_STATUS" ||
      provenance.commercial_authority !== "FM_COMMAND") {
    throw new OperationalUsageConnectorError("operational_usage.iron_schema_invalid");
  }
  const rows = usage.map(item => {
    const r = object(item);
    if (!bounded(r.tenant_id) || !bounded(r.capability) ||
        !bounded(r.provider_code) || !bounded(r.model_code) || !bounded(r.status) ||
        !Number.isSafeInteger(r.execution_count) || (r.execution_count as number) < 0) {
      throw new OperationalUsageConnectorError("operational_usage.iron_row_invalid");
    }
    return {
      tenant_id: r.tenant_id as string,
      capability: r.capability as string,
      provider_code: r.provider_code as string,
      model_code: r.model_code as string,
      status: r.status as string,
      execution_count: r.execution_count as number,
    };
  });
  return {
    schema_version: "iron.fmcc.ai-usage.v1",
    product_code: "IRON_FIT_CORE",
    as_of: body.as_of as string,
    window_start: body.window_start as string,
    window_days: 30,
    usage: rows,
    unavailable_metrics: ["input_tokens", "output_tokens", "provider_cost_minor"],
  };
}

export class IronUsageConnector implements Connector {
  readonly sourceType = IRON_USAGE_SOURCE_TYPE;
  readonly capabilities = ["operational.ai_usage.readonly"] as const;
  constructor(
    private readonly resolveSecret?: UsageSecretResolver,
    private readonly fetcher?: typeof fetch,
    private readonly settings?: UsageSettings,
  ) {}
  async snapshot(context: ConnectorContext, source: SourceDefinition): Promise<IronUsageSnapshot> {
    return parseIronUsageSnapshot(await readOperationalUsageEnvelope(context, source, config, {
      resolveSecret: this.resolveSecret, fetcher: this.fetcher, settings: this.settings,
    }));
  }
  async health(context: ConnectorContext, source: SourceDefinition): Promise<"healthy" | "unavailable"> {
    try { await this.snapshot(context, source); return "healthy"; }
    catch { return "unavailable"; }
  }
}
