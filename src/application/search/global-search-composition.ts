import { GlobalSearchService } from "@/application/search/global-search-service";
import { PostgresAlertRepository } from "@/infrastructure/alerts/postgres-alert-repository";
import { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";

export function buildGlobalSearchService(): GlobalSearchService {
  return new GlobalSearchService(
    new PostgresProductRepository(),
    new PostgresSourceRepository(),
    new PostgresAlertRepository(),
  );
}
