import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MetricService } from "@/application/metrics/metric-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";

const SUBSCRIPTION_METRICS = new Set([
  "subscription.active.count", "subscription.cancelled.count", "subscription.logo_churn.rate",
  "revenue.mrr", "revenue.arr", "receivable.delinquent_amount",
]);

export default async function SubscriptionsPage() {
  let context;
  try { context = await resolveTenantContext(await headers()); }
  catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }
  const overview = await new MetricService(new PostgresMetricStore()).overview(context);
  const metrics = overview.filter(({ target }) => SUBSCRIPTION_METRICS.has(target.metricId));
  return (
    <main className="dashboard-shell dashboard-shell-compact">
      <header className="dashboard-header">
        <div><span className="eyebrow">Assinaturas</span><h1>Base recorrente</h1>
          <p>Assinaturas, cancelamentos, churn, MRR, ARR e inadimplência sem confundir faturamento, caixa ou receita recorrente.</p></div>
        <Link href="/dashboard/finance">Abrir Financeiro</Link>
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
        <h2>Separação financeira</h2>
        <p>MRR e ARR só serão exibidos após contrato semântico aprovado; faturamento emitido e caixa recebido permanecem métricas distintas.</p>
      </section>
    </main>
  );
}
