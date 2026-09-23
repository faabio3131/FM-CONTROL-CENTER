import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { KordenaCommercialControlService } from "@/application/integration/kordena-commercial-control-service";
import { SourceRegistryService } from "@/application/integration/source-registry-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import {
  AuthenticationRequiredError,
  TenantScopeRequiredError,
} from "@/domain/security/tenant-context";
import { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";
import {
  KORDENA_COMMERCIAL_SOURCE_TYPE,
  type KordenaObservabilityMetric,
} from "@/infrastructure/integration/kordena-commercial-connector";
import { KordenaCommercialAdminForm } from "./kordena-commercial-admin-form";

function metricDisplay(metric: KordenaObservabilityMetric | undefined): string {
  if (!metric || metric.status === "unavailable" || metric.value === null) {
    return "Indisponível";
  }
  if (typeof metric.value === "number") return String(metric.value);
  if (typeof metric.value === "string") {
    return metric.unit === "percent" ? `${metric.value}%` : metric.value;
  }
  if (typeof metric.value === "object" && metric.value) {
    const value = metric.value as Record<string, unknown>;
    if (Array.isArray(value.by_currency)) {
      const amounts = value.by_currency
        .map((raw) => {
          if (!raw || typeof raw !== "object") return null;
          const row = raw as Record<string, unknown>;
          if (typeof row.currency !== "string" || typeof row.amount !== "string") {
            return null;
          }
          return `${row.currency} ${row.amount}`;
        })
        .filter((item): item is string => item !== null);
      return amounts.length ? amounts.join(" · ") : "0 assinaturas ativas";
    }
  }
  return "Disponível";
}

export default async function KordenaCommercialPage() {
  let context;
  try {
    context = await resolveTenantContext(await headers());
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }

  const sources = await new SourceRegistryService(
    new PostgresSourceRepository(),
    new PostgresProductRepository(),
  ).list(context);
  const source = sources.find(
    (item) => item.sourceType === KORDENA_COMMERCIAL_SOURCE_TYPE,
  );

  let snapshot:
    | Awaited<ReturnType<KordenaCommercialControlService["snapshot"]>>
    | null = null;
  let unavailable = false;
  if (source) {
    try {
      snapshot = await new KordenaCommercialControlService().snapshot(
        context,
        source.id,
      );
    } catch {
      unavailable = true;
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">KCA-12 · Commercial Control Plane</span>
          <h1>Kordena Comercial</h1>
          <p>
            Dados canônicos consumidos por API governada. Nenhum acesso direto
            ao banco operacional do Kordena.
          </p>
        </div>
        <Link className="button" href="/dashboard">
          Voltar
        </Link>
      </header>

      {!source ? (
        <section className="card">
          <strong>Fonte Kordena ainda não configurada.</strong>
          <p>
            Registre uma source do tipo <code>{KORDENA_COMMERCIAL_SOURCE_TYPE}</code>
            com URL HTTPS e secretRef. Nenhum dado será presumido.
          </p>
        </section>
      ) : unavailable || !snapshot ? (
        <section className="card">
          <strong>Fonte Kordena indisponível.</strong>
          <p>
            O painel permanece sem números em vez de fabricar métricas.
          </p>
        </section>
      ) : (
        <>
          <section className="metric-grid" aria-label="Resumo comercial Kordena">
            <article className="metric-card">
              <span className="metric-label">Clientes</span>
              <strong className="metric-value">{snapshot.summary.customers ?? 0}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Trials ativos</span>
              <strong className="metric-value">{snapshot.summary.active_trials ?? 0}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Assinaturas ativas</span>
              <strong className="metric-value">{snapshot.summary.active_subscriptions ?? 0}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Past due / vencimentos</span>
              <strong className="metric-value">{snapshot.summary.past_due_subscriptions ?? 0}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Pagamentos confirmados</span>
              <strong className="metric-value">{snapshot.summary.confirmed_payments ?? 0}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Falhas de pagamento</span>
              <strong className="metric-value">{snapshot.summary.failed_payments ?? 0}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Usuários</span>
              <strong className="metric-value">{snapshot.summary.users ?? 0}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Unidades</span>
              <strong className="metric-value">{snapshot.summary.units ?? 0}</strong>
            </article>
          </section>

          <section className="executive-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Planos canônicos</span>
                <h2>Catálogo Kordena</h2>
              </div>
              <p>Preços e versões vêm da Commercial Platform.</p>
            </div>
            <div className="product-grid">
              {snapshot.catalog.map((raw) => {
                const plan = raw as {
                  plan_code?: unknown;
                  status?: unknown;
                  effective_version?: unknown;
                };
                const version =
                  plan.effective_version &&
                  typeof plan.effective_version === "object"
                    ? plan.effective_version as Record<string, unknown>
                    : null;
                return (
                  <article className="product-card" key={String(plan.plan_code)}>
                    <span className="eyebrow">{String(plan.status ?? "unknown")}</span>
                    <strong>{String(version?.display_name ?? plan.plan_code ?? "Plano")}</strong>
                    <small>{String(plan.plan_code ?? "")}</small>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="executive-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">KCA-13 · Observabilidade governada</span>
                <h2>Métricas comerciais e saúde operacional</h2>
              </div>
              <p>
                Ausência de fonte ou semântica comprovada continua exibida como
                indisponível, nunca como zero inventado.
              </p>
            </div>
            {snapshot.observability ? (
              <>
                <div className="metric-grid">
                  {[
                    ["Signups iniciados", "signup_started"],
                    ["Signups concluídos", "signup_completed"],
                    ["Tenants provisionados", "tenant_provisioned"],
                    ["Trials ativos", "trial_active"],
                    ["Trials expirando", "trial_expiring"],
                    ["Conversão", "conversion_rate"],
                    ["Assinaturas ativas", "subscription_active"],
                    ["Past due", "past_due"],
                    ["Churn", "churn"],
                    ["MRR", "mrr"],
                    ["ARR", "arr"],
                    ["Pagamentos confirmados", "payment_success"],
                    ["Falhas de pagamento", "payment_failure"],
                  ].map(([label, metricId]) => {
                    const metric = snapshot.observability?.metrics[metricId];
                    return (
                      <article className="metric-card" key={metricId}>
                        <span className="metric-label">{label}</span>
                        <strong
                          className={
                            metric?.status === "unavailable"
                              ? "metric-value unavailable"
                              : "metric-value"
                          }
                        >
                          {metricDisplay(metric)}
                        </strong>
                        <small className="metric-provenance">
                          {metric
                            ? `${metric.quality_status} · ${metric.source_authority}`
                            : "fonte governada indisponível"}
                        </small>
                      </article>
                    );
                  })}
                </div>
                <div className="card">
                  <strong>Saúde: {String(snapshot.observability.health.status ?? "unknown")}</strong>
                  <p>
                    Alertas ativos: {snapshot.observability.alerts.length}.{" "}
                    INTERNAL_TEST excluído dos KPIs comerciais:{" "}
                    {snapshot.observability.internal_test_excluded ? "sim" : "não"}.
                  </p>
                </div>
              </>
            ) : (
              <div className="card">
                <strong>Observabilidade KCA-13 indisponível.</strong>
                <p>
                  O FMCC não substitui ausência de telemetria por valores
                  presumidos.
                </p>
              </div>
            )}
            <div className="card">
              <strong>Cobertura ainda externa ao KCA-13</strong>
              <p>
                Inadimplência monetária:{" "}
                {snapshot.coverage.delinquency_amount ?? "indisponível"} ·
                Suporte: {snapshot.coverage.support ?? "indisponível"}.
              </p>
            </div>
          </section>

          {context.role === "owner" || context.role === "admin" ? (
            <KordenaCommercialAdminForm sourceId={source.id} />
          ) : null}
        </>
      )}
    </main>
  );
}
