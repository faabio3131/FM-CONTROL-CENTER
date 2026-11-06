import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildActivityFeedService } from "@/application/activity/activity-feed-composition";
import { buildAlertService } from "@/application/alerts/alert-composition";
import { loadTenantIntegrationFeatures } from "@/application/integration/tenant-integration-features";
import { MetricService } from "@/application/metrics/metric-service";
import { OperationalHealthService } from "@/application/operations/operational-health-service";
import { ProductRegistryService } from "@/application/products/product-registry-service";
import { loadDashboardIdentity } from "@/application/security/dashboard-identity";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { roleHasPermission } from "@/domain/security/permissions";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";
import { PostgresOperationalHealthRepository } from "@/infrastructure/operations/postgres-health-repository";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";
import { rotuloAtualidade, rotuloAutoridadeFonte, rotuloMetrica, rotuloQualidade, rotuloSeveridadeAlerta, rotuloStatusDefinicao, rotuloStatusProduto } from "@/presentation/pt-br";
import { BarChart } from "./charts/bar-chart";
import { LiveRefresh } from "./live/live-refresh";
import { countBars } from "@/domain/metrics/dashboard-visuals";
import { CoreQueryForm } from "./core-query-form";
import { ProductComparisonForm } from "./product-comparison-form";
import { ProductCreateForm } from "./product-create-form";

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

function healthStatusLabel(
  status: "operational" | "degraded" | "unavailable" | "unknown",
) {
  if (status === "operational") return "Operacional";
  if (status === "degraded") return "Degradado";
  if (status === "unavailable") return "Indisponível";
  return "Desconhecido";
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
  const productsRepository = new PostgresProductRepository();
  const canReadActivity = roleHasPermission(context.role, "audit:read");
  const [metrics, products, alertOverview, operationalHealth, activityFeed, identity, integrationFeatures] = await Promise.all([
    metricService.overview(context),
    new ProductRegistryService(productsRepository).list(context),
    buildAlertService().overview(context),
    new OperationalHealthService(
      new PostgresOperationalHealthRepository(),
      productsRepository,
    ).overview(context),
    canReadActivity
      ? buildActivityFeedService().page(context, { page: 1, pageSize: 6 })
      : Promise.resolve(null),
    loadDashboardIdentity(context).catch(() => null),
    loadTenantIntegrationFeatures(context).catch(() => ({
      kordenaCommercial: false,
    })),
  ]);
  const governedAvailable = metrics.filter(({ value }) => value?.value !== null && value).length;
  const activeProducts = products.filter((product) => product.status === "active").length;
  const activeAlerts = alertOverview.occurrences.filter((occurrence) => occurrence.status === "active").length;
  const healthBars = countBars([
    { id: "operational", label: "Operacionais", count: operationalHealth.counts.operational },
    { id: "degraded", label: "Degradados", count: operationalHealth.counts.degraded },
    { id: "unavailable", label: "Indisponíveis", count: operationalHealth.counts.unavailable },
    { id: "unknown", label: "Sem observação válida", count: operationalHealth.counts.unknown },
  ], operationalHealth.services.length > 0);
  const alertBars = countBars([
    { id: "critical", label: "Críticos", count: alertOverview.occurrences.filter((x) => x.status === "active" && x.severity === "critical").length },
    { id: "warning", label: "Atenção", count: alertOverview.occurrences.filter((x) => x.status === "active" && x.severity === "warning").length },
    { id: "info", label: "Informativos", count: alertOverview.occurrences.filter((x) => x.status === "active" && x.severity === "info").length },
  ], true);

  return (
    <main className="dashboard-shell dashboard-home-compact">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">Central Executiva de Comando · Prévia</span>
          <h1>FM Command</h1>
          <p>Visão executiva governada de {identity?.organizationName ?? "sua organização"}.</p>
        </div>
        <div className="fmcc-v2-header-tools"><LiveRefresh /><span className="dashboard-header-context">{identity?.organizationName ?? "Organização ativa"}</span></div>
      </header>

      <section className="command-overview" aria-label="Resumo executivo">
        <article className={activeAlerts > 0 ? "command-card attention" : "command-card"}>
          <span>Exigem atenção</span>
          <strong>{activeAlerts}</strong>
          <small>{activeAlerts > 0 ? "alertas ativos com regra governada" : "nenhum alerta ativo governado"}</small>
        </article>
        <article className="command-card">
          <span>Cobertura factual</span>
          <strong>{governedAvailable}/{metrics.length}</strong>
          <small>métricas com valor governado disponível agora</small>
        </article>
        <article className="command-card">
          <span>Produtos ativos</span>
          <strong>{activeProducts}</strong>
          <small>produtos autorizados no tenant atual</small>
        </article>
        <article className="command-card">
          <span>Core Executivo</span>
          <strong>Governado</strong>
          <small><a href="#core-title">Consultar com evidência</a></small>
        </article>
      </section>

      <section className="executive-section fmcc-v2-visual-section" aria-labelledby="fmcc-v2-visual-title">
        <div className="section-heading">
          <div><span className="eyebrow">Portado do Command V2 · Métricas governadas</span><h2 id="fmcc-v2-visual-title">Panorama visual</h2></div>
          <p>Gráficos construídos somente com leituras autorizadas. Ausência de fonte nunca vira zero.</p>
        </div>
        <div className="fmcc-v2-visual-grid">
          <article className="panel fmcc-v2-visual-panel">
            <h3>Saúde dos serviços</h3>
            <p>Estado mais recente de serviços monitorados. Sem fonte registrada, os valores ficam indisponíveis.</p>
            <BarChart items={healthBars} ariaLabel="Serviços por estado operacional" unavailableText="Indisponível" />
          </article>
          <article className="panel fmcc-v2-visual-panel">
            <h3>Alertas ativos por severidade</h3>
            <p>Recorte das até 50 ocorrências mais recentes retornadas pelo serviço de alertas.</p>
            <BarChart items={alertBars} ariaLabel="Alertas ativos por severidade nas últimas 50 ocorrências" unavailableText="Indisponível" />
          </article>
        </div>
      </section>

      <section className="command-home-stage" aria-label="Command Core e operação">
        <div className="command-home-main">
          <CoreQueryForm />
        </div>

        <aside className="command-home-rail" aria-label="Saúde, serviços e alertas">
          <section className="panel command-rail-panel" aria-labelledby="dashboard-operational-health-title">
            <div className="command-rail-heading">
              <div>
                <span className="eyebrow">Operação</span>
                <h2 id="dashboard-operational-health-title">Saúde Operacional</h2>
              </div>
              <Link href="/dashboard/operations">Ver todos</Link>
            </div>

            {operationalHealth.services.length ? (
              <>
                <div className="command-health-summary">
                  <div
                    className="command-health-ring"
                    aria-label={`${operationalHealth.counts.operational} de ${operationalHealth.services.length} serviços operacionais`}
                  >
                    <strong>{operationalHealth.counts.operational}/{operationalHealth.services.length}</strong>
                    <span>serviços operacionais</span>
                  </div>
                  <div className="command-health-counts">
                    <span><strong>{operationalHealth.counts.degraded}</strong> degradados</span>
                    <span><strong>{operationalHealth.counts.unavailable}</strong> indisponíveis</span>
                    <span><strong>{operationalHealth.counts.unknown}</strong> desconhecidos/stale</span>
                  </div>
                </div>

                <ul className="command-service-list">
                  {operationalHealth.services.slice(0, 6).map(({ service, effectiveStatus }) => (
                    <li key={service.id}>
                      <div>
                        <strong>{service.name}</strong>
                        <small>{service.environment}</small>
                      </div>
                      <span className={`command-status-pill ${effectiveStatus}`}>
                        {healthStatusLabel(effectiveStatus)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>
                Indisponível — nenhuma autoridade de saúde foi registrada.
              </p>
            )}
          </section>

          <section className="panel command-rail-panel" aria-labelledby="dashboard-alerts-title">
            <div className="command-rail-heading">
              <div>
                <span className="eyebrow">Atenção governada</span>
                <h2 id="dashboard-alerts-title">Alertas e Incidentes</h2>
              </div>
              <Link href="/dashboard/alerts">Ver todos</Link>
            </div>
            <div className={activeAlerts > 0 ? "command-alert-summary attention" : "command-alert-summary"}>
              <strong>{activeAlerts}</strong>
              <span>{activeAlerts === 1 ? "alerta ativo" : "alertas ativos"}</span>
            </div>
            {alertOverview.occurrences.length ? (
              <ul className="command-alert-list">
                {alertOverview.occurrences.slice(0, 4).map((occurrence) => (
                  <li key={occurrence.id}>
                    <span className={`command-alert-dot ${occurrence.severity}`} aria-hidden="true" />
                    <div>
                      <strong>{rotuloMetrica(occurrence.metricId)}</strong>
                      <small>{rotuloSeveridadeAlerta(occurrence.severity)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nenhuma ocorrência governada na janela atual.</p>
            )}
          </section>
        </aside>
      </section>

      {activityFeed ? (
        <section className="panel command-activity-panel" aria-labelledby="dashboard-activity-title">
          <div className="command-rail-heading">
            <div>
              <span className="eyebrow">Auditoria</span>
              <h2 id="dashboard-activity-title">Atividades recentes</h2>
            </div>
            <Link href="/dashboard/activity">Ver histórico completo</Link>
          </div>
          {activityFeed.items.length ? (
            <ul className="command-activity-grid">
              {activityFeed.items.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{item.category}</span>
                  <small>
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "America/Sao_Paulo",
                    }).format(new Date(item.occurredAt))}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhuma atividade auditável encontrada na janela atual.</p>
          )}
        </section>
      ) : null}

      <section className="foundation-grid" aria-label="Inteligência empresarial">
        <Link href="/dashboard/finance"><strong>Financeiro</strong><span>F12 · dados governados</span></Link>
        <Link href="/dashboard/growth"><strong>Growth / Comercial</strong><span>F13 · funil governado</span></Link>
        <Link href="/dashboard/operations"><strong>Operações / SRE</strong><span>F14 · sinais operacionais</span></Link>
        <Link href="/dashboard/customers"><strong>Clientes / Uso / Suporte</strong><span>F15 · agregados governados</span></Link>
        <Link href="/dashboard/intelligence"><strong>Inteligência Executiva</strong><span>F16 · análise avançada governada</span></Link>
        <Link href="/dashboard/alerts"><strong>Alertas e Automações</strong><span>F17 · regras e workflows governados</span></Link>
        {integrationFeatures.kordenaCommercial ? (
          <Link href="/dashboard/commercial/kordena"><strong>Kordena Comercial</strong><span>Integração comercial governada</span></Link>
        ) : null}
        {roleHasPermission(context.role, "source:read") ? <Link href="/dashboard/sources"><strong>Fontes e Integrações</strong><span>Malha de Integrações · conexões governadas</span></Link> : null}
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

      {activityFeed ? (
        <section className="panel nfcore-ops-audit-console" aria-labelledby="nfcore-ops-audit-title">
          <div className="command-rail-heading">
            <div>
              <span className="eyebrow">Governança · leitura auditável</span>
              <h2 id="nfcore-ops-audit-title">Console de auditoria</h2>
            </div>
            <Link href="/dashboard/activity">Histórico completo</Link>
          </div>
          <p>Até seis eventos recentes do ledger e das projeções autorizadas. Nenhum evento ou ator é fabricado.</p>
          <div className="nfcore-ops-audit-log" role="log" aria-label="Eventos auditáveis recentes" aria-live="off">
            {activityFeed.items.length ? activityFeed.items.map((event) => (
              <div className="nfcore-ops-audit-entry" key={event.id}>
                <time dateTime={event.occurredAt}>[{new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo",
                }).format(new Date(event.occurredAt))}]</time>
                <span>[ATOR: {event.actorRef ?? "não informado"}]</span>
                <span>[TENANT: {context.tenantId}]</span>
                <span>[AÇÃO: {event.action ?? event.eventType}]</span>
                <span data-result={event.result ?? "unknown"}>[STATUS: {event.result ?? "não informado"}]</span>
                <small>Fonte: {event.sourceAuthority} · {event.correlationId ?? "sem correlação"}</small>
              </div>
            )) : <p>Nenhum evento auditável disponível no escopo autorizado.</p>}
          </div>
        </section>
      ) : null}

      <section className="foundation-grid" aria-label="Controles da plataforma">
        <article><strong>Identidade</strong><span>Validada no servidor</span></article>
        <article><strong>Isolamento por organização</strong><span>Bloqueio por padrão</span></article>
        <article><strong>Motor de Métricas</strong><span>Determinístico</span></article>
        <article><strong>Acesso ao Core</strong><span>Serviço canônico / bloqueio por padrão</span></article>
      </section>

    </main>
  );
}
