import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ProductRegistryService, ProductNotFoundError } from "@/application/products/product-registry-service";
import { SourceRegistryService } from "@/application/integration/source-registry-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { roleHasPermission } from "@/domain/security/permissions";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { FMCC_IRON_PRODUCT_SLUG } from "@/domain/billing/iron-product-identity";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";
import { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import {
  IRON_COMMERCIAL_SOURCE_TYPE, IRON_COMMERCIAL_SECRET_REF,
  IronCommercialConnector, environmentIronControlTenantId,
  type IronAiUsageReport,
} from "@/infrastructure/integration/iron-commercial-connector";

export default async function IronAiUsagePage({
  params,
}: { params: Promise<{ productId: string }> }) {
  let context;
  try {
    context = await resolveTenantContext(await headers());
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }
  if (!roleHasPermission(context.role, "billing:read") ||
      (context.role !== "owner" && context.role !== "admin")) redirect("/dashboard");

  const { productId } = await params;
  const products = new PostgresProductRepository();
  let product;
  try {
    product = await new ProductRegistryService(products).get(context, productId);
  } catch (error) {
    if (error instanceof ProductNotFoundError) notFound();
    throw error;
  }
  if (product.slug !== FMCC_IRON_PRODUCT_SLUG) notFound();

  let report: IronAiUsageReport | null = null;
  let unavailable = "A fonte operacional do IRON não está disponível ou não passou pela validação.";
  const sources = await new SourceRegistryService(new PostgresSourceRepository(), products).list(context);
  const matches = sources.filter(source =>
    source.productId === product.id &&
    source.name === "IRON FIT CORE Commercial" &&
    source.sourceType === IRON_COMMERCIAL_SOURCE_TYPE &&
    source.secretRef === IRON_COMMERCIAL_SECRET_REF &&
    source.authoritativeDomain === "commercial" &&
    context.tenantId === environmentIronControlTenantId(),
  );
  if (matches.length === 1) {
    try {
      report = await new IronCommercialConnector().aiUsage({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        timeoutMs: 8000,
      }, matches[0]);
    } catch {
      unavailable = "Não foi possível consultar os agregados canônicos de execução de IA no IRON.";
    }
  }

  return <main className="dashboard-shell">
    <header className="dashboard-header">
      <div><span className="eyebrow">FM Command · Inteligência operacional</span>
        <h1>Uso de IA do IRON FIT CORE</h1>
        <p>Execuções registradas por academia, capacidade, provedor e modelo. Não representa tokens nem custo financeiro.</p>
      </div>
      <Link className="button" href={`/dashboard/products/${product.id}`}>Voltar ao produto</Link>
    </header>
    {report === null ? <section className="panel" role="status">
      <h2>Consumo indisponível</h2><p>{unavailable}</p>
      <p>Valores desconhecidos não são apresentados como zero. Nenhum provedor externo é presumido como homologado.</p>
    </section> : <>
      <section className="foundation-grid" aria-label="Cobertura de métricas de IA">
        <article><strong>Fonte</strong><span>Execuções registradas no backend IRON</span></article>
        <article><strong>Janela</strong><span>Últimos {report.window_days} dias</span></article>
        <article><strong>Tokens</strong><span>Indisponível</span></article>
        <article><strong>Custos de IA</strong><span>Indisponível</span></article>
      </section>
      <section className="panel">
        <h2>Execuções por academia e modelo</h2>
        {report.usage.length === 0 ? <p>Não há registros na janela consultada. Isso não comprova consumo financeiro zero.</p> :
          <div className="foundation-grid">
            {report.usage.map((item, index) => <article key={index}>
              <strong>{item.capability}</strong>
              <span>Academia: {item.tenant_id}</span>
              <span>{item.provider_code} · {item.model_code}</span>
              <span>Estado: {item.status}</span>
              <span>Execuções registradas: {item.execution_count}</span>
            </article>)}
          </div>}
        <small>Dados agregados operacionais. Reservas de quota, tokens e preços permanecem em seus domínios canônicos.</small>
      </section>
    </>}
  </main>;
}
