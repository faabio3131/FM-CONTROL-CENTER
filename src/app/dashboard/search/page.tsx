import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildGlobalSearchService } from "@/application/search/global-search-composition";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import type {
  GlobalSearchOverview,
  GlobalSearchResultKind,
} from "@/domain/search/contracts";
import { roleHasPermission } from "@/domain/security/permissions";
import {
  AuthenticationRequiredError,
  TenantScopeRequiredError,
} from "@/domain/security/tenant-context";

function kindLabel(kind: GlobalSearchResultKind): string {
  if (kind === "navigation") return "Módulo";
  if (kind === "metric") return "Métrica";
  if (kind === "product") return "Produto";
  if (kind === "source") return "Fonte";
  return "Regra de alerta";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  let context;
  try {
    context = await resolveTenantContext(await headers());
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }

  if (!roleHasPermission(context.role, "search:use")) {
    redirect("/dashboard");
  }

  const query = (await searchParams).q?.trim() ?? "";
  let overview: GlobalSearchOverview | null = null;
  let validationMessage = "";

  if (query) {
    if (query.length < 2 || query.length > 80) {
      validationMessage = "Digite entre 2 e 80 caracteres para buscar.";
    } else {
      overview = await buildGlobalSearchService().search(context, query, 50);
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">R9 · Busca global governada</span>
          <h1>Busca no FM Command</h1>
          <p>
            Localize módulos, métricas, produtos, fontes e regras de alerta
            dentro das permissões da organização ativa.
          </p>
        </div>
        <Link className="button" href="/dashboard">
          Voltar à Visão Geral
        </Link>
      </header>

      <section className="panel">
        <form action="/dashboard/search" method="get">
          <label htmlFor="global-search-query">
            Buscar
          </label>
          <input
            id="global-search-query"
            name="q"
            type="search"
            minLength={2}
            maxLength={80}
            defaultValue={query}
            placeholder="Ex.: Kordena, MRR, integrações, incidentes"
            autoComplete="off"
          />
          <button className="button primary" type="submit">
            Buscar
          </button>
        </form>
        <p>
          A busca é determinística, tenant-scoped e permission-aware. Ela não
          pesquisa segredos, config de integração, metadata bruto nem PII
          operacional.
        </p>
      </section>

      {validationMessage ? (
        <section className="panel" role="alert">
          <strong>Consulta inválida</strong>
          <p>{validationMessage}</p>
        </section>
      ) : null}

      {overview ? (
        <>
          <section className="metric-grid" aria-label="Cobertura da busca">
            <article className="metric-card">
              <span className="metric-label">Resultados</span>
              <strong>{overview.counts.returned}</strong>
              <small>{overview.counts.totalMatches} correspondências encontradas.</small>
            </article>
            <article className="metric-card">
              <span className="metric-label">Produtos / Fontes</span>
              <strong>
                {overview.counts.products} / {overview.counts.sources}
              </strong>
              <small>Somente recursos autorizados do tenant ativo.</small>
            </article>
            <article className="metric-card">
              <span className="metric-label">Métricas</span>
              <strong>{overview.counts.metrics}</strong>
              <small>Registry e targets executivos governados.</small>
            </article>
            <article className="metric-card">
              <span className="metric-label">Alertas</span>
              <strong>{overview.counts.alertRules}</strong>
              <small>Regras não arquivadas visíveis ao papel atual.</small>
            </article>
          </section>

          <section className="executive-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Consulta</span>
                <h2>Resultados para “{overview.query}”</h2>
              </div>
              <p>{overview.coverageNote}</p>
            </div>
            <div className="product-grid">
              {overview.items.length ? (
                overview.items.map((item) => (
                  <Link className="product-card" href={item.href} key={item.id}>
                    <span className="eyebrow">{kindLabel(item.kind)}</span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                    <small>
                      Autoridade: <code>{item.authority}</code>
                    </small>
                  </Link>
                ))
              ) : (
                <article className="product-card">
                  <strong>Nenhum resultado governado encontrado.</strong>
                  <small>
                    A ausência de correspondência não amplia o escopo nem
                    consulta fontes às quais o papel não tem acesso.
                  </small>
                </article>
              )}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
