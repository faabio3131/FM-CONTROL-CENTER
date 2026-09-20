export type FmccCapability = "metric.query";

export interface CorePlan {
  readonly capability: FmccCapability;
  readonly arguments: Readonly<Record<string, string>>;
}

export interface CoreEvidence {
  readonly kind: "metric" | "source";
  readonly ref: string;
  readonly sourceAuthority?: string;
  readonly freshnessStatus?: string;
  readonly qualityStatus?: string;
  readonly provenanceRefs?: readonly string[];
  readonly periodStart?: string;
  readonly periodEnd?: string;
  readonly asOf?: string;
}

export interface CoreAnswer {
  readonly answer: string;
  readonly evidence: readonly CoreEvidence[];
  readonly factualStatus: "grounded" | "unavailable";
}

export interface CanonicalCoreClient {
  plan(input: { question: string; tenantId: string; userId: string; correlationId: string; allowedCapabilities: readonly FmccCapability[] }): Promise<CorePlan>;
  synthesize(input: { question: string; tenantId: string; userId: string; correlationId: string; facts: readonly Record<string, unknown>[]; evidence: readonly CoreEvidence[] }): Promise<CoreAnswer>;
}
