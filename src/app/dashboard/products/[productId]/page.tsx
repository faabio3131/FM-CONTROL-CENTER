import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { MetricService } from "@/application/metrics/metric-service";
import { ProductIntelligenceService } from "@/application/products/product-intelligence-service";
import { ProductNotFoundError } from "@/application/products/product-registry-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";

function displayValue(value: { value: string | null; unit: string; currency?: string } | null) {
  if (!value || value.value === null) return "Indisponível";
  if (value.unit === "currency" && value.currency) {
    const numeric = Number(value.value);
    if (Number.isFinite(numeric)) {
      try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: value.currency }).format(numeric); }
      catch { return `${value.value} ${value.currency}`; }
    }
  }
  return value.value;
}

export default async function ProductPage({ params }: { params: Promise<{ productId: string }> }) {
  let context;
  try { context = await resolveTenantContext(await headers()); }
  catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }

  try {
    const { productId } = await params;
    const overview = await new ProductIntelligenceService(
      new PostgresProductRepository(),
      new MetricService(new PostgresMetricStore()),
    ).overview(context, productId);

    return (
      <main className="dashboard-shell">
        <header className="dashboard-header">
          <div>
            <span className="eyebrow">Product Intelligence · F11</span>
            <h1>{overview.product.name}</h1>
            <p>Produto governado: <code>{overview.product.slug}</code> · {overview.product.status}</p>
          </div>
          <Link className="button" href="/dashboard">Voltar</Link>
        </header>

        <section className="executive-section">
          <div className="section-heading">
            <div><span className="eyebrow">Visão por SaaS</span><h2>Métricas por produto</h2></div>
            <p>Sem fonte ou semântica aprovada, o estado permanece indisponível.</p>
          </div>
          <div className="metric-grid">
            {overview.metrics.map(({ target, status, value }) => (
              <article className="metric-card" key={target.metricId}>
                <span className="metric-label">{target.category} · {target.displayName}</span>
                <strong className={status === "available" ? "metric-value" : "metric-value unavailable"}>
                  {status === "pending_semantics" ? "Semântica pendente" : displayValue(value)}
                </strong>
                <div className="metric-meta">
                  <span>Métrica: {target.metricId}</span>
                  <span>{value ? `Freshness: ${value.freshnessStatus}` : "Freshness indisponível"}</span>
                  <span>{value ? `Qualidade: ${value.qualityStatus}` : "Qualidade indisponível"}</span>
                </div>
                <small className="metric-provenance">
                  {value ? `Fonte: ${value.sourceAuthority} · refs: ${value.provenanceRefs.length}` : "Sem provenance factual disponível"}
                </small>
              </article>
            ))}
          </div>
        </section>

        <section className="executive-section">
          <div className="section-heading">
            <div><span className="eyebrow">Growth</span><h2>Evolução governada</h2></div>
            <p>Somente duas observações comparáveis do mesmo produto e métrica podem formar tendência.</p>
          </div>
          <div className="metric-grid">
            {overview.growth.map((signal) => (
              <article className="metric-card" key={signal.metricId}>
                <span className="metric-label">{signal.metricId}</span>
                <strong className={signal.status === "available" ? "metric-value" : "metric-value unavailable"}>
                  {signal.status === "available" ? signal.direction : "Indisponível"}
                </strong>
                <small className="metric-provenance">Nenhum score composto é produzido.</small>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  } catch (error) {
    if (error instanceof ProductNotFoundError) notFound();
    throw error;
  }
}
