import { CoreGateway } from "@/application/core/core-gateway";
import { FmccVerticalCognitiveCore } from "@/application/core/fmcc-vertical-cognitive-core";
import { MetricService } from "@/application/metrics/metric-service";
import { cognitiveEnv } from "@/config/env";
import { AuditCoreContextReader } from "@/infrastructure/core/audit-core-context-reader";
import { OpenAiCompatibleCognitiveModel } from "@/infrastructure/core/openai-compatible-cognitive-model";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";

export function buildCoreGateway(): CoreGateway {
  const config = cognitiveEnv();

  const verticalCore = new FmccVerticalCognitiveCore(
    new OpenAiCompatibleCognitiveModel(config.baseUrl, config.apiKey, config.modelId),
  );

  return new CoreGateway(
    verticalCore,
    new MetricService(new PostgresMetricStore()),
    new AuditCoreContextReader(),
  );
}
