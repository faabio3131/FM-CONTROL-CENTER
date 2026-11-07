import {
  RetryableConnectorError,
  type Connector,
  type ConnectorContext,
  type ConnectorFact,
  type ConnectorPullResult,
  type SourceDefinition,
} from "@/domain/integration/contracts";

/**
 * NFCore-owned commercial read model (GET /v1/command/commercial/snapshot).
 *
 * Independent of the cognitive connector: separate source type, separate
 * secret reference, separate authoritativeDomain ("commercial" vs
 * "cognitive"). Per FM-CONTROL-CENTER AGENTS.md's explicit domain
 * separation, this connector never touches billing/MRR/ARR authority --
 * the snapshot's own `coverage.billing_transactions` always declares
 * FM_COMMAND_AUTHORITY, and no amount/price field is ever present.
 */
export const NFCORE_COMMERCIAL_SOURCE_TYPE = "nfcore-commercial-v1";
export const NFCORE_COMMERCIAL_SECRET_REF =
  "env:FMCC_NFCORE_COMMERCIAL_CONTROL_PLANE_TOKEN";
export type NfcoreCommercialSecretResolver = (reference: string) => string | undefined;

export interface NfcoreCommercialSnapshot {
  readonly schema_version: "nfcore.fmcc.commercial.v1";
  readonly product_code: "NFCORE";
  readonly as_of: string;
  readonly customers: readonly Record<string, unknown>[];
  readonly product_accounts: readonly Record<string, unknown>[];
  readonly trials: readonly Record<string, unknown>[];
  readonly subscriptions: readonly Record<string, unknown>[];
  readonly billing_transactions: readonly Record<string, unknown>[];
  readonly entitlements: readonly Record<string, unknown>[];
  readonly catalog: readonly Record<string, unknown>[];
  readonly summary: Readonly<Record<string, number>>;
  readonly coverage: Readonly<Record<string, string>>;
  readonly facts: readonly {
    external_id: string;
    fact_type: string;
    payload: Record<string, unknown>;
    source_timestamp: string;
  }[];
}

export class NfcoreCommercialConnectorError extends Error {
  constructor(code: string) { super(code); this.name = "NfcoreCommercialConnectorError"; }
}
export function defaultNfcoreCommercialSecretResolver(reference: string): string | undefined {
  if (reference !== NFCORE_COMMERCIAL_SECRET_REF) {
    throw new NfcoreCommercialConnectorError("nfcore_commercial.secret_reference_denied");
  }
  return process.env.FMCC_NFCORE_COMMERCIAL_CONTROL_PLANE_TOKEN?.trim() || undefined;
}
// Same product, same Command installation and tenant as the cognitive
// connector: reuse its existing allowlist/tenant env vars rather than
// inventing a second set for the identical origin.
function allowlist(): readonly string[] {
  return (process.env.FMCC_NFCORE_ALLOWED_ORIGINS ?? "").split(",").map(x => x.trim()).filter(Boolean);
}
function controlTenant(): string | undefined {
  return process.env.FMCC_NFCORE_CONTROL_TENANT_ID?.trim() || undefined;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NfcoreCommercialConnectorError("nfcore_commercial.contract_invalid");
  }
  return value as Record<string, unknown>;
}
function nonNegativeNumberMap(value: unknown): Record<string, number> {
  const record = object(value);
  for (const entry of Object.values(record)) {
    if (!Number.isSafeInteger(entry) || (entry as number) < 0) {
      throw new NfcoreCommercialConnectorError("nfcore_commercial.summary_invalid");
    }
  }
  return record as Record<string, number>;
}
function stringMap(value: unknown): Record<string, string> {
  const record = object(value);
  for (const entry of Object.values(record)) {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new NfcoreCommercialConnectorError("nfcore_commercial.coverage_invalid");
    }
  }
  return record as Record<string, string>;
}
function fact(value: unknown): ConnectorFact {
  const item = object(value);
  if (typeof item.external_id !== "string" || typeof item.fact_type !== "string" ||
      !item.payload || typeof item.payload !== "object" || Array.isArray(item.payload) ||
      typeof item.source_timestamp !== "string") {
    throw new NfcoreCommercialConnectorError("nfcore_commercial.fact_invalid");
  }
  const timestamp = new Date(item.source_timestamp);
  if (Number.isNaN(timestamp.getTime())) {
    throw new NfcoreCommercialConnectorError("nfcore_commercial.fact_timestamp_invalid");
  }
  return {
    externalId: item.external_id,
    factType: item.fact_type,
    payload: item.payload as Record<string, unknown>,
    sourceTimestamp: timestamp,
  };
}
function sourceUrl(source: SourceDefinition, allowed: readonly string[]): string {
  const raw = source.config.baseUrl;
  if (typeof raw !== "string" || raw.length > 512) throw new NfcoreCommercialConnectorError("nfcore_commercial.url_invalid");
  let url: URL;
  try { url = new URL(raw); } catch { throw new NfcoreCommercialConnectorError("nfcore_commercial.url_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new NfcoreCommercialConnectorError("nfcore_commercial.url_insecure");
  }
  if (!allowed.length || !allowed.every(x => {
    try { const v = new URL(x); return v.protocol === "https:" && v.origin === x; } catch { return false; }
  }) || !allowed.includes(url.origin)) {
    throw new NfcoreCommercialConnectorError("nfcore_commercial.origin_not_allowed");
  }
  return url.origin + "/v1/command/commercial/snapshot";
}
export function parseNfcoreCommercialEnvelope(
  unknownBody: unknown, expectedCorrelation: string,
): { snapshot: NfcoreCommercialSnapshot; facts: readonly ConnectorFact[]; cursor: string } {
  const b = object(unknownBody);
  if (b.schemaVersion !== undefined) {
    // defensive: the Command side never sends camelCase for this contract
    throw new NfcoreCommercialConnectorError("nfcore_commercial.schema_mismatch");
  }
  if (b.schema_version !== "nfcore.fmcc.commercial.v1" || b.product_code !== "NFCORE" ||
      b.correlationId !== expectedCorrelation) {
    throw new NfcoreCommercialConnectorError("nfcore_commercial.schema_mismatch");
  }
  const provenance = object(b.provenance);
  if (provenance.authority !== "nfcore-commercial-core" || provenance.readOnly !== true) {
    throw new NfcoreCommercialConnectorError("nfcore_commercial.provenance_invalid");
  }
  if (typeof b.as_of !== "string" || Number.isNaN(new Date(b.as_of).getTime())) {
    throw new NfcoreCommercialConnectorError("nfcore_commercial.as_of_invalid");
  }
  const collections = [
    b.customers, b.product_accounts, b.trials, b.subscriptions,
    b.billing_transactions, b.entitlements, b.catalog, b.facts,
  ];
  if (collections.some(collection => !Array.isArray(collection))) {
    throw new NfcoreCommercialConnectorError("nfcore_commercial.collection_invalid");
  }
  const summary = nonNegativeNumberMap(b.summary);
  const coverage = stringMap(b.coverage);
  // NFCore must never claim authority over money: a positive assertion here
  // is a contract bug on the remote side, not something this connector may
  // silently accept.
  if (coverage.billing_transactions !== "FM_COMMAND_AUTHORITY") {
    throw new NfcoreCommercialConnectorError("nfcore_commercial.billing_authority_claim_rejected");
  }
  const rawFacts = b.facts as unknown[];
  const facts = rawFacts.map(fact);
  const snapshot: NfcoreCommercialSnapshot = {
    schema_version: "nfcore.fmcc.commercial.v1",
    product_code: "NFCORE",
    as_of: b.as_of,
    customers: b.customers as readonly Record<string, unknown>[],
    product_accounts: b.product_accounts as readonly Record<string, unknown>[],
    trials: b.trials as readonly Record<string, unknown>[],
    subscriptions: b.subscriptions as readonly Record<string, unknown>[],
    billing_transactions: b.billing_transactions as readonly Record<string, unknown>[],
    entitlements: b.entitlements as readonly Record<string, unknown>[],
    catalog: b.catalog as readonly Record<string, unknown>[],
    summary,
    coverage,
    facts: b.facts as NfcoreCommercialSnapshot["facts"],
  };
  return { snapshot, facts, cursor: b.as_of };
}

export class NfcoreCommercialConnector implements Connector {
  readonly sourceType = NFCORE_COMMERCIAL_SOURCE_TYPE;
  readonly capabilities = ["commercial.snapshot", "commercial.facts"] as const;
  constructor(
    private readonly resolveSecret: NfcoreCommercialSecretResolver = defaultNfcoreCommercialSecretResolver,
    private readonly fetcher: typeof fetch = fetch,
    private readonly allowedOrigins: () => readonly string[] = allowlist,
    private readonly authorizedTenant: () => string | undefined = controlTenant,
  ) {}
  private async read(context: ConnectorContext, source: SourceDefinition): Promise<unknown> {
    const approvedTenant = this.authorizedTenant();
    if (!approvedTenant || approvedTenant !== context.tenantId ||
        source.tenantId !== context.tenantId || !source.productId ||
        source.sourceType !== this.sourceType || source.secretRef !== NFCORE_COMMERCIAL_SECRET_REF ||
        source.authoritativeDomain !== "commercial" || source.syncMode !== "pull" ||
        source.mappingVersion !== this.sourceType) {
      throw new NfcoreCommercialConnectorError("nfcore_commercial.scope_denied");
    }
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(context.correlationId) ||
        !Number.isSafeInteger(context.timeoutMs) || context.timeoutMs < 100 || context.timeoutMs > 120000) {
      throw new NfcoreCommercialConnectorError("nfcore_commercial.context_invalid");
    }
    const secret = this.resolveSecret(NFCORE_COMMERCIAL_SECRET_REF)?.trim();
    if (!secret || secret.length < 32) throw new NfcoreCommercialConnectorError("nfcore_commercial.secret_unavailable");
    const url = sourceUrl(source, this.allowedOrigins());
    const abort = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        abort.abort();
        reject(new RetryableConnectorError("nfcore_commercial.transport_timeout"));
      }, context.timeoutMs);
    });
    try {
      let response: Response;
      try {
        response = await Promise.race([
          this.fetcher(url, {
            method: "GET", redirect: "error", cache: "no-store",
            headers: { authorization: "Bearer " + secret, "x-correlation-id": context.correlationId, accept: "application/json" },
            signal: abort.signal,
          }),
          deadline,
        ]);
      } catch (error) {
        if (error instanceof RetryableConnectorError) throw error;
        throw new RetryableConnectorError("nfcore_commercial.transport_unavailable");
      }
      if (response.status === 429 || response.status >= 500) {
        throw new RetryableConnectorError("nfcore_commercial.provider_unavailable");
      }
      if (!response.ok) throw new NfcoreCommercialConnectorError("nfcore_commercial.remote_denied");
      const declaredLength = response.headers.get("content-length");
      if (declaredLength && (
        !/^(0|[1-9]\d*)$/.test(declaredLength) || Number(declaredLength) > 262144
      )) throw new NfcoreCommercialConnectorError("nfcore_commercial.response_too_large");
      if (!response.body) throw new NfcoreCommercialConnectorError("nfcore_commercial.response_invalid");
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let size = 0;
      let body = "";
      try {
        while (true) {
          const { done, value } = await Promise.race([reader.read(), deadline]);
          if (done) break;
          size += value.byteLength;
          if (size > 262144) throw new NfcoreCommercialConnectorError("nfcore_commercial.response_too_large");
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      } catch (error) {
        void reader.cancel().catch(() => {});
        if (error instanceof NfcoreCommercialConnectorError || error instanceof RetryableConnectorError) {
          throw error;
        }
        throw new NfcoreCommercialConnectorError("nfcore_commercial.response_invalid");
      } finally {
        reader.releaseLock();
      }
      try { return JSON.parse(body) as unknown; }
      catch { throw new NfcoreCommercialConnectorError("nfcore_commercial.response_invalid"); }
    } finally {
      clearTimeout(timeout);
    }
  }
  async health(context: ConnectorContext, source: SourceDefinition): Promise<"healthy" | "degraded" | "unavailable"> {
    try {
      parseNfcoreCommercialEnvelope(await this.read(context, source), context.correlationId);
      return "healthy";
    } catch { return "unavailable"; }
  }
  async pull(context: ConnectorContext, source: SourceDefinition): Promise<ConnectorPullResult> {
    const result = parseNfcoreCommercialEnvelope(await this.read(context, source), context.correlationId);
    return { facts: result.facts, nextCursor: result.cursor };
  }
  async snapshot(context: ConnectorContext, source: SourceDefinition): Promise<NfcoreCommercialSnapshot> {
    const result = parseNfcoreCommercialEnvelope(await this.read(context, source), context.correlationId);
    return result.snapshot;
  }
}
