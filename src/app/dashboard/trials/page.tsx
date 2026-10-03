import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MetricService } from "@/application/metrics/metric-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";

const TRIAL_METRICS = new Set(["trial.starts.count", "trial.active.count", "trial.conversion.rate"]);

export default async function TrialsPage() {
  let context;
  try { context = await resolveTenantContext(await headers()); }
  catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }

  const overview = await new MetricService(new PostgresMetricStore()).overview(context);
  const metrics = overview.filter(({ target }) => TRIAL_METRICS.has(target.metricId));

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div><span className="eyebrow">Trials</span><h1>Testes gratuitos</h1>
          <p>Início, estoque ativo e conversão são exibidos somente com semântica e fonte governadas.</p></div>
        <Link href="/dashboard/growth">Abrir Comercial</Link>
      </header>
      <section className="metric-grid">
        {metrics.map(({ target, definition, value }) => (
          <article className="metric-card" key={target.metricId}>
            <span className="metric-label">{target.displayName}</span>
            <strong>{target.definitionStatus === "pending_semantics" ? "Semântica pendente" : value?.value ?? "Indisponível"}</strong>
            <small>{value ? `Fonte: ${value.sourceAuthority} · ${value.freshnessStatus}` : definition ? "Fonte ainda não conectada" : "Regra de negócio ainda não aprovada"}</small>
          </article>
        ))}
      </section>
      <section className="panel">
        <h2>Governança de conversão</h2>
        <p>A taxa trial → assinatura permanece indisponível até existir coorte, janela e denominador canônicos aprovados.</p>
      </section>
    </main>
  );
}
