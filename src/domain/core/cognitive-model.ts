export interface CognitiveModel {
  plan(input: {
    question: string;
    metricCatalog: readonly { metricId: string; displayName: string; description: string }[];
    operationalContext: readonly Record<string, unknown>[];
  }): Promise<{ metricIds: readonly string[] }>;

  synthesize(input: {
    question: string;
    facts: readonly Record<string, unknown>[];
    evidence: readonly Record<string, unknown>[];
    operationalContext: readonly Record<string, unknown>[];
  }): Promise<string>;
}

export class CognitiveModelUnavailableError extends Error {
  constructor() { super("core.cognitive_model_unavailable"); }
}

export class CognitiveModelContractError extends Error {
  constructor() { super("core.cognitive_model_contract_invalid"); }
}
