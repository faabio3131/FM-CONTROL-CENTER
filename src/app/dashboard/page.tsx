import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MetricService } from "@/application/metrics/metric-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";
import { CoreQueryForm } from "./core-query-form";
import { SignOutButton } from "./sign-out-button";

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

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">Executive Command Center · Preview</span>
          <h1>Control Center</h1>
          <p>Tenant autenticado: <code>{context.tenantId}</code></p>
        </div>
        <SignOutButton />
      </header>

      <section className="executive-section" aria-labelledby="executive-overview-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Métricas governadas</span>
            <h2 id="executive-overview-title">Visão executiva</h2>
          </div>
          <p>Ausência de fonte é exibida como indisponível — nunca como zero.</p>
        </div>
        <div className="metric-grid">
          {metrics.map(({ definition, value }) => (
            <article className="metric-card" key={definition.metricId}>
              <span className="metric-label">{definition.displayName}</span>
              <strong className={value?.value === null || !value ? "metric-value unavailable" : "metric-value"}>
                {value ? formatMetric(value.value, value.unit, value.currency) : "Indisponível"}
              </strong>
              <div className="metric-meta">
                <span>{value ? `Qualidade: ${value.qualityStatus}` : "Sem valor governado"}</span>
                <span>{value ? `Freshness: ${value.freshnessStatus}` : "Fonte ainda não conectada"}</span>
              </div>
              <small className="metric-provenance">
                {value ? `Fonte: ${value.sourceAuthority} · v${value.metricVersion}` : `Métrica: ${definition.metricId}`}
              </small>
            </article>
          ))}
        </div>
      </section>

      <section className="foundation-grid" aria-label="Controles da plataforma">
        <article><strong>Identidade</strong><span>Server-side</span></article>
        <article><strong>Tenant isolation</strong><span>Fail-closed</span></article>
        <article><strong>Metric Engine</strong><span>Determinístico</span></article>
        <article><strong>Core Gateway</strong><span>Serviço canônico / fail-closed</span></article>
      </section>

      <CoreQueryForm />
    </main>
  );
}
