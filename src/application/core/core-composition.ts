import { CoreGateway } from "@/application/core/core-gateway";
import { FinancialIntelligenceService } from "@/application/finance/financial-intelligence-service";
import { FmccVerticalCognitiveCore } from "@/application/core/fmcc-vertical-cognitive-core";
import { MetricService } from "@/application/metrics/metric-service";
import { cognitiveEnv } from "@/config/env";
import { CognitiveModelUnavailableError } from "@/domain/core/cognitive-model";
import { AuditCoreContextReader } from "@/infrastructure/core/audit-core-context-reader";
import { OpenAiCompatibleCognitiveModel } from "@/infrastructure/core/openai-compatible-cognitive-model";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";

export function buildCoreGateway(): CoreGateway {
  let config: ReturnType<typeof cognitiveEnv>;
  try { config = cognitiveEnv(); }
  catch { throw new CognitiveModelUnavailableError(); }

  const verticalCore = new FmccVerticalCognitiveCore(
    new OpenAiCompatibleCognitiveModel(config.baseUrl, config.apiKey, config.modelId),
  );

  const metrics = new MetricService(new PostgresMetricStore());
  const products = new PostgresProductRepository();

  return new CoreGateway(
    verticalCore,
    metrics,
    new AuditCoreContextReader(),
    products,
    new FinancialIntelligenceService(metrics, products),
  );
}
