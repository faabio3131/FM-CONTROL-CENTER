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
import { KORDENA_COMMERCIAL_SOURCE_TYPE } from "@/infrastructure/integration/kordena-commercial-connector";
import { KordenaCommercialAdminForm } from "./kordena-commercial-admin-form";

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
          <span className="eyebrow">KCA-12 · Plano de controle comercial</span>
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
              <strong className="metric-value">{typeof snapshot.summary.customers === "number" ? snapshot.summary.customers : "Indisponível"}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Testes gratuitos ativos</span>
              <strong className="metric-value">{typeof snapshot.summary.active_trials === "number" ? snapshot.summary.active_trials : "Indisponível"}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Assinaturas ativas</span>
              <strong className="metric-value">{typeof snapshot.summary.active_subscriptions === "number" ? snapshot.summary.active_subscriptions : "Indisponível"}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Assinaturas vencidas ou em atraso</span>
              <strong className="metric-value">{typeof snapshot.summary.past_due_subscriptions === "number" ? snapshot.summary.past_due_subscriptions : "Indisponível"}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Pagamentos confirmados</span>
              <strong className="metric-value">{typeof snapshot.summary.confirmed_payments === "number" ? snapshot.summary.confirmed_payments : "Indisponível"}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Falhas de pagamento</span>
              <strong className="metric-value">{typeof snapshot.summary.failed_payments === "number" ? snapshot.summary.failed_payments : "Indisponível"}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Usuários</span>
              <strong className="metric-value">{typeof snapshot.summary.users === "number" ? snapshot.summary.users : "Indisponível"}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Unidades</span>
              <strong className="metric-value">{typeof snapshot.summary.units === "number" ? snapshot.summary.units : "Indisponível"}</strong>
            </article>
          </section>

          <section className="executive-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Planos canônicos</span>
                <h2>Catálogo Kordena</h2>
              </div>
              <p>Preços e versões vêm da Plataforma Comercial canônica.</p>
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
                    <span className="eyebrow">{String(plan.status ?? "Desconhecido")}</span>
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
                <span className="eyebrow">Métricas e fontes pendentes</span>
                <h2>Semântica governada</h2>
              </div>
              <p>
                Ausência de fonte ou semântica aprovada é exibida como
                indisponível, nunca como zero.
              </p>
            </div>
            <div className="metric-grid">
              {[
                ["MRR", snapshot.coverage.mrr],
                ["ARR", snapshot.coverage.arr],
                ["Taxa de cancelamento", snapshot.coverage.churn],
                ["Inadimplência monetária", snapshot.coverage.delinquency_amount],
                ["Saúde operacional", snapshot.coverage.health],
                ["Custos", snapshot.coverage.costs],
                ["Suporte", snapshot.coverage.support],
              ].map(([label, dependency]) => (
                <article className="metric-card" key={label}>
                  <span className="metric-label">{label}</span>
                  <strong className="metric-value unavailable">Indisponível</strong>
                  <small className="metric-provenance">
                    Dependência: {dependency ?? "fonte governada não configurada"}
                  </small>
                </article>
              ))}
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
