import type { ConnectorPullResult } from "@/domain/integration/contracts";

/** Read-only cognitive coverage drawn only from the NFCore connector's sanitized fact. */
export interface NfcoreCognitiveCoverageReport {
  readonly source: "nfcore-cognitive-metrics-v1";
  readonly contract: "nfcore.cognitive.metrics/v1";
  readonly queriedAt: string;
  readonly since: string;
  readonly lastObservedAt: string | null;
  readonly aiEnabled: boolean;
  readonly freshnessScope: "process";
  readonly metrics: readonly {
    readonly code: string;
    readonly label: string;
    readonly value: number | null;
  }[];
  readonly completeIntegrationCertified: false;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("integration.nfcore_coverage_count_invalid");
  }
  return value;
}
function date(value: unknown): string {
  if (typeof value !== "string" || value.length > 64 || !Number.isFinite(Date.parse(value))) {
    throw new Error("integration.nfcore_coverage_date_invalid");
  }
  return new Date(value).toISOString();
}

export function projectNfcoreCognitiveCoverage(
  result: ConnectorPullResult,
): NfcoreCognitiveCoverageReport {
  if (result.facts.length !== 1 ||
      result.facts[0].factType !== "nfcore.cognitive.process_snapshot") {
    throw new Error("integration.nfcore_coverage_contract_invalid");
  }
  const raw = result.facts[0].payload;
  if (raw.authority !== "nfcore-cognitive-core" || raw.freshnessScope !== "process" ||
      typeof raw.aiEnabled !== "boolean") {
    throw new Error("integration.nfcore_coverage_authority_invalid");
  }
  const since = date(raw.since);
  const lastObservedAt = raw.lastObservedAt === null ? null : date(raw.lastObservedAt);
  if (lastObservedAt && new Date(lastObservedAt) < new Date(since)) {
    throw new Error("integration.nfcore_coverage_timeline_invalid");
  }
  const requests = count(raw.requests);
  const modelCalls = count(raw.modelCalls);
  const costReportedCalls = count(raw.costReportedCalls);
  const inputTokens = count(raw.inputTokens);
  const outputTokens = count(raw.outputTokens);
  const costMicroBrl = raw.costMicroBrl === null ? null : count(raw.costMicroBrl);
  if (modelCalls > requests || costReportedCalls > modelCalls ||
      (costReportedCalls === 0 && costMicroBrl !== null) ||
      (costReportedCalls > 0 && costMicroBrl === null)) {
    throw new Error("integration.nfcore_coverage_counters_inconsistent");
  }
  return {
    source: "nfcore-cognitive-metrics-v1",
    contract: "nfcore.cognitive.metrics/v1",
    queriedAt: new Date().toISOString(),
    since,
    lastObservedAt,
    aiEnabled: raw.aiEnabled,
    freshnessScope: "process",
    metrics: [
      { code: "requests", label: "Requisições cognitivas", value: requests },
      { code: "modelCalls", label: "Chamadas a modelos de IA", value: modelCalls },
      { code: "inputTokens", label: "Tokens de entrada reportados", value: inputTokens },
      { code: "outputTokens", label: "Tokens de saída reportados", value: outputTokens },
      { code: "costReportedCalls", label: "Chamadas com custo informado", value: costReportedCalls },
      { code: "costMicroBrl", label: "Custo reportado (micro-R$)", value: costMicroBrl },
    ],
    completeIntegrationCertified: false,
  };
}
