import { RetryableConnectorError, type ConnectorContext, type SourceDefinition } from "@/domain/integration/contracts";

export class OperationalUsageConnectorError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "OperationalUsageConnectorError";
  }
}
export interface OperationalUsageConfig {
  readonly sourceType: string;
  readonly secretRef: string;
  readonly tokenName: string;
  readonly tenantName: string;
  readonly originsName: string;
  readonly path: string;
}
export type UsageSecretResolver = (reference: string) => string | undefined;
export type UsageSettings = (name: string) => string | undefined;

const maximumResponseBytes = 1024 * 1024;
function approvedOrigin(raw: unknown, allowedOrigins: string | undefined): string {
  if (typeof raw !== "string" || raw.length > 512) {
    throw new OperationalUsageConnectorError("operational_usage.url_invalid");
  }
  let url: URL;
  try { url = new URL(raw); } catch {
    throw new OperationalUsageConnectorError("operational_usage.url_invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new OperationalUsageConnectorError("operational_usage.url_insecure");
  }
  const origins = (allowedOrigins ?? "").split(",").map(item => item.trim()).filter(Boolean);
  if (!origins.length || !origins.every(origin => {
    try { const parsed = new URL(origin); return parsed.protocol === "https:" && parsed.origin === origin; }
    catch { return false; }
  }) || !origins.includes(url.origin)) {
    throw new OperationalUsageConnectorError("operational_usage.origin_denied");
  }
  return url.origin;
}

/** Strict read-only S2S transport. No redirect, cross-tenant access or unbounded response body. */
export async function readOperationalUsageEnvelope(
  context: ConnectorContext,
  source: SourceDefinition,
  config: OperationalUsageConfig,
  input: {
    readonly fetcher?: typeof fetch;
    readonly resolveSecret?: UsageSecretResolver;
    readonly settings?: UsageSettings;
  } = {},
): Promise<unknown> {
  const settings = input.settings ?? ((name: string) => process.env[name]);
  if (!context.tenantId || !settings(config.tenantName)?.trim() ||
      context.tenantId !== settings(config.tenantName)?.trim() ||
      source.tenantId !== context.tenantId || !source.productId ||
      source.sourceType !== config.sourceType ||
      source.authoritativeDomain !== "operational-usage" ||
      source.secretRef !== config.secretRef || source.mappingVersion !== config.sourceType ||
      source.syncMode !== "pull") {
    throw new OperationalUsageConnectorError("operational_usage.scope_denied");
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(context.correlationId) ||
      !Number.isSafeInteger(context.timeoutMs) ||
      context.timeoutMs < 100 || context.timeoutMs > 120000) {
    throw new OperationalUsageConnectorError("operational_usage.context_invalid");
  }
  const resolveSecret = input.resolveSecret ??
    ((reference: string) => reference === config.secretRef ? settings(config.tokenName) : undefined);
  const secret = resolveSecret(config.secretRef)?.trim();
  if (!secret || secret.length < 32) {
    throw new OperationalUsageConnectorError("operational_usage.secret_unavailable");
  }
  const origin = approvedOrigin(source.config.baseUrl, settings(config.originsName));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new RetryableConnectorError("operational_usage.timeout"));
    }, context.timeoutMs);
  });
  try {
    let response: Response;
    try {
      response = await Promise.race([
        (input.fetcher ?? fetch)(origin + config.path, {
          method: "GET",
          redirect: "error",
          cache: "no-store",
          headers: {
            authorization: "Bearer " + secret,
            "x-correlation-id": context.correlationId,
            accept: "application/json",
          },
          signal: controller.signal,
        }),
        deadline,
      ]);
    } catch (error) {
      if (error instanceof RetryableConnectorError) throw error;
      throw new RetryableConnectorError("operational_usage.transport_unavailable");
    }
    if (response.status === 429 || response.status >= 500) {
      throw new RetryableConnectorError("operational_usage.upstream_unavailable");
    }
    if (!response.ok) {
      throw new OperationalUsageConnectorError("operational_usage.upstream_denied");
    }
    const declared = response.headers.get("content-length");
    if (declared && (!/^(0|[1-9]\d*)$/.test(declared) || Number(declared) > maximumResponseBytes)) {
      throw new OperationalUsageConnectorError("operational_usage.response_too_large");
    }
    if (!response.body) {
      throw new OperationalUsageConnectorError("operational_usage.response_invalid");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let body = "";
    let bytes = 0;
    try {
      while (true) {
        const next = await Promise.race([reader.read(), deadline]);
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > maximumResponseBytes) {
          throw new OperationalUsageConnectorError("operational_usage.response_too_large");
        }
        body += decoder.decode(next.value, { stream: true });
      }
      body += decoder.decode();
    } catch (error) {
      void reader.cancel().catch(() => undefined);
      if (error instanceof OperationalUsageConnectorError || error instanceof RetryableConnectorError) throw error;
      throw new OperationalUsageConnectorError("operational_usage.response_invalid");
    } finally {
      reader.releaseLock();
    }
    try { return JSON.parse(body) as unknown; }
    catch { throw new OperationalUsageConnectorError("operational_usage.response_invalid"); }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
