import { createHash } from "node:crypto";
import {
  RetryableConnectorError,
  type Connector, type ConnectorContext, type ConnectorFact,
  type ConnectorPullResult, type SourceDefinition,
} from "@/domain/integration/contracts";
import {
  UNIVERSAL_SAAS_SCHEMA_VERSION, UNIVERSAL_SAAS_SOURCE_TYPE, UNIVERSAL_SAAS_USAGE_PATH,
  isValidSaasSlug, saasEnvKey, universalSaasSecretRef,
  type UniversalLimitStatus, type UniversalUsageEnvelope, type UniversalUsageMetric,
  type UniversalUsageSnapshot,
} from "@/domain/integration/universal-saas-contract";

/** Universal, read-only, usage-only connector. NOT a billing or entitlement authority. */
export class UniversalSaasError extends Error {
  constructor(code: string) { super(code); this.name = "UniversalSaasError"; }
}
const MAX_BODY_BYTES = 131_072;
const MAX_SNAPSHOTS = 128;
const MAX_METRICS = 24;

function record(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new UniversalSaasError("integration.universal_schema_invalid");
  }
  return value as Record<string, unknown>;
}
function counter(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new UniversalSaasError("integration.universal_counter_invalid");
  }
  return value;
}
function isoDate(value: unknown): Date {
  if (typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new UniversalSaasError("integration.universal_date_invalid");
  }
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new UniversalSaasError("integration.universal_date_invalid");
  return result;
}
function safeExternalTenant(value: unknown): string {
  if (typeof value !== "string" || value.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
    throw new UniversalSaasError("integration.universal_external_tenant_invalid");
  }
  return value;
}
function boundedList(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new UniversalSaasError("integration.universal_collection_invalid");
  }
  return value;
}
function metric(value: unknown): UniversalUsageMetric {
  const raw = record(value);
  if (typeof raw.metricId !== "string" || raw.metricId.length > 96 ||
    !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){1,4}$/.test(raw.metricId)) {
    throw new UniversalSaasError("integration.universal_metric_invalid");
  }
  if (raw.unit !== "tokens" && raw.unit !== "count") {
    throw new UniversalSaasError("integration.universal_unit_invalid");
  }
  const limitStatus: UniversalLimitStatus = raw.limitStatus === "bounded" ||
    raw.limitStatus === "unlimited" || raw.limitStatus === "unknown"
    ? raw.limitStatus
    : (() => { throw new UniversalSaasError("integration.universal_limit_state_invalid"); })();
  if (limitStatus === "bounded" && raw.limit === null) {
    throw new UniversalSaasError("integration.universal_limit_missing");
  }
  if (limitStatus !== "bounded" && raw.limit !== null) {
    throw new UniversalSaasError("integration.universal_limit_invalid");
  }
  return {
    metricId: raw.metricId, unit: raw.unit, quantity: counter(raw.quantity),
    limitStatus, limit: limitStatus === "bounded" ? counter(raw.limit) : null,
  };
}

export function parseUniversalSaasUsage(
  value: unknown,
  expected: { readonly correlationId: string; readonly tenantId: string;
    readonly productId: string; readonly productSlug: string },
): { readonly facts: readonly ConnectorFact[]; readonly cursor: string } {
  const body = record(value);
  if (body.schemaVersion !== UNIVERSAL_SAAS_SCHEMA_VERSION ||
      body.productSlug !== expected.productSlug ||
      body.productId !== expected.productId ||
      body.commandTenantId !== expected.tenantId ||
      body.correlationId !== expected.correlationId ||
      body.authority !== "saas-runtime") {
    throw new UniversalSaasError("integration.universal_identity_mismatch");
  }
  const observedAt = isoDate(body.observedAt);
  const raw = boundedList(body.snapshots, MAX_SNAPSHOTS);
  const seen = new Set<string>();
  const facts: ConnectorFact[] = raw.map(item => {
    const snapshot = record(item);
    const externalTenantRef = safeExternalTenant(snapshot.externalTenantRef);
    const start = isoDate(snapshot.periodStart);
    const end = isoDate(snapshot.periodEnd);
    if (end < start || observedAt < start) {
      throw new UniversalSaasError("integration.universal_period_invalid");
    }
    const key = `${externalTenantRef}:${start.toISOString()}:${end.toISOString()}`;
    if (seen.has(key)) throw new UniversalSaasError("integration.universal_duplicate_tenant_period");
    seen.add(key);
    const seenMetrics = new Set<string>();
    const metrics = boundedList(snapshot.metrics, MAX_METRICS).map(entry => {
      const result = metric(entry);
      if (seenMetrics.has(result.metricId)) {
        throw new UniversalSaasError("integration.universal_duplicate_metric");
      }
      seenMetrics.add(result.metricId);
      return result;
    }).sort((a, b) => a.metricId.localeCompare(b.metricId));
    const projection: UniversalUsageSnapshot = {
      externalTenantRef,
      periodStart: start.toISOString(), periodEnd: end.toISOString(), metrics,
    };
    const fingerprint = createHash("sha256").update(JSON.stringify(projection)).digest("hex");
    return {
      externalId: "fmcc-saas-usage-v1:" + fingerprint,
      factType: "saas.usage.snapshot.v1",
      payload: {
        ...projection,
        sourceAuthority: "saas-runtime",
        measurementStatus: "reported_not_financially_reconciled",
        // No raw body, customer profile, invoice, payment, price or PII.
      },
      sourceTimestamp: observedAt,
    };
  });
  facts.sort((a, b) => a.externalId.localeCompare(b.externalId));
  const cursor = createHash("sha256")
    .update(facts.map(x => x.externalId).join("|")).digest("hex");
  return { facts, cursor };
}

/** No default origin, token or tenant: every product must be provisioned separately. */
export class UniversalSaasUsageConnector implements Connector {
  readonly sourceType = UNIVERSAL_SAAS_SOURCE_TYPE;
  readonly capabilities = ["saas.usage.readonly"] as const;
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly readEnv: (key: string) => string | undefined = key => process.env[key],
  ) {}

  private async read(context: ConnectorContext, source: SourceDefinition): Promise<unknown> {
    const slug = source.config.productSlug;
    if (typeof slug !== "string" || !isValidSaasSlug(slug) ||
      source.sourceType !== this.sourceType ||
      source.mappingVersion !== this.sourceType ||
      source.authoritativeDomain !== "operational" ||
      source.syncMode !== "pull" || !source.productId ||
      source.tenantId !== context.tenantId ||
      source.secretRef !== universalSaasSecretRef(slug)) {
      throw new UniversalSaasError("integration.universal_binding_denied");
    }
    const key = saasEnvKey(slug);
    const commandTenant = this.readEnv(`FMCC_SAAS_${key}_COMMAND_TENANT_ID`);
    const secret = this.readEnv(`FMCC_SAAS_${key}_CONTROL_TOKEN`);
    const allowedRaw = this.readEnv(`FMCC_SAAS_${key}_ALLOWED_ORIGINS`);
    if (!commandTenant || commandTenant !== context.tenantId ||
      !secret || secret.trim().length < 32 || !allowedRaw) {
      throw new UniversalSaasError("integration.universal_runtime_unconfigured");
    }
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(context.correlationId) ||
      !Number.isSafeInteger(context.timeoutMs) || context.timeoutMs < 100 ||
      context.timeoutMs > 120_000) {
      throw new UniversalSaasError("integration.universal_context_invalid");
    }
    const origins = allowedRaw.split(",").map(x => x.trim());
    if (!origins.length || origins.some(origin => {
      try {
        const parsed = new URL(origin);
        return parsed.origin !== origin || parsed.protocol !== "https:" ||
          parsed.username !== "" || parsed.password !== "";
      } catch { return true; }
    })) throw new UniversalSaasError("integration.universal_origin_policy_invalid");
    const base = source.config.baseUrl;
    if (typeof base !== "string" || base.length > 512) {
      throw new UniversalSaasError("integration.universal_origin_denied");
    }
    let url: URL;
    try { url = new URL(base); }
    catch { throw new UniversalSaasError("integration.universal_origin_denied"); }
    if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash ||
      !origins.includes(url.origin)) {
      throw new UniversalSaasError("integration.universal_origin_denied");
    }
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abort.abort();
        reject(new RetryableConnectorError("integration.universal_timeout"));
      }, context.timeoutMs);
    });
    try {
      let response: Response;
      try {
        response = await Promise.race([
          this.fetcher(url.origin + UNIVERSAL_SAAS_USAGE_PATH, {
            method: "GET", redirect: "error", cache: "no-store",
            signal: abort.signal,
            headers: {
              authorization: "Bearer " + secret.trim(),
              "x-correlation-id": context.correlationId,
              accept: "application/json",
            },
          }),
          deadline,
        ]);
      } catch (error) {
        if (error instanceof RetryableConnectorError) throw error;
        throw new RetryableConnectorError("integration.universal_transport_failure");
      }
      if (response.status === 429 || response.status >= 500) {
        throw new RetryableConnectorError("integration.universal_upstream_unavailable");
      }
      if (!response.ok) throw new UniversalSaasError("integration.universal_upstream_denied");
      const length = response.headers.get("content-length");
      if (length && (!/^(0|[1-9]\d*)$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
        throw new UniversalSaasError("integration.universal_response_oversized");
      }
      if (!response.body) throw new UniversalSaasError("integration.universal_response_invalid");
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let received = 0;
      let body = "";
      try {
        while (true) {
          const { done, value } = await Promise.race([reader.read(), deadline]);
          if (done) break;
          received += value.byteLength;
          if (received > MAX_BODY_BYTES) {
            throw new UniversalSaasError("integration.universal_response_oversized");
          }
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      } catch (error) {
        void reader.cancel().catch(() => {});
        if (error instanceof UniversalSaasError || error instanceof RetryableConnectorError) throw error;
        throw new UniversalSaasError("integration.universal_response_invalid");
      } finally { reader.releaseLock(); }
      try { return JSON.parse(body) as unknown; }
      catch { throw new UniversalSaasError("integration.universal_response_invalid"); }
    } finally { clearTimeout(timer); }
  }

  async health(context: ConnectorContext, source: SourceDefinition): Promise<"healthy" | "degraded" | "unavailable"> {
    try {
      parseUniversalSaasUsage(await this.read(context, source), {
        correlationId: context.correlationId, tenantId: context.tenantId,
        productId: source.productId ?? "", productSlug: source.config.productSlug as string,
      });
      return "healthy";
    } catch { return "unavailable"; }
  }
  async pull(context: ConnectorContext, source: SourceDefinition, cursor?: string): Promise<ConnectorPullResult> {
    const envelope = await this.read(context, source);
    const result = parseUniversalSaasUsage(envelope, {
      correlationId: context.correlationId, tenantId: context.tenantId,
      productId: source.productId ?? "", productSlug: source.config.productSlug as string,
    });
    return { facts: cursor === result.cursor ? [] : result.facts, nextCursor: result.cursor };
  }
}

export type { UniversalUsageEnvelope };
