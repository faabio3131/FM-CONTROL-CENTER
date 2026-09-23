import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MetricService } from "@/application/metrics/metric-service";
import { OperationsIntelligenceService } from "@/application/operations/operations-intelligence-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";

export default async function OperationsPage() {
  let context;
  try { context = await resolveTenantContext(await headers()); }
  catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }

  const overview = await new OperationsIntelligenceService(
    new MetricService(new PostgresMetricStore()),
    new PostgresProductRepository(),
  ).overview(context);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">F14 · Operações, SRE e Incidentes</span>
          <h1>Saúde operacional governada</h1>
          <p>Health pontual não é uptime. Disponibilidade só aparece quando houver série temporal governada.</p>
        </div>
        <Link href="/dashboard">Voltar</Link>
      </header>

      <section className="metric-grid">
        {overview.metrics.map(({ target, status, value }) => (
          <article className="metric-card" key={target.metricId}>
            <span className="metric-label">{target.displayName}</span>
            <strong>{status === "pending_semantics" ? "Semântica pendente" : value?.value ?? "Indisponível"}</strong>
            <small>{value ? `Fonte: ${value.sourceAuthority}` : status === "pending_semantics" ? "Regra ainda não aprovada" : "Telemetria ainda não conectada"}</small>
          </article>
        ))}
      </section>

      <section className="panel">
        <h2>Runtime</h2>
        <p><code>{overview.runtime.healthEndpoint}</code> e <code>{overview.runtime.readinessEndpoint}</code> são contratos pontuais de saúde e prontidão.</p>
        <p>{overview.availability.reason}</p>
      </section>

      <section className="panel">
        <h2>Sinais operacionais</h2>
        <p>{overview.alerts.reason}</p>
      </section>
    </main>
  );
}
