export type FmccCapability = "metric.query" | "metrics.query_many";

export interface CorePlan {
  readonly capability: FmccCapability;
  readonly arguments: Readonly<Record<string, unknown>>;
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

export interface CoreOperationalContext {
  readonly question: string;
  readonly answer: string;
  readonly factualStatus: "grounded" | "unavailable";
  readonly evidenceRefs: readonly string[];
  readonly occurredAt?: string;
}

export interface CoreAnswer {
  readonly answer: string;
  readonly evidence: readonly CoreEvidence[];
  readonly factualStatus: "grounded" | "unavailable";
}

export interface CanonicalCoreClient {
  plan(input: {
    question: string;
    tenantId: string;
    userId: string;
    correlationId: string;
    allowedCapabilities: readonly FmccCapability[];
    operationalContext?: readonly CoreOperationalContext[];
  }): Promise<CorePlan>;
  synthesize(input: {
    question: string;
    tenantId: string;
    userId: string;
    correlationId: string;
    facts: readonly Record<string, unknown>[];
    evidence: readonly CoreEvidence[];
    operationalContext?: readonly CoreOperationalContext[];
  }): Promise<CoreAnswer>;
}
