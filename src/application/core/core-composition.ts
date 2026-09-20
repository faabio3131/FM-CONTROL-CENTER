import { CoreGateway } from "@/application/core/core-gateway";
import { FmccVerticalCognitiveCore } from "@/application/core/fmcc-vertical-cognitive-core";
import { MetricService } from "@/application/metrics/metric-service";
import { CognitiveModelUnavailableError } from "@/domain/core/cognitive-model";
import { AuditCoreContextReader } from "@/infrastructure/core/audit-core-context-reader";
import { OpenAiCompatibleCognitiveModel } from "@/infrastructure/core/openai-compatible-cognitive-model";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";

export function buildCoreGateway(): CoreGateway {
  const baseUrl = process.env.FMCC_COGNITIVE_MODEL_BASE_URL?.trim();
  const apiKey = process.env.FMCC_COGNITIVE_MODEL_API_KEY?.trim();
  const model = process.env.FMCC_COGNITIVE_MODEL_ID?.trim();
  if (!baseUrl || !apiKey || !model) throw new CognitiveModelUnavailableError();

  const verticalCore = new FmccVerticalCognitiveCore(
    new OpenAiCompatibleCognitiveModel(baseUrl, apiKey, model),
  );

  return new CoreGateway(
    verticalCore,
    new MetricService(new PostgresMetricStore()),
    new AuditCoreContextReader(),
  );
}
