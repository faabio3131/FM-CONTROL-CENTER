import { CoreGateway } from "@/application/core/core-gateway";
import { MetricService } from "@/application/metrics/metric-service";
import { HttpCanonicalCoreClient, CanonicalCoreUnavailableError } from "@/infrastructure/core/http-core-client";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";

export function buildCoreGateway(): CoreGateway {
  const baseUrl = process.env.FM_CORE_BASE_URL?.trim();
  const token = process.env.FM_CORE_SERVICE_TOKEN?.trim();
  if (!baseUrl || !token) throw new CanonicalCoreUnavailableError();
  return new CoreGateway(new HttpCanonicalCoreClient(baseUrl, token), new MetricService(new PostgresMetricStore()));
}
