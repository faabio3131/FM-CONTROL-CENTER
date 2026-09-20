import type { CognitiveModel } from "@/domain/core/cognitive-model";
import type { CoreAnswer, CoreEvidence, CoreOperationalContext } from "@/domain/core/contracts";
import { METRIC_REGISTRY } from "@/domain/metrics/registry";

export class FmccVerticalCognitiveCore {
  constructor(private readonly model: CognitiveModel) {}

  async plan(input: {
    question: string;
    operationalContext: readonly CoreOperationalContext[];
  }): Promise<readonly string[]> {
    const result = await this.model.plan({
      question: input.question,
      metricCatalog: METRIC_REGISTRY.map(({ metricId, displayName, description }) => ({ metricId, displayName, description })),
      operationalContext: input.operationalContext,
    });
    return result.metricIds;
  }

  async synthesize(input: {
    question: string;
    facts: readonly Record<string, unknown>[];
    evidence: readonly CoreEvidence[];
    operationalContext: readonly CoreOperationalContext[];
  }): Promise<CoreAnswer> {
    const answer = await this.model.synthesize({
      question: input.question,
      facts: input.facts,
      evidence: input.evidence,
      operationalContext: input.operationalContext,
    });
    return { answer, evidence: input.evidence, factualStatus: "grounded" };
  }
}
