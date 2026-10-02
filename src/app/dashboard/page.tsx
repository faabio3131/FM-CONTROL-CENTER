import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildAlertService } from "@/application/alerts/alert-composition";
import { SourceRegistryService } from "@/application/integration/source-registry-service";
import { MetricService, type MetricView } from "@/application/metrics/metric-service";
import { ProductRegistryService } from "@/application/products/product-registry-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { roleHasPermission } from "@/domain/security/permissions";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";
import {
  rotuloAtualidade,
  rotuloAutoridadeFonte,
  rotuloMetrica,
  rotuloQualidade,
  rotuloStatusDefinicao,
  rotuloStatusProduto,
} from "@/presentation/pt-br";
import { CoreQueryForm } from "./core-query-form";
import { ProductComparisonForm } from "./product-comparison-form";
import { ProductCreateForm } from "./product-create-form";

const EXECUTIVE_KPI_IDS = [
  "revenue.mrr",
  "revenue.arr",
  "revenue.cash_collected",
  "trial.active.count",
  "trial.conversion.rate",
  "subscription.active.count",
  "subscription.logo_churn.rate",
  "cost.infrastructure.total",
] as const;

const EXECUTIVE_KPI_LABELS: Record<(typeof EXECUTIVE_KPI_IDS)[number], string> = {
  "revenue.mrr": "MRR",
  "revenue.arr": "ARR",
  "revenue.cash_collected": "Receita do dia",
  "trial.active.count": "Testes gratuitos ativos",
  "trial.conversion.rate": "Conversão de teste",
  "subscription.active.count": "Assinantes",
  "subscription.logo_churn.rate": "Cancelamento mensal",
  "cost.infrastructure.total": "Custo de infra",
};

function formatTemporalContext(value: { periodStart?: Date; periodEnd?: Date; asOf?: Date }) {
  if (value.asOf) return `Referência temporal: ${value.asOf.toISOString()}`;
  if (value.periodStart || value.periodEnd) {
    return `Período: ${value.periodStart?.toISOString() ?? "?"} → ${value.periodEnd?.toISOString() ?? "?"}`;
  }
  return "Período: não informado pela fonte";
}

function formatMetric(value: string | null, unit: string, currency?: string) {
  if (value === null) return "Indisponível";
  if (unit === "currency" && currency) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      try {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(numeric);
      } catch {
        return `${value} ${currency}`;
      }
    }
  }
  if (unit === "percent") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(numeric)}%`;
    }
  }
  return value;
}

function metricValue(value?: MetricView | null) {
  return value ? formatMetric(value.value, value.unit, value.currency) : "Indisponível";
}

function relativeTime(date: Date) {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

function sourceStatusLabel(status: string) {
  if (status === "healthy") return "Saudável";
  if (status === "degraded") return "Degradada";
  if (status === "unavailable") return "Indisponível";
  return "Configurada";
}

function alertSeverityLabel(severity: string) {
  if (severity === "critical") return "Crítico";
  if (severity === "warning") return "Aviso";
  return "Informativo";
}

function activityCategory(metricId: string) {
  if (/^(billing|revenue|receivable|cost|finance)\./.test(metricId)) return "Financeiro";
  if (/^(lead|trial|subscription)\./.test(metricId)) return "Comercial";
  if (/^(incident|job|integration|service)\./.test(metricId)) return "Operações";
  return "Sistema";
}

export default async function DashboardPage() {
  let context;
  try {
    context = await resolveTenantContext(await headers());
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }

  const metricService = new MetricService(new PostgresMetricStore());
  const productRepository = new PostgresProductRepository();
  const productService = new ProductRegistryService(productRepository);
  const sourcePromise = roleHasPermission(context.role, "source:read")
    ? new SourceRegistryService(new PostgresSourceRepository(), productRepository).list(context)
    : Promise.resolve([]);

  const [metrics, products, alertOverview, sources] = await Promise.all([
    metricService.overview(context),
    productService.list(context),
    buildAlertService().overview(context),
    sourcePromise,
  ]);

  const productSignalEntries = await Promise.all(
    products.map(async (product) => {
      const [users, revenue, trials] = await Promise.all([
        metricService.query(context, "usage.active_users.dau", product.id),
        metricService.query(context, "revenue.cash_collected", product.id),
        metricService.query(context, "trial.starts.count", product.id),
      ]);
      return [product.id, { users, revenue, trials }] as const;
    }),
  );
  const productSignals = new Map(productSignalEntries);

  const executiveKpis = EXECUTIVE_KPI_IDS.map((metricId) =>
    metrics.find(({ target }) => target.metricId === metricId),
  ).filter((item): item is NonNullable<typeof item> => Boolean(item));

  const activeAlerts = [...alertOverview.occurrences]
    .filter((occurrence) => occurrence.status === "active")
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
  const recentActivity = [...alertOverview.occurrences]
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, 8);

  const healthySources = sources.filter((source) => source.status === "healthy").length;
  const criticalAlerts = activeAlerts.filter((alert) => alert.severity === "critical").length;
  const warningAlerts = activeAlerts.filter((alert) => alert.severity === "warning").length;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header command-dashboard-heading">
        <div>
          <span className="eyebrow">Central Executiva de Comando</span>
          <h1>FM Command</h1>
          <p>Visão executiva governada da Nova FM Tecnologia.</p>
        </div>
        <span
          className="dashboard-header-context"
          title={`Tenant ${context.tenantId}`}
          aria-label={`Organização ativa. Identificador do tenant ${context.tenantId}`}
        >
          Organização ativa · <code>{context.tenantId.slice(0, 6)}…{context.tenantId.slice(-4)}</code>
        </span>
      </header>

      <section className="command-overview-grid" aria-label="Visão executiva">
        <div className="command-kpi-strip" aria-label="Indicadores executivos">
          {executiveKpis.map(({ target, definition, value }, index) => (
            <article className={`command-kpi-card command-kpi-card-${(index % 4) + 1}`} key={target.metricId}>
              <span className="command-kpi-label">{EXECUTIVE_KPI_LABELS[target.metricId as (typeof EXECUTIVE_KPI_IDS)[number]] ?? target.displayName}</span>
              <strong className={value?.value === null || !value ? "unavailable" : undefined}>
                {value ? formatMetric(value.value, value.unit, value.currency) : "Indisponível"}
              </strong>
              <small>
                {value
                  ? `${rotuloQualidade(value.qualityStatus)} · ${rotuloAtualidade(value.freshnessStatus)}`
                  : definition
                    ? "Sem valor governado"
                    : "Sem definição semântica"}
              </small>
              <span className="command-kpi-mini-chart" aria-hidden="true">
                <i /><i /><i /><i /><i /><i /><i />
              </span>
            </article>
          ))}
        </div>

        <section className="command-ops-card command-health-card command-health-card-top" aria-labelledby="health-title">
          <div className="command-ops-heading">
            <div>
              <span className="eyebrow">Operação</span>
              <h2 id="health-title">Saúde Operacional</h2>
            </div>
            <span className="command-health-state">Governada</span>
          </div>

          <div className="command-health-summary">
            <div className="command-health-ring" aria-label="Disponibilidade consolidada indisponível">
              <strong>Indisponível</strong>
              <span>uptime consolidado</span>
            </div>
            <div className="command-health-facts">
              <div><strong>{healthySources}</strong><span>fontes saudáveis</span></div>
              <div><strong>{criticalAlerts}</strong><span>incidentes críticos</span></div>
              <div><strong>{warningAlerts}</strong><span>avisos ativos</span></div>
            </div>
          </div>
        </section>
      </section>

      <div className="command-primary-grid">
        <CoreQueryForm />

        <aside className="command-operations-column" aria-label="Operação e saúde">
          <section className="command-ops-card command-health-card command-health-card-detail" aria-labelledby="health-detail-title">
            <div className="command-ops-heading">
              <div>
                <span className="eyebrow">Operação</span>
                <h2 id="health-detail-title">Saúde Operacional</h2>
              </div>
              <span className="command-health-state">Governada</span>
            </div>
            <div className="command-health-detail-grid">
              <div className="command-health-detail-ring">
                <strong>Indisponível</strong>
                <span>disponibilidade</span>
              </div>
              <div className="command-health-detail-facts">
                <div><strong>{healthySources}</strong><span>Serviços online</span></div>
                <div><strong>{criticalAlerts}</strong><span>Incidentes críticos</span></div>
                <div><strong>{warningAlerts}</strong><span>Avisos</span></div>
              </div>
            </div>
          </section>

          <section className="command-ops-card" aria-labelledby="services-title">
            <div className="command-ops-heading compact">
              <div>
                <span className="eyebrow">Conectividade</span>
                <h2 id="services-title">Situação dos Serviços</h2>
              </div>
              {roleHasPermission(context.role, "source:read") ? (
                <Link href="/dashboard/sources">Ver fontes</Link>
              ) : null}
            </div>
            {sources.length ? (
              <div className="command-service-list">
                {sources.slice(0, 5).map((source) => (
                  <div className="command-service-row" key={source.id}>
                    <span className={`command-status-dot ${source.status}`} aria-hidden="true" />
                    <div>
                      <strong>{source.name}</strong>
                      <small>{source.authoritativeDomain}</small>
                    </div>
                    <span className={`command-service-status ${source.status}`}>
                      {sourceStatusLabel(source.status)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="command-empty-compact">
                <strong>Sem dados</strong>
                <span>Nenhuma fonte registrada para reportar saúde.</span>
              </div>
            )}
          </section>

          <section className="command-ops-card" aria-labelledby="alerts-title">
            <div className="command-ops-heading compact">
              <div>
                <span className="eyebrow">Atenção</span>
                <h2 id="alerts-title">Alertas e Incidentes</h2>
              </div>
              <Link href="/dashboard/alerts">Ver todos</Link>
            </div>
            {activeAlerts.length ? (
              <div className="command-alert-list">
                {activeAlerts.slice(0, 3).map((alert) => (
                  <article className={`command-alert-row ${alert.severity}`} key={alert.id}>
                    <span className="command-alert-icon" aria-hidden="true">!</span>
                    <div>
                      <strong>{rotuloMetrica(alert.metricId)}</strong>
                      <small>
                        {alertSeverityLabel(alert.severity)} · {relativeTime(alert.occurredAt)}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="command-empty-compact healthy">
                <strong>Nenhum alerta ativo</strong>
                <span>Não há ocorrência governada exigindo atenção agora.</span>
              </div>
            )}
          </section>
        </aside>
      </div>

      <section className="command-quick-actions" aria-labelledby="quick-actions-title">
        <div className="section-heading compact-heading">
          <div>
            <span className="eyebrow">Navegação operacional</span>
            <h2 id="quick-actions-title">Ações rápidas</h2>
          </div>
        </div>
        <div className="foundation-grid command-action-grid">
          <Link href="/dashboard/finance"><strong>Financeiro</strong><span>Dados e unit economics governados</span></Link>
          <Link href="/dashboard/growth"><strong>Comercial</strong><span>Funil e crescimento governados</span></Link>
          <Link href="/dashboard/operations"><strong>Operações</strong><span>Sinais operacionais e SRE</span></Link>
          <Link href="/dashboard/customers"><strong>Clientes</strong><span>Uso, suporte e engajamento</span></Link>
          <Link href="/dashboard/intelligence"><strong>Inteligência</strong><span>Análise executiva governada</span></Link>
          <Link href="/dashboard/alerts"><strong>Alertas</strong><span>Regras e fluxos de trabalho governados</span></Link>
          <Link href="/dashboard/commercial/kordena"><strong>Kordena</strong><span>Integração comercial governada</span></Link>
          {roleHasPermission(context.role, "source:read") ? (
            <Link href="/dashboard/sources"><strong>Fontes</strong><span>Integrações e conectividade</span></Link>
          ) : null}
        </div>
      </section>

      <section className="executive-section command-products-section" aria-labelledby="product-intelligence-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Portfólio Nova FM</span>
            <h2 id="product-intelligence-title">Produtos da FM Tecnologia</h2>
          </div>
          <p>Os indicadores por produto são exibidos somente quando existe valor governado para aquele escopo.</p>
        </div>

        {context.role === "owner" || context.role === "admin" ? (
          <details className="command-admin-disclosure">
            <summary>Administrar portfólio</summary>
            <ProductCreateForm />
          </details>
        ) : null}

        {products.length ? (
          <div className="product-grid command-product-grid">
            {products.map((product) => {
              const signal = productSignals.get(product.id);
              return (
                <Link className="product-card command-product-card" key={product.id} href={`/dashboard/products/${product.id}`}>
                  <div className="command-product-header">
                    <div>
                      <span className="command-product-logo" aria-hidden="true">{product.name.slice(0, 1).toUpperCase()}</span>
                      <div>
                        <strong>{product.name}</strong>
                        <small>{product.slug}</small>
                      </div>
                    </div>
                    <div className="command-product-badges">
                      <span className="command-product-tag">Software</span>
                      <span className={`command-product-status ${product.status}`}>{rotuloStatusProduto(product.status)}</span>
                    </div>
                  </div>

                  <div className="command-product-health">
                    <span>Saúde</span>
                    <strong>Sem dados de disponibilidade</strong>
                  </div>

                  <div className="command-product-stats">
                    <div><span>Usuários</span><strong>{metricValue(signal?.users)}</strong></div>
                    <div><span>Receita</span><strong>{metricValue(signal?.revenue)}</strong></div>
                    <div><span>Testes</span><strong>{metricValue(signal?.trials)}</strong></div>
                  </div>

                  <span className="command-product-mini-chart" aria-hidden="true">
                    <i /><i /><i /><i /><i /><i /><i /><i />
                  </span>

                  <div className="command-product-footer">
                    <span>Dados governados por escopo</span>
                    <strong>Ver detalhes →</strong>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <strong>Nenhum produto configurado.</strong>
            <p>Cadastre um produto para habilitar visão e comparação. Nenhum valor é presumido.</p>
          </div>
        )}
      </section>

      <section className="executive-section command-activity-section" aria-labelledby="recent-activity-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Trilha operacional</span>
            <h2 id="recent-activity-title">Atividade Recente</h2>
          </div>
          <Link className="command-section-link" href="/dashboard/alerts">Abrir histórico</Link>
        </div>

        <div className="command-activity-filters" aria-label="Categorias visuais da atividade">
          {["Todos", "Financeiro", "Comercial", "Operações", "Sistema", "Segurança"].map((filter, index) => (
            <span className={index === 0 ? "active" : undefined} key={filter}>{filter}</span>
          ))}
        </div>

        {recentActivity.length ? (
          <div className="command-activity-list">
            {recentActivity.map((event) => (
              <article className="command-activity-row" key={event.id}>
                <span className={`command-activity-icon ${event.severity}`} aria-hidden="true">•</span>
                <div className="command-activity-main">
                  <strong>{rotuloMetrica(event.metricId)}</strong>
                  <span>{activityCategory(event.metricId)} · {alertSeverityLabel(event.severity)}</span>
                </div>
                <div className="command-activity-context">
                  <strong>{event.observedValue}</strong>
                  <span>{relativeTime(event.occurredAt)}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state command-activity-empty">
            <strong>Nenhuma atividade governada recente.</strong>
            <p>Eventos aparecerão aqui quando existirem ocorrências reais registradas pelo sistema.</p>
          </div>
        )}
      </section>

      <details className="command-detail-disclosure">
        <summary>Ver todas as métricas governadas</summary>
        <section className="executive-section" aria-labelledby="executive-overview-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Métricas governadas</span>
              <h2 id="executive-overview-title">Visão detalhada</h2>
            </div>
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
                  <span>
                    {value
                      ? `Qualidade: ${rotuloQualidade(value.qualityStatus)}`
                      : definition
                        ? "Sem valor governado"
                        : "Definição semântica pendente"}
                  </span>
                  <span>
                    {value
                      ? `Atualidade: ${rotuloAtualidade(value.freshnessStatus)}`
                      : definition
                        ? "Fonte ainda não conectada"
                        : "Métrica ainda não implementada"}
                  </span>
                  <span>{value ? formatTemporalContext(value) : "Período indisponível"}</span>
                </div>
                <small className="metric-provenance">
                  {value
                    ? `Fonte: ${rotuloAutoridadeFonte(value.sourceAuthority)} · versão ${value.metricVersion}`
                    : `Identificador técnico: ${target.metricId} · ${rotuloStatusDefinicao(target.definitionStatus)}`}
                </small>
              </article>
            ))}
          </div>
        </section>
      </details>

      {products.length >= 2 ? (
        <section className="executive-section" aria-labelledby="portfolio-comparison-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Portfólio</span>
              <h2 id="portfolio-comparison-title">Comparação governada</h2>
            </div>
            <p>Somente mesma métrica, unidade, moeda e período podem ser comparados.</p>
          </div>
          <ProductComparisonForm products={products.map(({ id, name, slug }) => ({ id, name, slug }))} />
        </section>
      ) : null}

      <section className="foundation-grid command-governance-grid" aria-label="Controles da plataforma">
        <article><strong>Identidade</strong><span>Validada no servidor</span></article>
        <article><strong>Isolamento por organização</strong><span>Bloqueio por padrão</span></article>
        <article><strong>Motor de Métricas</strong><span>Determinístico</span></article>
        <article><strong>Acesso ao Core</strong><span>Serviço canônico / bloqueio por padrão</span></article>
      </section>
    </main>
  );
}
