import { createHash } from "node:crypto";
import {
  RetryableConnectorError,
  type Connector,
  type ConnectorContext,
  type ConnectorFact,
  type ConnectorPullResult,
  type SourceDefinition,
} from "@/domain/integration/contracts";

/** NFCore-owned read model; never imports a Kordena connector or a billing engine. */
export const NFCORE_COGNITIVE_SOURCE_TYPE = "nfcore-cognitive-metrics-v1";
export const NFCORE_COGNITIVE_SECRET_REF = "env:FMCC_NFCORE_CONTROL_PLANE_TOKEN";
export type NfcoreSecretResolver = (reference: string) => string | undefined;

export class NfcoreConnectorError extends Error {
  constructor(code: string) { super(code); this.name = "NfcoreConnectorError"; }
}
export function defaultNfcoreSecretResolver(reference: string): string | undefined {
  if (reference !== NFCORE_COGNITIVE_SECRET_REF) {
    throw new NfcoreConnectorError("nfcore.secret_reference_denied");
  }
  return process.env.FMCC_NFCORE_CONTROL_PLANE_TOKEN?.trim() || undefined;
}
function allowlist(): readonly string[] {
  return (process.env.FMCC_NFCORE_ALLOWED_ORIGINS ?? "").split(",").map(x => x.trim()).filter(Boolean);
}
function controlTenant(): string | undefined {
  return process.env.FMCC_NFCORE_CONTROL_TENANT_ID?.trim() || undefined;
}
function asCounter(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new NfcoreConnectorError("nfcore.counter_invalid");
  }
  return value as number;
}
function asDate(value: unknown): Date {
  if (typeof value !== "string" || value.length > 64) throw new NfcoreConnectorError("nfcore.date_invalid");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new NfcoreConnectorError("nfcore.date_invalid");
  return date;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NfcoreConnectorError("nfcore.contract_invalid");
  }
  return value as Record<string, unknown>;
}
function sourceUrl(source: SourceDefinition, allowed: readonly string[]): string {
  const raw = source.config.baseUrl;
  if (typeof raw !== "string" || raw.length > 512) throw new NfcoreConnectorError("nfcore.url_invalid");
  let url: URL;
  try { url = new URL(raw); } catch { throw new NfcoreConnectorError("nfcore.url_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new NfcoreConnectorError("nfcore.url_insecure");
  }
  if (!allowed.length || !allowed.every(x => {
    try { const v = new URL(x); return v.protocol === "https:" && v.origin === x; } catch { return false; }
  }) || !allowed.includes(url.origin)) {
    throw new NfcoreConnectorError("nfcore.origin_not_allowed");
  }
  return url.origin + "/v1/command/cognitive/metrics";
}
export function parseNfcoreMetricsEnvelope(
  unknownBody: unknown, expectedCorrelation: string,
): { facts: readonly ConnectorFact[]; cursor: string } {
  const b = object(unknownBody);
  if (b.schemaVersion !== "nfcore.cognitive.metrics/v1" ||
      b.mappingVersion !== "1" || b.productId !== "nfcore" ||
      b.source !== "nfcore.cognitive" || b.correlationId !== expectedCorrelation ||
      typeof b.aiEnabled !== "boolean") throw new NfcoreConnectorError("nfcore.schema_mismatch");
  const freshness = object(b.freshness);
  const provenance = object(b.provenance);
  if (freshness.scope !== "process" || freshness.semantics !== "monotonic_counters_since" ||
      provenance.authority !== "nfcore-cognitive-core" || provenance.deterministicCounters !== true) {
    throw new NfcoreConnectorError("nfcore.provenance_invalid");
  }
  const observedAt = asDate(b.observedAt);
  const rawFacts = object(b.facts);
  const since = asDate(rawFacts.since);
  const lastObservedAt = rawFacts.lastObservedAt === null ? null : asDate(rawFacts.lastObservedAt);
  if (since > observedAt || (lastObservedAt && lastObservedAt > observedAt)) {
    throw new NfcoreConnectorError("nfcore.timeline_invalid");
  }
  const requests = object(rawFacts.requests);
  const model = object(rawFacts.model);
  const requestCount = asCounter(requests.total);
  const modelCalls = asCounter(model.calls);
  const inputTokens = asCounter(model.inputTokens);
  const outputTokens = asCounter(model.outputTokens);
  const costReportedCalls = asCounter(model.costReportedCalls);
  const costMicroBrl = model.costMicroBrl === null ? null : asCounter(model.costMicroBrl);
  if (modelCalls > requestCount || costReportedCalls > modelCalls ||
      (costReportedCalls === 0 && costMicroBrl !== null) ||
      (costReportedCalls > 0 && costMicroBrl === null)) {
    throw new NfcoreConnectorError("nfcore.counter_inconsistent");
  }
  const cleanPayload = {
    since: since.toISOString(), lastObservedAt: lastObservedAt?.toISOString() ?? null,
    aiEnabled: b.aiEnabled, requests: requestCount,
    modelCalls, inputTokens, outputTokens, costReportedCalls, costMicroBrl,
    freshnessScope: "process", authority: "nfcore-cognitive-core",
    // Deliberately never ingest raw 'tenants' map, evidence, prompts or PII.
  };
  const stableId = createHash("sha256").update(JSON.stringify(cleanPayload)).digest("hex");
  return {
    facts: [{
      externalId: "nfcore-cognitive-v1:" + stableId,
      factType: "nfcore.cognitive.process_snapshot",
      payload: cleanPayload,
      sourceTimestamp: lastObservedAt ?? observedAt,
    }],
    cursor: stableId,
  };
}

export class NfcoreCognitiveConnector implements Connector {
  readonly sourceType = NFCORE_COGNITIVE_SOURCE_TYPE;
  readonly capabilities = ["cognitive.metrics.readonly"] as const;
  constructor(
    private readonly resolveSecret: NfcoreSecretResolver = defaultNfcoreSecretResolver,
    private readonly fetcher: typeof fetch = fetch,
    private readonly allowedOrigins: () => readonly string[] = allowlist,
    private readonly authorizedTenant: () => string | undefined = controlTenant,
  ) {}
  private async read(context: ConnectorContext, source: SourceDefinition): Promise<unknown> {
    const approvedTenant = this.authorizedTenant();
    if (!approvedTenant || approvedTenant !== context.tenantId ||
        source.tenantId !== context.tenantId || !source.productId ||
        source.sourceType !== this.sourceType || source.secretRef !== NFCORE_COGNITIVE_SECRET_REF ||
        source.authoritativeDomain !== "commercial" || source.syncMode !== "pull" ||
        source.mappingVersion !== this.sourceType) {
      throw new NfcoreConnectorError("nfcore.scope_denied");
    }
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(context.correlationId) ||
        !Number.isSafeInteger(context.timeoutMs) || context.timeoutMs < 100 || context.timeoutMs > 120000) {
      throw new NfcoreConnectorError("nfcore.context_invalid");
    }
    const secret = this.resolveSecret(NFCORE_COGNITIVE_SECRET_REF)?.trim();
    if (!secret || secret.length < 32) throw new NfcoreConnectorError("nfcore.secret_unavailable");
    const url = sourceUrl(source, this.allowedOrigins());
    const abort = new AbortController();
    const t = setTimeout(() => abort.abort(), context.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "GET", redirect: "error", cache: "no-store",
        headers: { authorization: "Bearer " + secret, "x-correlation-id": context.correlationId, accept: "application/json" },
        signal: abort.signal,
      });
    } catch {
      throw new RetryableConnectorError("nfcore.transport_unavailable");
    } finally { clearTimeout(t); }
    if (response.status === 429 || response.status >= 500) {
      throw new RetryableConnectorError("nfcore.provider_unavailable");
    }
    if (!response.ok) throw new NfcoreConnectorError("nfcore.remote_denied");
    const body = await response.text();
    if (body.length > 65536) throw new NfcoreConnectorError("nfcore.response_too_large");
    try { return JSON.parse(body) as unknown; }
    catch { throw new NfcoreConnectorError("nfcore.response_invalid"); }
  }
  async health(context: ConnectorContext, source: SourceDefinition): Promise<"healthy" | "degraded" | "unavailable"> {
    try {
      parseNfcoreMetricsEnvelope(await this.read(context, source), context.correlationId);
      return "healthy";
    } catch { return "unavailable"; }
  }
  async pull(context: ConnectorContext, source: SourceDefinition): Promise<ConnectorPullResult> {
    const result = parseNfcoreMetricsEnvelope(await this.read(context, source), context.correlationId);
    return { facts: result.facts, nextCursor: result.cursor };
  }
}
