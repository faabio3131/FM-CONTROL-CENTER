import {
  RetryableConnectorError,
  type Connector,
  type ConnectorContext,
  type ConnectorFact,
  type ConnectorPullResult,
  type SourceDefinition,
} from "@/domain/integration/contracts";

import { commercialOriginOverride, commercialOriginOverrideEnabled } from "@/application/integration/commercial-origin-override";

export const IRON_COMMERCIAL_SOURCE_TYPE = "iron-commercial-v1";
export const IRON_COMMERCIAL_SECRET_REF = "env:FMCC_IRON_CONTROL_PLANE_TOKEN";

export type IronSecretResolver = (reference: string) => string | undefined;
export type IronAllowedOriginResolver = () => readonly string[];
export type IronControlTenantResolver = () => string | undefined;

export interface IronCommercialSnapshot {
  readonly schema_version: "iron.fmcc.commercial.v1";
  readonly product_code: "IRON_FIT_CORE";
  readonly as_of: string;
  readonly customers: readonly Record<string, unknown>[];
  readonly trials: readonly Record<string, unknown>[];
  readonly subscriptions: readonly Record<string, unknown>[];
  readonly entitlements: readonly Record<string, unknown>[];
  readonly onboarding: readonly Record<string, unknown>[];
  readonly billing_transactions: readonly Record<string, unknown>[];
  readonly summary: Readonly<Record<string, number>>;
  readonly facts: readonly {
    external_id: string;
    fact_type: string;
    payload: Record<string, unknown>;
    source_timestamp: string;
  }[];
  readonly coverage: Readonly<Record<string, string>>;
}


/** IRON-owned published SaaS plans, never FM-controlled prices. */
export interface IronPublishedPlanVersion {
  readonly planCode: string;
  readonly displayName: string;
  readonly version: number;
  readonly publishedAt: string;
}
export interface IronPublishedPlanCatalog {
  readonly plans: readonly IronPublishedPlanVersion[];
  readonly asOf: string;
  readonly truncated: boolean;
}

export function parseIronPublishedPlanCatalog(value: unknown): IronPublishedPlanCatalog {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IronCommercialConnectorError("integration.iron_plan_catalog_invalid");
  }
  const data = value as Record<string, unknown>;
  if (data.schema_version !== "iron.fmcc.plan-versions.v1" ||
      data.product_code !== "IRON_FIT_CORE" ||
      data.source_authority !== "IRON_PRODUCT_PLAN_VERSION" ||
      typeof data.as_of !== "string" || Number.isNaN(Date.parse(data.as_of)) ||
      typeof data.truncated !== "boolean" ||
      !Array.isArray(data.plans) || data.plans.length > 256) {
    throw new IronCommercialConnectorError("integration.iron_plan_catalog_invalid");
  }
  const seen = new Set<string>();
  const plans: IronPublishedPlanVersion[] = [];
  for (const candidate of data.plans) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new IronCommercialConnectorError("integration.iron_plan_catalog_invalid");
    }
    const item = candidate as Record<string, unknown>;
    if (typeof item.plan_code !== "string" || !/^[A-Z][A-Z0-9_]{1,63}$/.test(item.plan_code) ||
        typeof item.display_name !== "string" || item.display_name.trim().length < 2 ||
        item.display_name.length > 160 ||
        !Number.isSafeInteger(item.version) || (item.version as number) < 1 ||
        typeof item.published_at !== "string" ||
        Number.isNaN(Date.parse(item.published_at))) {
      throw new IronCommercialConnectorError("integration.iron_plan_catalog_invalid");
    }
    const key = item.plan_code + ":" + item.version;
    if (seen.has(key)) throw new IronCommercialConnectorError("integration.iron_plan_catalog_duplicate");
    seen.add(key);
    plans.push({
      planCode: item.plan_code, displayName: item.display_name,
      version: item.version as number, publishedAt: item.published_at,
    });
  }
  return { plans, asOf: data.as_of, truncated: data.truncated };
}

/** Canonical plan-write source of truth is IRON, not FM billing price records. */
export interface IronPlanGovernanceCatalog {
  readonly plans: readonly {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly versions: readonly {
      readonly version: number;
      readonly status: "DRAFT" | "PUBLISHED" | "RETIRED";
      readonly entitlements: readonly {
        readonly featureKey: string;
        readonly kind: "FEATURE" | "LIMIT" | "POLICY";
        readonly featureEnabled: boolean | null;
        readonly limitValue: number | null;
        readonly policyValues: readonly string[] | null;
      }[];
    }[];
  }[];
  readonly capabilities: readonly {
    readonly key: string;
    readonly kind: "FEATURE" | "LIMIT" | "POLICY";
    readonly status: "ACTIVE" | "RETIRED";
    readonly description: string;
    readonly domain: string;
    readonly allowedPolicyValues: readonly string[] | null;
  }[];
}

export function parseIronPlanGovernanceCatalog(input: unknown): IronPlanGovernanceCatalog {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new IronCommercialConnectorError("integration.iron_governance_invalid");
  const catalog = input as Record<string, unknown>;
  if (catalog.schema_version !== "iron.fmcc.plan-governance.v1" ||
      catalog.product_code !== "IRON_FIT_CORE" ||
      !Array.isArray(catalog.plans) || catalog.plans.length > 256 ||
      !Array.isArray(catalog.capabilities) || catalog.capabilities.length > 512) {
    throw new IronCommercialConnectorError("integration.iron_governance_invalid");
  }
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const code = /^[A-Z][A-Z0-9_]{1,63}$/;
  const key = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
  const kinds = new Set(["FEATURE", "LIMIT", "POLICY"]);
  const statuses = new Set(["DRAFT", "PUBLISHED", "RETIRED"]);
  const capabilities = catalog.capabilities as Record<string, unknown>[];
  const plans = catalog.plans as Record<string, unknown>[];
  if (!capabilities.every(c => c && typeof c === "object" && !Array.isArray(c) &&
    typeof c.key === "string" && key.test(c.key) && kinds.has(String(c.kind)) &&
    (c.status === "ACTIVE" || c.status === "RETIRED") &&
    typeof c.description === "string" && typeof c.domain === "string" &&
    (c.allowedPolicyValues === null || Array.isArray(c.allowedPolicyValues) &&
      c.allowedPolicyValues.every(v => typeof v === "string" && code.test(v))))) {
    throw new IronCommercialConnectorError("integration.iron_governance_capability_invalid");
  }
  if (new Set(capabilities.map(c=>c.key)).size !== capabilities.length) throw new IronCommercialConnectorError("integration.iron_governance_duplicate");
  if (!plans.every(p => p && typeof p === "object" && !Array.isArray(p) &&
    typeof p.id === "string" && id.test(p.id) && typeof p.code === "string" &&
    code.test(p.code) && typeof p.name === "string" && p.name.length >= 2 &&
    Array.isArray(p.versions) && p.versions.length <= 64 &&
    p.versions.every((v: Record<string,unknown>) => v && Number.isSafeInteger(v.version) &&
      (v.version as number) >= 1 && statuses.has(String(v.status)) &&
      Array.isArray(v.entitlements) && v.entitlements.length <= 512 &&
      v.entitlements.every((e: Record<string,unknown>) => e &&
        typeof e.featureKey === "string" && key.test(e.featureKey) &&
        kinds.has(String(e.kind)) &&
        (e.featureEnabled === null || typeof e.featureEnabled === "boolean") &&
        (e.limitValue === null || Number.isSafeInteger(e.limitValue) && (e.limitValue as number) >= 0) &&
        (e.policyValues === null || Array.isArray(e.policyValues) &&
          e.policyValues.every(x => typeof x === "string")))))) {
    throw new IronCommercialConnectorError("integration.iron_governance_plan_invalid");
  }
  if (new Set(plans.map(p=>p.code)).size !== plans.length ||
      new Set(plans.map(p=>p.id)).size !== plans.length ||
      plans.some(p=>new Set((p.versions as Record<string,unknown>[]).map(v=>v.version)).size !== (p.versions as unknown[]).length)) {
    throw new IronCommercialConnectorError("integration.iron_governance_duplicate");
  }
  return { plans: plans as unknown as IronPlanGovernanceCatalog["plans"],
    capabilities: capabilities as unknown as IronPlanGovernanceCatalog["capabilities"] };
}

export interface IronAiUsageReport {
  readonly schema_version: "iron.fmcc.ai-usage.v1";
  readonly product_code: "IRON_FIT_CORE";
  readonly metric: "ai_execution_trace_count";
  readonly as_of: string;
  readonly window_start: string;
  readonly window_days: number;
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

export interface IronSubscriptionCommand {
  readonly action: "subscription.status.sync" | "subscription.plan.transition";
  readonly gymId: string;
  readonly expectedSubscriptionId: string;
  readonly commercialStatus:
    | "active"
    | "grace"
    | "delinquent"
    | "suspended"
    | "cancelled"
    | "renewal"
    | "upgrade"
    | "downgrade";
  readonly entitlementStatus?: "ACTIVE" | "SUSPENDED" | "CANCELED";
  readonly planCode?: string;
  readonly planVersion?: number;
  readonly transitionKind?: "UPGRADE" | "DOWNGRADE" | "PLAN_CHANGE";
  readonly reason: string;
}

export class IronCommercialConnectorError extends Error {
  constructor(code = "integration.iron_commercial_failure") {
    super(code);
  }
}

export function environmentIronSecretResolver(reference: string): string | undefined {
  if (!reference.startsWith("env:")) {
    throw new IronCommercialConnectorError("integration.iron_secret_reference_unsupported");
  }
  const name = reference.slice(4).trim();
  if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(name)) {
    throw new IronCommercialConnectorError("integration.iron_secret_reference_invalid");
  }
  return process.env[name]?.trim() || undefined;
}

export function environmentIronControlTenantId(): string | undefined {
  return process.env.FMCC_IRON_CONTROL_TENANT_ID?.trim() || undefined;
}

export function environmentIronAllowedOrigins(): readonly string[] {
  return (process.env.FMCC_IRON_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin);
}

function baseUrl(source: SourceDefinition, allowedOrigins: readonly string[]): string {
  const override = commercialOriginOverride(source, {
    enabled: commercialOriginOverrideEnabled(process.env.FMCC_IRON_SOURCE_ORIGIN_OVERRIDE),
    controlTenantId: environmentIronControlTenantId(),
    sourceType: IRON_COMMERCIAL_SOURCE_TYPE,
    secretRef: IRON_COMMERCIAL_SECRET_REF,
    configuredBaseUrl: process.env.FMCC_IRON_BASE_URL,
    allowedOrigins,
  });
  const raw = override ?? source.config.baseUrl;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new IronCommercialConnectorError("integration.iron_base_url_missing");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new IronCommercialConnectorError("integration.iron_base_url_invalid");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new IronCommercialConnectorError("integration.iron_base_url_insecure");
  }
  const allowed = new Set(allowedOrigins.map((value) => new URL(value).origin));
  if (!allowed.has(parsed.origin)) {
    throw new IronCommercialConnectorError("integration.iron_origin_not_allowed");
  }
  return parsed.toString().replace(/\/$/, "");
}

function token(source: SourceDefinition, resolver: IronSecretResolver): string {
  if (source.secretRef !== IRON_COMMERCIAL_SECRET_REF) {
    throw new IronCommercialConnectorError("integration.iron_secret_reference_invalid");
  }
  const value = resolver(source.secretRef)?.trim();
  if (!value || value.length < 32) {
    throw new IronCommercialConnectorError("integration.iron_service_token_unavailable");
  }
  return value;
}

function connectorFact(value: unknown): ConnectorFact {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IronCommercialConnectorError("integration.iron_fact_invalid");
  }
  const item = value as Record<string, unknown>;
  if (
    typeof item.external_id !== "string" ||
    typeof item.fact_type !== "string" ||
    !item.payload ||
    typeof item.payload !== "object" ||
    Array.isArray(item.payload) ||
    typeof item.source_timestamp !== "string"
  ) {
    throw new IronCommercialConnectorError("integration.iron_fact_invalid");
  }
  const timestamp = new Date(item.source_timestamp);
  if (Number.isNaN(timestamp.getTime())) {
    throw new IronCommercialConnectorError("integration.iron_fact_timestamp_invalid");
  }
  return {
    externalId: item.external_id,
    factType: item.fact_type,
    payload: item.payload as Record<string, unknown>,
    sourceTimestamp: timestamp,
  };
}

export class IronCommercialConnector implements Connector {
  readonly sourceType = IRON_COMMERCIAL_SOURCE_TYPE;
  readonly capabilities = [
    "commercial.snapshot",
    "commercial.facts",
    "commercial.subscription.commands",
  ] as const;

  constructor(
    private readonly resolveSecret: IronSecretResolver = environmentIronSecretResolver,
    private readonly fetcher: typeof fetch = fetch,
    private readonly allowedOrigins: IronAllowedOriginResolver = environmentIronAllowedOrigins,
    private readonly controlTenantId: IronControlTenantResolver = environmentIronControlTenantId,
  ) {}

  async health(
    context: ConnectorContext,
    source: SourceDefinition,
  ): Promise<"healthy" | "degraded" | "unavailable"> {
    try {
      const response = await this.request(context, source, "/api/v1/control-plane/fmcc/health");
      return response.ok ? "healthy" : "degraded";
    } catch {
      return "unavailable";
    }
  }

  async pull(
    context: ConnectorContext,
    source: SourceDefinition,
  ): Promise<ConnectorPullResult> {
    const snapshot = await this.snapshot(context, source);
    return {
      facts: snapshot.facts.map(connectorFact),
      nextCursor: snapshot.as_of,
    };
  }

  async snapshot(
    context: ConnectorContext,
    source: SourceDefinition,
  ): Promise<IronCommercialSnapshot> {
    const response = await this.request(context, source, "/api/v1/control-plane/fmcc/snapshot");
    if (!response.ok) {
      throw new IronCommercialConnectorError("integration.iron_snapshot_unavailable");
    }
    const body = (await response.json()) as Partial<IronCommercialSnapshot>;
    const collections = [
      body.customers,
      body.trials,
      body.subscriptions,
      body.entitlements,
      body.onboarding,
      body.billing_transactions,
      body.facts,
    ];
    if (
      body.schema_version !== "iron.fmcc.commercial.v1" ||
      body.product_code !== "IRON_FIT_CORE" ||
      typeof body.as_of !== "string" ||
      Number.isNaN(new Date(body.as_of).getTime()) ||
      collections.some((item) => !Array.isArray(item)) ||
      !body.summary ||
      typeof body.summary !== "object" ||
      !body.coverage ||
      typeof body.coverage !== "object"
    ) {
      throw new IronCommercialConnectorError("integration.iron_snapshot_contract_invalid");
    }
    return body as IronCommercialSnapshot;
  }

  async publishedPlanVersions(
    context: ConnectorContext,
    source: SourceDefinition,
  ): Promise<IronPublishedPlanCatalog> {
    const response = await this.request(context, source, "/api/v1/control-plane/fmcc/plan-versions");
    if (!response.ok) {
      throw new IronCommercialConnectorError("integration.iron_plan_catalog_unavailable");
    }
    return parseIronPublishedPlanCatalog(await response.json());
  }

  /** Separate authority from the readback/subscription-control credential. */
  async governanceCatalog(context: ConnectorContext, source: SourceDefinition): Promise<IronPlanGovernanceCatalog> {
    const response = await this.request(context, source,
      "/api/v1/control-plane/fmcc/plan-governance/catalog", {}, "plan-governance");
    if (!response.ok) throw new IronCommercialConnectorError("integration.iron_governance_unavailable");
    return parseIronPlanGovernanceCatalog(await response.json());
  }

  async governPlan(
    context: ConnectorContext, source: SourceDefinition,
    action: "createPlan" | "createVersion" | "setEntitlement" | "publishVersion",
    planId: string | undefined, version: number | undefined, body: Record<string, unknown> = {},
  ): Promise<void> {
    const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (action !== "createPlan" && (!planId || !idPattern.test(planId))) {
      throw new IronCommercialConnectorError("integration.iron_governance_plan_id_invalid");
    }
    if ((action === "setEntitlement" || action === "publishVersion") &&
        (!Number.isSafeInteger(version) || (version ?? 0) < 1)) {
      throw new IronCommercialConnectorError("integration.iron_governance_version_invalid");
    }
    const prefix = "/api/v1/control-plane/fmcc/plan-governance/plans";
    const path = action === "createPlan" ? prefix :
      action === "createVersion" ? prefix + "/" + planId + "/versions" :
      action === "setEntitlement" ? prefix + "/" + planId + "/versions/" + version + "/entitlements" :
      prefix + "/" + planId + "/versions/" + version + "/publish";
    const response = await this.request(context, source, path, {
      method: action === "setEntitlement" ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: action === "publishVersion" ? "{}" : JSON.stringify(body),
    }, "plan-governance");
    if (!response.ok) {
      throw new IronCommercialConnectorError("integration.iron_governance_write_rejected");
    }
  }

  async aiUsage(
    context: ConnectorContext,
    source: SourceDefinition,
  ): Promise<IronAiUsageReport> {
    const response = await this.request(context, source, "/api/v1/control-plane/fmcc/usage/ai?days=30");
    if (!response.ok) throw new IronCommercialConnectorError("integration.iron_ai_usage_unavailable");
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new IronCommercialConnectorError("integration.iron_ai_usage_contract_invalid");
    }
    const report = body as Partial<IronAiUsageReport>;
    if (
      report.schema_version !== "iron.fmcc.ai-usage.v1" ||
      report.product_code !== "IRON_FIT_CORE" ||
      report.metric !== "ai_execution_trace_count" ||
      typeof report.as_of !== "string" ||
      Number.isNaN(new Date(report.as_of).getTime()) ||
      typeof report.window_start !== "string" ||
      Number.isNaN(new Date(report.window_start).getTime()) ||
      report.window_days !== 30 ||
      !Array.isArray(report.unavailable_metrics) ||
      !["input_tokens", "output_tokens", "provider_cost_minor"].every(
        metric => report.unavailable_metrics?.includes(metric),
      ) ||
      !Array.isArray(report.usage) ||
      !report.usage.every(item =>
        item && typeof item.tenant_id === "string" && item.tenant_id.length > 0 &&
        typeof item.capability === "string" && typeof item.provider_code === "string" &&
        typeof item.model_code === "string" && typeof item.status === "string" &&
        Number.isSafeInteger(item.execution_count) && item.execution_count >= 0
      )
    ) {
      throw new IronCommercialConnectorError("integration.iron_ai_usage_contract_invalid");
    }
    return report as IronAiUsageReport;
  }

  async subscriptionCommand(
    context: ConnectorContext,
    source: SourceDefinition,
    command: IronSubscriptionCommand,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    if (!idempotencyKey.trim()) {
      throw new IronCommercialConnectorError("integration.iron_idempotency_key_missing");
    }
    const response = await this.request(
      context,
      source,
      "/api/v1/control-plane/fmcc/subscription/commands",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(command),
      },
    );
    if (!response.ok) {
      throw new IronCommercialConnectorError("integration.iron_subscription_command_rejected");
    }
    return (await response.json()) as Record<string, unknown>;
  }

  private async request(
    context: ConnectorContext,
    source: SourceDefinition,
    path: string,
    init: RequestInit = {},
    authority: "commercial" | "plan-governance" = "commercial",
  ): Promise<Response> {
    const allowedTenant = this.controlTenantId();
    if (!allowedTenant || context.tenantId !== allowedTenant) {
      throw new IronCommercialConnectorError("integration.iron_control_tenant_denied");
    }
    if (
      source.tenantId !== context.tenantId ||
      source.sourceType !== IRON_COMMERCIAL_SOURCE_TYPE ||
      source.secretRef !== IRON_COMMERCIAL_SECRET_REF ||
      source.authoritativeDomain !== "commercial" ||
      source.productId === undefined
    ) {
      throw new IronCommercialConnectorError("integration.iron_source_scope_denied");
    }
    if (!Number.isFinite(context.timeoutMs) || context.timeoutMs < 1 || context.timeoutMs > 120_000) {
      throw new IronCommercialConnectorError("integration.iron_timeout_invalid");
    }

    const headers = new Headers(init.headers);
    const commercialToken = token(source, this.resolveSecret);
    const governanceToken = authority === "plan-governance"
      ? this.resolveSecret("env:FMCC_IRON_PLAN_GOVERNANCE_TOKEN")?.trim()
      : undefined;
    if (authority === "plan-governance" &&
        (!governanceToken || governanceToken.length < 32 || governanceToken === commercialToken)) {
      throw new IronCommercialConnectorError("integration.iron_plan_governance_secret_unavailable");
    }
    headers.set("authorization", "Bearer " +
      (authority === "plan-governance" ? governanceToken : commercialToken));
    headers.set("x-correlation-id", context.correlationId);

    const controller = new AbortController();
    const upstreamSignal = init.signal;
    const abortFromUpstream = () => controller.abort();
    if (upstreamSignal?.aborted) controller.abort();
    else upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });
    const timer = setTimeout(() => controller.abort(), context.timeoutMs);
    try {
      const response = await this.fetcher(baseUrl(source, this.allowedOrigins()) + path, {
        ...init,
        // Never follow upstream redirects from the authenticated S2S boundary:
        // only the explicitly allowlisted canonical IRON origin may receive
        // this request, including reads and financial commands.
        redirect: "error",
        cache: "no-store",
        headers,
        signal: controller.signal,
      });
      if (response.status === 429 || response.status >= 500) {
        throw new RetryableConnectorError("integration.iron_upstream_retryable");
      }
      return response;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new IronCommercialConnectorError("integration.iron_request_timeout");
      }
      throw error;
    } finally {
      clearTimeout(timer);
      upstreamSignal?.removeEventListener("abort", abortFromUpstream);
    }
  }
}
