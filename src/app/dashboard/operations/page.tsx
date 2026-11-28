import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MetricService } from "@/application/metrics/metric-service";
import { OperationalHealthService } from "@/application/operations/operational-health-service";
import { OperationsIntelligenceService } from "@/application/operations/operations-intelligence-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { roleHasPermission } from "@/domain/security/permissions";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";
import { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import { PostgresOperationalHealthRepository } from "@/infrastructure/operations/postgres-health-repository";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";

function statusLabel(status: "operational" | "degraded" | "unavailable" | "unknown") {
  if (status === "operational") return "Operacional";
  if (status === "degraded") return "Degradado";
  if (status === "unavailable") return "Indisponível";
  return "Desconhecido";
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ detail?: string }>;
}) {
  let context;
  try {
    context = await resolveTenantContext(await headers());
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }

  const products = new PostgresProductRepository();
  const [overview, health] = await Promise.all([
    new OperationsIntelligenceService(
      new MetricService(new PostgresMetricStore()),
      products,
    ).overview(context),
    new OperationalHealthService(
      new PostgresOperationalHealthRepository(),
      products,
    ).overview(context),
  ]);

  const hasMonitoredServices = health.services.length > 0;
  const requestedDetail = (await searchParams).detail;
  const selectedMetric = overview.metrics.find(
    item => item.target.metricId === requestedDetail,
  );
  const healthDetails = ["services", "operational", "degraded", "unavailable"] as const;
  const selectedHealth = healthDetails.find(detail => detail === requestedDetail);
  const selectedServices = health.services.filter(({ effectiveStatus }) => (
    selectedHealth === "services" ||
    (selectedHealth === "operational" && effectiveStatus === "operational") ||
    (selectedHealth === "degraded" && effectiveStatus === "degraded") ||
    (selectedHealth === "unavailable" &&
      (effectiveStatus === "unavailable" || effectiveStatus === "unknown"))
  ));
  // Registered source health is separate from monitored-service observations.
  const sources = roleHasPermission(context.role, "source:read")
    ? await new PostgresSourceRepository().list(context.tenantId)
    : [];
  const healthCards = [
    {
      key: "services", title: "Serviços monitorados",
      value: hasMonitoredServices ? String(health.services.length) : "Indisponível",
      note: hasMonitoredServices ? "Autoridades de saúde registradas" : "Nenhuma autoridade de saúde registrada",
    },
    {
      key: "operational", title: "Operacionais",
      value: hasMonitoredServices ? String(health.counts.operational) : "Indisponível",
      note: "Observações atuais e não stale",
    },
    {
      key: "degraded", title: "Degradados",
      value: hasMonitoredServices ? String(health.counts.degraded) : "Indisponível",
      note: "Estado reportado por fonte governada",
    },
    {
      key: "unavailable", title: "Indisponíveis / desconhecidos",
      value: hasMonitoredServices
        ? String(health.counts.unavailable + health.counts.unknown)
        : "Indisponível",
      note: "Stale é tratado como desconhecido, nunca como saudável",
    },
  ] as const;

  return (
    <main className="dashboard-shell dashboard-shell-compact">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">F14 · Operações, SRE e Incidentes</span>
          <h1>Saúde operacional governada</h1>
          <p>
            Health pontual não é uptime. Disponibilidade só aparece quando houver
            série temporal governada.
          </p>
        </div>
        {roleHasPermission(context.role, "billing:read") ? (
          <Link href="/dashboard/billing/operations">Filas financeiras</Link>
        ) : null}
        {roleHasPermission(context.role, "billing:write") &&
          (context.role === "owner" || context.role === "admin") ? (
          <Link href="/dashboard/billing/lifecycle-reviews">Revisão de assinaturas</Link>
        ) : null}
        <Link href="/dashboard">Voltar</Link>
      </header>

      <section className="metric-grid" aria-label="Resumo da saúde operacional">
        {healthCards.map(card => (
          <Link
            key={card.key}
            href={`/dashboard/operations?detail=${card.key}#operations-detail`}
            className="metric-card fmcc-operational-card-link"
            aria-label={`Detalhar ${card.title}`}
            aria-expanded={selectedHealth === card.key}
            aria-controls="operations-detail"
          >
            <span className="metric-label">{card.title}</span>
            <strong>{card.value}</strong>
            <small>{card.note}</small>
            <span className="fmcc-operational-card-hint">Ver detalhes →</span>
          </Link>
        ))}
      </section>

      <section className="panel" aria-labelledby="service-health-title">
        <h2 id="service-health-title">Status dos Serviços</h2>
        <p>{health.availability.reason}</p>
        {health.services.length ? (
          <div className="foundation-grid">
            {health.services.map(({ service, observation, effectiveStatus }) => (
              <article key={service.id}>
                <strong>{service.name}</strong>
                <span>{service.environment} · {statusLabel(effectiveStatus)}</span>
                <small>
                  {observation
                    ? `Fonte: ${observation.sourceAuthority} · ${observation.freshnessStatus} · ${observation.observedAt.toISOString()}`
                    : "Sem observação governada"}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>Nenhum serviço monitorado.</strong>
            <p>
              Registre uma autoridade de saúde antes de reportar disponibilidade.
              O FM Command não converte ausência de observação em estado saudável.
            </p>
          </div>
        )}
      </section>

      <section className="metric-grid" aria-label="Indicadores de operação">
        {overview.metrics.map(({ target, status, value }) => (
          <Link
            className="metric-card fmcc-operational-card-link"
            key={target.metricId}
            href={`/dashboard/operations?detail=${encodeURIComponent(target.metricId)}#operations-detail`}
            aria-label={`Detalhar ${target.displayName}`}
            aria-expanded={selectedMetric?.target.metricId === target.metricId}
            aria-controls="operations-detail"
          >
            <span className="metric-label">{target.displayName}</span>
            <strong>
              {status === "pending_semantics"
                ? "Semântica pendente"
                : value?.value ?? "Indisponível"}
            </strong>
            <small>
              {value
                ? `Fonte: ${value.sourceAuthority}`
                : status === "pending_semantics"
                  ? "Regra ainda não aprovada"
                  : "Telemetria ainda não conectada"}
            </small>
            <span className="fmcc-operational-card-hint">Ver detalhes →</span>
          </Link>
        ))}
      </section>

      {(selectedHealth || selectedMetric) ? (
        <section id="operations-detail" className="panel fmcc-operations-detail"
          aria-labelledby="operations-detail-title" aria-live="polite">
          <div className="fmcc-operations-detail-head">
            <div>
              <span className="eyebrow">Diagnóstico operacional</span>
              <h2 id="operations-detail-title">
                {selectedHealth
                  ? healthCards.find(card => card.key === selectedHealth)?.title
                  : selectedMetric?.target.displayName}
              </h2>
            </div>
            <Link href="/dashboard/operations" className="button"
              aria-label="Fechar detalhes de operações">Fechar ×</Link>
          </div>

          {selectedHealth ? (
            <>
              <p>{health.availability.reason}</p>
              {selectedServices.length ? (
                <div className="foundation-grid" aria-label="Serviços da seleção">
                  {selectedServices.map(({ service, observation, effectiveStatus }) => (
                    <article key={service.id}>
                      <strong>{service.name}</strong>
                      <span>{service.environment} · {statusLabel(effectiveStatus)}</span>
                      <small>Autoridade registrada: {service.authority}</small>
                      <small>Contrato esperado: {service.expectedHealthContract}</small>
                      <small>{observation
                        ? `Última observação: ${observation.observedAt.toISOString()} · ${observation.freshnessStatus} · Fonte: ${observation.sourceAuthority}`
                        : "Sem observação governada"}</small>
                      {observation?.latencyP95Ms !== undefined
                        ? <small>Latência P95: {observation.latencyP95Ms} ms</small> : null}
                      {observation?.errorRate !== undefined
                        ? <small>Taxa de erro reportada: {observation.errorRate}</small> : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>Nenhum serviço monitorado nesta condição.</strong>
                  <p>Não há observações governadas para detalhar. Isso não comprova disponibilidade nem ausência de falhas.</p>
                </div>
              )}

              {sources.length ? (
                <div className="fmcc-operations-source-summary">
                  <strong>Fontes de integração cadastradas — diagnóstico separado</strong>
                  <p>O status persistido dessas fontes não representa uptime nem observação de serviço monitorado.</p>
                  <div className="foundation-grid">
                    {sources.map(source => (
                      <article key={source.id}>
                        <strong>{source.name}</strong>
                        <small>Tipo: {source.sourceType}</small>
                        <small>Status persistido: {source.status}</small>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : selectedMetric ? (
            <>
              <p>Identificador canônico: <code>{selectedMetric.target.metricId}</code></p>
              <p>Estado: {selectedMetric.status === "available" ? "Disponível"
                : selectedMetric.status === "pending_semantics" ? "Semântica pendente"
                : "Indisponível"}</p>
              <p>Valor governado: {selectedMetric.value?.value ?? "Não informado"}</p>
              <p>Fonte: {selectedMetric.value?.sourceAuthority ?? "Sem telemetria canônica conectada"}</p>
              <p>{selectedMetric.status === "pending_semantics"
                ? "Não há cálculo autorizado de percentual ou consumo sem período, denominador e definição aprovados."
                : selectedMetric.status === "unavailable"
                  ? "Não foram encontrados dados governados para este indicador. Não é possível inferir eventos ausentes."
                  : "Este é um valor agregado. Para investigar ocorrências, consulte os eventos governados disponíveis."}</p>
            </>
          ) : null}

          <nav className="command-quick-actions" aria-label="Investigar dados operacionais">
            {roleHasPermission(context.role, "source:read") ? (
              <Link className="button" href="/dashboard/sources">Fontes e integrações</Link>
            ) : null}
            {roleHasPermission(context.role, "audit:read") ? (
              <Link className="button" href="/dashboard/activity?category=operations">
                Eventos de operações
              </Link>
            ) : null}
            {roleHasPermission(context.role, "alert:read") ? (
              <Link className="button" href="/dashboard/alerts">Alertas governados</Link>
            ) : null}
            {roleHasPermission(context.role, "billing:read") ? (
              <Link className="button" href="/dashboard/billing/operations">
                Filas financeiras
              </Link>
            ) : null}
          </nav>
        </section>
      ) : null}

      <section className="panel">
        <h2>Runtime</h2>
        <p>
          <code>{overview.runtime.healthEndpoint}</code> e{" "}
          <code>{overview.runtime.readinessEndpoint}</code> são contratos pontuais
          de saúde e prontidão.
        </p>
        <p>{overview.availability.reason}</p>
      </section>

      <section className="panel">
        <h2>Sinais operacionais</h2>
        <p>{overview.alerts.reason}</p>
      </section>
    </main>
  );
}
