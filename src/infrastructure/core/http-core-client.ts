import type { CanonicalCoreClient, CoreAnswer, CoreEvidence, CoreOperationalContext, CorePlan, FmccCapability } from "@/domain/core/contracts";

export class CanonicalCoreUnavailableError extends Error {
  constructor() { super("core.canonical_service_unavailable"); }
}

export class HttpCanonicalCoreClient implements CanonicalCoreClient {
  constructor(private readonly baseUrl: string, private readonly serviceToken: string, private readonly timeoutMs = 8_000) {
    if (!/^https?:\/\//.test(baseUrl)) throw new CanonicalCoreUnavailableError();
    if (!serviceToken.trim()) throw new CanonicalCoreUnavailableError();
  }

  async plan(input: { question: string; tenantId: string; userId: string; correlationId: string; allowedCapabilities: readonly FmccCapability[]; operationalContext?: readonly CoreOperationalContext[] }): Promise<CorePlan> {
    return this.post<CorePlan>("/v1/fmcc/plan", input);
  }

  async synthesize(input: { question: string; tenantId: string; userId: string; correlationId: string; facts: readonly Record<string, unknown>[]; evidence: readonly CoreEvidence[]; operationalContext?: readonly CoreOperationalContext[] }): Promise<CoreAnswer> {
    return this.post<CoreAnswer>("/v1/fmcc/synthesize", input);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(new URL(path, this.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.serviceToken}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new CanonicalCoreUnavailableError();
      return await response.json() as T;
    } catch (error) {
      if (error instanceof CanonicalCoreUnavailableError) throw error;
      throw new CanonicalCoreUnavailableError();
    } finally {
      clearTimeout(timer);
    }
  }
}
