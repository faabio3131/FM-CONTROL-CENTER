import type {
  Connector,
  ConnectorContext,
  ConnectorFact,
  ConnectorPullResult,
  SourceDefinition,
} from "@/domain/integration/contracts";

export const KORDENA_COMMERCIAL_SOURCE_TYPE = "kordena-commercial-v1";
export const KORDENA_COMMERCIAL_SECRET_REF =
  "env:FMCC_KORDENA_CONTROL_PLANE_TOKEN";

export type SecretResolver = (reference: string) => string | undefined;
export type AllowedOriginResolver = () => readonly string[];
export type ControlTenantResolver = () => string | undefined;

export type KordenaObservabilityMetricStatus =
  | "available"
  | "partial"
  | "unavailable";

export interface KordenaObservabilityMetric {
  readonly metric_id: string;
  readonly status: KordenaObservabilityMetricStatus;
  readonly value: unknown;
  readonly unit: string;
  readonly as_of: string;
  readonly quality_status: string;
  readonly source_authority: string;
  readonly provenance_refs: readonly string[];
  readonly definition: string;
}

export interface KordenaCommercialObservability {
  readonly schema_version: "kordena.observability.kca13.v1";
  readonly as_of: string;
  readonly internal_test_excluded: true;
  readonly metrics: Readonly<Record<string, KordenaObservabilityMetric>>;
  readonly antiabuse: Readonly<Record<string, unknown>>;
  readonly health: Readonly<Record<string, unknown>>;
  readonly finops: Readonly<Record<string, unknown>>;
  readonly alerts: readonly Readonly<Record<string, unknown>>[];
  readonly tracing: Readonly<Record<string, unknown>>;
  readonly coverage: Readonly<Record<string, string>>;
}

export interface KordenaCommercialSnapshot {
  readonly schema_version: "kordena.fmcc.commercial.v1";
  readonly product_code: "KORDENA";
  readonly as_of: string;
  readonly customers: readonly Record<string, unknown>[];
  readonly product_accounts: readonly Record<string, unknown>[];
  readonly trials: readonly Record<string, unknown>[];
  readonly subscriptions: readonly Record<string, unknown>[];
  readonly billing_transactions: readonly Record<string, unknown>[];
  readonly entitlements: readonly Record<string, unknown>[];
  readonly catalog: readonly Record<string, unknown>[];
  readonly summary: Readonly<Record<string, number>>;
  readonly facts: readonly {
    external_id: string;
    fact_type: string;
    payload: Record<string, unknown>;
    source_timestamp: string;
  }[];
  readonly observability?: KordenaCommercialObservability;
  readonly coverage: Readonly<Record<string, string>>;
}

export interface KordenaCommercialCommand {
  readonly actor: {
    readonly user_id: string;
    readonly role: "owner" | "admin";
    readonly step_up_at: string;
  };
  readonly action:
    | "plan_version.create"
    | "plan_version.validate"
    | "plan_version.preview"
    | "plan_version.publish"
    | "price.create"
    | "price.validate"
    | "price.preview"
    | "price.publish"
    | "promotion.create"
    | "promotion_version.create"
    | "promotion_version.validate"
    | "promotion_version.preview"
    | "promotion_version.publish";
  readonly resource_id?: string;
  readonly payload: Record<string, unknown>;
}

export class KordenaCommercialConnectorError extends Error {
  constructor(code = "integration.kordena_commercial_failure") {
    super(code);
  }
}

export function environmentSecretResolver(reference: string): string | undefined {
  if (!reference.startsWith("env:")) {
    throw new KordenaCommercialConnectorError(
      "integration.kordena_secret_reference_unsupported",
    );
  }
  const name = reference.slice(4).trim();
  if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(name)) {
    throw new KordenaCommercialConnectorError(
      "integration.kordena_secret_reference_invalid",
    );
  }
  return process.env[name]?.trim() || undefined;
}

export function environmentKordenaControlTenantId(): string | undefined {
  return process.env.FMCC_KORDENA_CONTROL_TENANT_ID?.trim() || undefined;
}

export function environmentKordenaAllowedOrigins(): readonly string[] {
  return (process.env.FMCC_KORDENA_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin);
}

function sourceBaseUrl(
  source: SourceDefinition,
  allowedOrigins: readonly string[],
): string {
  const raw = source.config.baseUrl;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new KordenaCommercialConnectorError(
      "integration.kordena_base_url_missing",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new KordenaCommercialConnectorError(
      "integration.kordena_base_url_invalid",
    );
  }
  if (parsed.protocol !== "https:") {
    throw new KordenaCommercialConnectorError(
      "integration.kordena_base_url_insecure",
    );
  }
  if (parsed.username || parsed.password) {
    throw new KordenaCommercialConnectorError(
      "integration.kordena_base_url_credentials_forbidden",
    );
  }
  const allowed = new Set(
    allowedOrigins.map((value) => new URL(value).origin),
  );
  if (!allowed.has(parsed.origin)) {
    throw new KordenaCommercialConnectorError(
      "integration.kordena_origin_not_allowed",
    );
  }
  return parsed.toString().replace(/\/$/, "");
}

function serviceToken(
  source: SourceDefinition,
  resolveSecret: SecretResolver,
): string {
  if (source.secretRef !== KORDENA_COMMERCIAL_SECRET_REF) {
    throw new KordenaCommercialConnectorError(
      "integration.kordena_secret_reference_invalid",
    );
  }
  const token = resolveSecret(source.secretRef)?.trim();
  if (!token || token.length < 32) {
    throw new KordenaCommercialConnectorError(
      "integration.kordena_service_token_unavailable",
    );
  }
  return token;
}

function fact(value: unknown): ConnectorFact {
  if (!value || typeof value !== "object") {
    throw new KordenaCommercialConnectorError(
      "integration.kordena_fact_invalid",
    );
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
    throw new KordenaCommercialConnectorError(
      "integration.kordena_fact_invalid",
    );
  }
  const timestamp = new Date(item.source_timestamp);
  if (Number.isNaN(timestamp.getTime())) {
    throw new KordenaCommercialConnectorError(
      "integration.kordena_fact_timestamp_invalid",
    );
  }
  return {
    externalId: item.external_id,
    factType: item.fact_type,
    payload: item.payload as Record<string, unknown>,
    sourceTimestamp: timestamp,
  };
}

const KCA13_METRIC_KEYS = [
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

function validObservabilityMetric(
  value: unknown,
  expectedMetricId: string,
): value is KordenaObservabilityMetric {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const status = item.status;
  return (
    item.metric_id === expectedMetricId &&
    (status === "available" ||
      status === "partial" ||
      status === "unavailable") &&
    typeof item.unit === "string" &&
    typeof item.as_of === "string" &&
    !Number.isNaN(new Date(item.as_of).getTime()) &&
    typeof item.quality_status === "string" &&
    typeof item.source_authority === "string" &&
    Array.isArray(item.provenance_refs) &&
    item.provenance_refs.every((ref) => typeof ref === "string") &&
    typeof item.definition === "string"
  );
}

function validKca13Observability(
  value: unknown,
): value is KordenaCommercialObservability {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const metrics =
    item.metrics && typeof item.metrics === "object" && !Array.isArray(item.metrics)
      ? (item.metrics as Record<string, unknown>)
      : null;
  return (
    item.schema_version === "kordena.observability.kca13.v1" &&
    typeof item.as_of === "string" &&
    !Number.isNaN(new Date(item.as_of).getTime()) &&
    item.internal_test_excluded === true &&
    metrics !== null &&
    KCA13_METRIC_KEYS.every((key) =>
      validObservabilityMetric(metrics[key], key),
    ) &&
    !!item.antiabuse &&
    typeof item.antiabuse === "object" &&
    !Array.isArray(item.antiabuse) &&
    !!item.health &&
    typeof item.health === "object" &&
    !Array.isArray(item.health) &&
    !!item.finops &&
    typeof item.finops === "object" &&
    !Array.isArray(item.finops) &&
    Array.isArray(item.alerts) &&
    !!item.tracing &&
    typeof item.tracing === "object" &&
    !Array.isArray(item.tracing) &&
    !!item.coverage &&
    typeof item.coverage === "object" &&
    !Array.isArray(item.coverage)
  );
}

export class KordenaCommercialConnector implements Connector {
  readonly sourceType = KORDENA_COMMERCIAL_SOURCE_TYPE;
  readonly capabilities = [
    "commercial.snapshot",
    "commercial.facts",
    "commercial.catalog.commands",
  ] as const;

  constructor(
    private readonly resolveSecret: SecretResolver = environmentSecretResolver,
    private readonly fetcher: typeof fetch = fetch,
    private readonly allowedOrigins: AllowedOriginResolver =
      environmentKordenaAllowedOrigins,
    private readonly controlTenantId: ControlTenantResolver =
      environmentKordenaControlTenantId,
  ) {}

  async health(
    context: ConnectorContext,
    source: SourceDefinition,
  ): Promise<"healthy" | "degraded" | "unavailable"> {
    try {
      const response = await this.request(
        context,
        source,
        "/v1/control-plane/fmcc/health",
      );
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
      facts: snapshot.facts.map(fact),
      nextCursor: snapshot.as_of,
    };
  }

  async snapshot(
    context: ConnectorContext,
    source: SourceDefinition,
  ): Promise<KordenaCommercialSnapshot> {
    const response = await this.request(
      context,
      source,
      "/v1/control-plane/fmcc/snapshot",
    );
    if (!response.ok) {
      throw new KordenaCommercialConnectorError(
        "integration.kordena_snapshot_unavailable",
      );
    }
    const body = (await response.json()) as Partial<KordenaCommercialSnapshot>;
    const requiredCollections = [
      body.customers,
      body.product_accounts,
      body.trials,
      body.subscriptions,
      body.billing_transactions,
      body.entitlements,
      body.catalog,
      body.facts,
    ];
    const requiredSummaryKeys = [
      "customers",
      "internal_test_customers",
      "active_trials",
      "active_subscriptions",
      "past_due_subscriptions",
      "suspended_subscriptions",
      "confirmed_payments",
      "failed_payments",
      "reconciled_transactions",
      "users",
      "units",
    ] as const;
    const summary =
      body.summary && typeof body.summary === "object"
        ? body.summary
        : null;
    const summaryValid =
      summary !== null &&
      requiredSummaryKeys.every(
        (key) =>
          typeof summary[key] === "number" &&
          Number.isFinite(summary[key]) &&
          summary[key] >= 0,
      );
    const observabilityValid =
      body.observability === undefined ||
      validKca13Observability(body.observability);

    if (
      body.schema_version !== "kordena.fmcc.commercial.v1" ||
      body.product_code !== "KORDENA" ||
      typeof body.as_of !== "string" ||
      Number.isNaN(new Date(body.as_of).getTime()) ||
      requiredCollections.some((collection) => !Array.isArray(collection)) ||
      !body.coverage ||
      typeof body.coverage !== "object" ||
      !summaryValid ||
      !observabilityValid
    ) {
      throw new KordenaCommercialConnectorError(
        "integration.kordena_snapshot_contract_invalid",
      );
    }
    return body as KordenaCommercialSnapshot;
  }

  async command(
    context: ConnectorContext,
    source: SourceDefinition,
    input: KordenaCommercialCommand,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    const response = await this.request(
      context,
      source,
      "/v1/control-plane/fmcc/catalog/commands",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) {
      const failure = (await response.json().catch(() => null)) as
        | { error?: unknown }
        | null;
      const safeCode =
        typeof failure?.error === "string"
          ? failure.error
          : "integration.kordena_command_rejected";
      throw new KordenaCommercialConnectorError(safeCode);
    }
    return (await response.json()) as Record<string, unknown>;
  }

  private request(
    context: ConnectorContext,
    source: SourceDefinition,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const allowedTenant = this.controlTenantId();
    if (!allowedTenant || context.tenantId !== allowedTenant) {
      throw new KordenaCommercialConnectorError(
        "integration.kordena_control_tenant_denied",
      );
    }
    const token = serviceToken(source, this.resolveSecret);
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.set("x-correlation-id", context.correlationId);
    return this.fetcher(`${sourceBaseUrl(source, this.allowedOrigins())}${path}`, {
      ...init,
      headers,
    });
  }
}
