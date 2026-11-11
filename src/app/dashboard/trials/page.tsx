import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CoreQueryForm } from "@/app/dashboard/core-query-form";
import { MetricService, type MetricView } from "@/application/metrics/metric-service";
import { IronTrialPortfolioService } from "@/application/customer/iron-trial-portfolio-service";
import { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import { ProductRegistryService } from "@/application/products/product-registry-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";
import { rotuloAtualidade, rotuloAutoridadeFonte, rotuloQualidade } from "@/presentation/pt-br";

const TRIAL_METRICS = new Set([
  "trial.starts.count",
  "trial.active.count",
  "trial.conversion.rate",
]);

function temporalLabel(value?: MetricView | null): string {
  if (!value) return "Período indisponível";
  if (value.asOf) return `As of: ${value.asOf.toISOString()}`;
  if (value.periodStart || value.periodEnd) {
    return `Período: ${value.periodStart?.toISOString() ?? "?"} → ${value.periodEnd?.toISOString() ?? "?"}`;
  }
  return "Período não informado pela fonte";
}

export default async function TrialsPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; page?: string }>;
}) {
  let context;
  try {
    context = await resolveTenantContext(await headers());
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }

  const productsRepository = new PostgresProductRepository();
  const productService = new ProductRegistryService(productsRepository);
  const products = await productService.list(context);
  const params = await searchParams;
  const requestedProductId = params.productId?.trim();
  const requestedPage = params.page && /^\d+$/.test(params.page) ? Number(params.page) : 1;
  let selectedProduct = undefined;

  if (requestedProductId) {
    try {
      selectedProduct = await productService.get(context, requestedProductId);
    } catch {
      redirect("/dashboard/trials");
    }
  }

  const overview = await new MetricService(new PostgresMetricStore()).overview(
    context,
    selectedProduct?.id,
  );
  const metrics = overview.filter(({ target }) =>
    TRIAL_METRICS.has(target.metricId),
  );
  const started = metrics.find(
    ({ target }) => target.metricId === "trial.starts.count",
  )?.value;
  const authority = metrics.find(({ value }) => value?.sourceAuthority)?.value
    ?.sourceAuthority;
  const ironTrials = await new IronTrialPortfolioService(
    productsRepository, new PostgresSourceRepository(),
  ).read(context, selectedProduct?.id, requestedPage);
  const dateLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
  const pageUrl = (page: number) => {
    const query = new URLSearchParams();
    if (selectedProduct) query.set("productId", selectedProduct.id);
    query.set("page", String(page));
    return "/dashboard/trials?" + query.toString();
  };

  return (
    <main className="dashboard-shell dashboard-shell-compact">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">Trials</span>
          <h1>Testes gratuitos</h1>
          <p>
            Início, estoque ativo e conversão são exibidos somente com semântica,
            fonte e escopo governados.
          </p>
        </div>
        <Link href="/dashboard/growth">Abrir Comercial</Link>
      </header>

      <section className="panel" aria-labelledby="trials-scope-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Escopo governado</span>
            <h2 id="trials-scope-title">Produto e período</h2>
          </div>
          <p>
            Produto é validado no servidor. Ausência de fonte, coorte ou origem
            permanece indisponível.
          </p>
        </div>
        <form action="/dashboard/trials" method="get" className="command-quick-actions">
          <label htmlFor="trials-product">Produto</label>
          <select id="trials-product" name="productId" defaultValue={selectedProduct?.id ?? ""}>
            <option value="">Todos os produtos autorizados</option>
            {products.map((product) => (
              <option value={product.id} key={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <button className="button" type="submit">Aplicar escopo</button>
        </form>
        <div className="foundation-grid">
          <article>
            <strong>Produto</strong>
            <span>{selectedProduct?.name ?? "Consolidado autorizado"}</span>
          </article>
          <article>
            <strong>Período</strong>
            <span>{temporalLabel(started)}</span>
          </article>
          <article>
            <strong>Origem</strong>
            <span>
              {authority
                ? rotuloAutoridadeFonte(authority)
                : "Indisponível — fonte ainda não conectada"}
            </span>
          </article>
          <article>
            <strong>Coorte</strong>
            <span>
              Indisponível até aprovação da coorte de conversão canônica
            </span>
          </article>
        </div>
      </section>

      <section className="metric-grid" aria-label="Métricas de Trials">
        {metrics.map(({ target, definition, value }) => (
          <article className="metric-card" key={target.metricId}>
            <span className="metric-label">{target.displayName}</span>
            <strong>
              {target.definitionStatus === "pending_semantics"
                ? "Semântica pendente"
                : value?.value ?? "Indisponível"}
            </strong>
            <div className="metric-meta">
              <span>
                {value
                  ? `Qualidade: ${rotuloQualidade(value.qualityStatus)}`
                  : definition
                    ? "Qualidade: indisponível"
                    : "Regra de negócio ainda não aprovada"}
              </span>
              <span>
                {value
                  ? `Atualidade: ${rotuloAtualidade(value.freshnessStatus)}`
                  : "Atualidade: indisponível"}
              </span>
              <span>{temporalLabel(value)}</span>
            </div>
            <small className="metric-provenance">
              {value
                ? `Fonte: ${rotuloAutoridadeFonte(value.sourceAuthority)} · Proveniência: ${value.provenanceRefs.join(" · ") || "não informada"}`
                : "Sem valor governado; nenhuma evidência é presumida."}
            </small>
          </article>
        ))}
        <article className="metric-card">
          <span className="metric-label">Trials encerrados</span>
          <strong>Indisponível</strong>
          <small>
            O FM Command ainda não possui métrica canônica de encerramento de trial.
            Este estado não é convertido em zero.
          </small>
        </article>
      </section>

      {ironTrials.state !== "not_applicable" && (
        <section className="panel" aria-labelledby="iron-trials-register-title">
          <header className="section-heading">
            <div>
              <span className="eyebrow">IRON FIT CORE</span>
              <h2 id="iron-trials-register-title">Academias em teste grátis</h2>
            </div>
            <Link href={pageUrl(ironTrials.state === "ready" ? ironTrials.page : 1)}>Atualizar leitura</Link>
          </header>
          <p>Cadastros reais do IRON consultados na fonte canônica. Cobranças e conversão financeira não são inferidas destes registros.</p>
          {ironTrials.state === "unavailable" ? (
            <p role="status">Leitura das academias indisponível. Verifique a fonte comercial IRON cadastrada no Command; dado ausente não significa zero.</p>
          ) : (
            <>
              <p>Academias com trial registrado: {ironTrials.total}. Fonte atualizada em {dateLabel(ironTrials.asOf)}.</p>
              <p className="metric-provenance">Autoridade: IRON FIT CORE · control-plane autenticado · sem replicação de CNPJ ou e-mail.</p>
              {ironTrials.academies.length === 0 ? (
                <p role="status">Nenhuma academia em trial registrada na fonte IRON.</p>
              ) : (
                <div className="foundation-grid" aria-label="Academias IRON em trial">
                  {ironTrials.academies.map(academy => (
                    <article key={academy.gymId}>
                      <strong>{academy.academyName}</strong>
                      <span>Cadastro: {dateLabel(academy.registeredAt)}</span>
                      <span>Início do trial: {dateLabel(academy.startedAt)}</span>
                      <span>Vencimento: {dateLabel(academy.endsAt)}</span>
                      <span>{academy.trialStatus === "active" ? "Dentro do período gratuito" : "Período gratuito encerrado"}</span>
                      <span>Assinatura: {academy.subscriptionStatus === "ACTIVE" ? "Ativa" :
                        academy.subscriptionStatus === "SUSPENDED" ? "Suspensa" : "Cancelada"}</span>
                      <span>{academy.planCode === "IRON_V1_TRIAL" ? "Plano de teste" : "Plano comercial diferente do trial original"}</span>
                    </article>
                  ))}
                </div>
              )}
              {ironTrials.pages > 1 && (
                <nav className="command-quick-actions" aria-label="Páginas de academias em teste">
                  <span>Página {ironTrials.page} de {ironTrials.pages}</span>
                  {ironTrials.page > 1 && <Link href={pageUrl(ironTrials.page - 1)}>Anterior</Link>}
                  {ironTrials.page < ironTrials.pages && <Link href={pageUrl(ironTrials.page + 1)}>Próxima</Link>}
                </nav>
              )}
            </>
          )}
        </section>
      )}

      <section className="panel">
        <h2>Governança de conversão</h2>
        <p>
          A taxa trial → assinatura permanece indisponível até existir coorte,
          janela e denominador canônicos aprovados.
        </p>
      </section>

      <CoreQueryForm
        productContext={
          selectedProduct
            ? { slug: selectedProduct.slug, name: selectedProduct.name }
            : undefined
        }
        domainContext={{
          label: selectedProduct ? `Trials · ${selectedProduct.name}` : "Trials",
          promptPrefix:
            "Responda no contexto governado do módulo Trials do FM Command. Preserve as autoridades do Metric Registry e trate dados ausentes como indisponíveis.",
        }}
      />
    </main>
  );
}
