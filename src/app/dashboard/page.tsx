import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MetricService } from "@/application/metrics/metric-service";
import { ProductRegistryService } from "@/application/products/product-registry-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";
import { rotuloAtualidade, rotuloAutoridadeFonte, rotuloQualidade, rotuloStatusDefinicao, rotuloStatusProduto } from "@/presentation/pt-br";
import { CoreQueryForm } from "./core-query-form";
import { ProductComparisonForm } from "./product-comparison-form";
import { ProductCreateForm } from "./product-create-form";
import { SignOutButton } from "./sign-out-button";

function formatTemporalContext(value: { periodStart?: Date; periodEnd?: Date; asOf?: Date }) {
  if (value.asOf) return `Referência temporal: ${value.asOf.toISOString()}`;
  if (value.periodStart || value.periodEnd) return `Período: ${value.periodStart?.toISOString() ?? "?"} → ${value.periodEnd?.toISOString() ?? "?"}`;
  return "Período: não informado pela fonte";
}
function formatMetric(value: string | null, unit: string, currency?: string) {
  if (value === null) return "Indisponível";
  if (unit === "currency" && currency) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(numeric); }
      catch { return `${value} ${currency}`; }
    }
  }
  return value;
}

export default async function DashboardPage() {
  let context;
  try { context = await resolveTenantContext(await headers()); }
  catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }

  const metricService = new MetricService(new PostgresMetricStore());
  const metrics = await metricService.overview(context);
  const products = await new ProductRegistryService(new PostgresProductRepository()).list(context);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">Central Executiva de Comando · Prévia</span>
          <h1>FM Control Center</h1>
          <p>Organização autenticada: <code>{context.tenantId}</code></p>
        </div>
        <SignOutButton />
      </header>

      <section className="foundation-grid" aria-label="Inteligência empresarial">
        <Link href="/dashboard/finance"><strong>Financeiro</strong><span>F12 · dados governados</span></Link>
        <Link href="/dashboard/growth"><strong>Growth / Comercial</strong><span>F13 · funil governado</span></Link>
        <Link href="/dashboard/operations"><strong>Operações / SRE</strong><span>F14 · sinais operacionais</span></Link>
        <Link href="/dashboard/customers"><strong>Clientes / Uso / Suporte</strong><span>F15 · agregados governados</span></Link>
        <Link href="/dashboard/commercial/kordena"><strong>Kordena Comercial</strong><span>KCA-12 · control plane</span></Link>
      </section>

      <section className="executive-section" aria-labelledby="executive-overview-title">
        <div className="section-heading">
          <div><span className="eyebrow">Métricas governadas</span><h2 id="executive-overview-title">Visão executiva</h2></div>
          <p>Ausência de fonte é exibida como indisponível — nunca como zero.</p>
        </div>
        <div className="metric-grid">
          {metrics.map(({ target, definition, value }) => (
            <article className="metric-card" key={target.metricId}>
              <span className="metric-label">{target.displayName}</span>
              <strong className={value?.value === null || !value ? "metric-value unavailable" : "metric-value"}>
                {value ? formatMetric(value.value, value.unit, value.currency) : "Indisponível"}
              </strong>
              <div className="metric-meta">
                <span>{value ? `Qualidade: ${rotuloQualidade(value.qualityStatus)}` : definition ? "Sem valor governado" : "Definição semântica pendente"}</span>
                <span>{value ? `Atualidade: ${rotuloAtualidade(value.freshnessStatus)}` : definition ? "Fonte ainda não conectada" : "Métrica ainda não implementada"}</span>
                <span>{value ? formatTemporalContext(value) : "Período indisponível"}</span>
              </div>
              <small className="metric-provenance">{value ? `Fonte: ${rotuloAutoridadeFonte(value.sourceAuthority)} · versão ${value.metricVersion}` : `Identificador técnico: ${target.metricId} · ${rotuloStatusDefinicao(target.definitionStatus)}`}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="executive-section" aria-labelledby="product-intelligence-title">
        <div className="section-heading">
          <div><span className="eyebrow">F11 · Inteligência por Produto</span><h2 id="product-intelligence-title">Inteligência por produto</h2></div>
          <p>Produto é escopo governado da organização, nunca inferido pela interface.</p>
        </div>
        {context.role === "owner" || context.role === "admin" ? <ProductCreateForm /> : null}
        {products.length ? (
          <div className="product-grid">
            {products.map((product) => (
              <Link className="product-card" key={product.id} href={`/dashboard/products/${product.id}`}>
                <span className="eyebrow">{rotuloStatusProduto(product.status)}</span>
                <strong>{product.name}</strong>
                <small>{product.slug}</small>
              </Link>
            ))}
          </div>
        ) : <div className="empty-state"><strong>Nenhum produto configurado.</strong><p>Cadastre um SaaS para habilitar visão e comparação por produto. Nenhum valor é presumido.</p></div>}
      </section>

      {products.length >= 2 ? (
        <section className="executive-section" aria-labelledby="portfolio-comparison-title">
          <div className="section-heading">
            <div><span className="eyebrow">Portfólio</span><h2 id="portfolio-comparison-title">Comparação governada</h2></div>
            <p>Somente mesma métrica, unidade, moeda e período podem ser comparados.</p>
          </div>
          <ProductComparisonForm products={products.map(({ id, name, slug }) => ({ id, name, slug }))} />
        </section>
      ) : null}

      <section className="foundation-grid" aria-label="Controles da plataforma">
        <article><strong>Identidade</strong><span>Validada no servidor</span></article>
        <article><strong>Isolamento por organização</strong><span>Bloqueio por padrão</span></article>
        <article><strong>Motor de Métricas</strong><span>Determinístico</span></article>
        <article><strong>Acesso ao Core</strong><span>Serviço canônico / bloqueio por padrão</span></article>
      </section>

      <CoreQueryForm />
    </main>
  );
}
