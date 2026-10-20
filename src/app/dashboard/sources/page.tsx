import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildC08IntegrationReadiness, type C08EvidenceState, type C08NextAction } from "@/application/integration/c08-product-readiness";
import { assertC08SnapshotCapacity, readC08OperationalStates } from "@/application/integration/c08-operational-snapshot";
import { SourceRegistryService } from "@/application/integration/source-registry-service";
import { ProductRegistryService } from "@/application/products/product-registry-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { roleHasPermission } from "@/domain/security/permissions";
import {
  AuthenticationRequiredError,
  TenantScopeRequiredError,
} from "@/domain/security/tenant-context";
import {
  PostgresSourceRepository,
  PostgresSyncRepository,
} from "@/infrastructure/integration/postgres-repositories";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";
import { SourceControlPanel } from "./source-control-panel";

export default async function SourcesPage() {
  let context;
  try {
    context = await resolveTenantContext(await headers());
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect("/sign-in");
    }
    if (error instanceof TenantScopeRequiredError) {
      redirect("/onboarding");
    }
    throw error;
  }

  if (!roleHasPermission(context.role, "source:read")) {
    redirect("/dashboard");
  }

  const sourceRepository = new PostgresSourceRepository();
  const sourceService = new SourceRegistryService(
    sourceRepository,
    new PostgresProductRepository(),
  );
  const productService = new ProductRegistryService(
    new PostgresProductRepository(),
  );
  const syncRepository = new PostgresSyncRepository();

  const [sourceRecords, productRecords] = await Promise.all([
    sourceService.list(context),
    productService.list(context),
  ]);
  assertC08SnapshotCapacity(productRecords, sourceRecords);
  // Defensive tenant filter: even a broken repository must not leak foreign
  // metadata in the operator controls or trigger foreign synchronization reads.
  const sources = sourceRecords.filter(source => source.tenantId === context.tenantId);
  const products = productRecords.filter(product => product.tenantId === context.tenantId);
  const operationalStates = await readC08OperationalStates(
    context.tenantId, sourceRecords, syncRepository,
  );

  const safeSources = sources.map((source) => {
    const operational = operationalStates.get(source.id);
    return {
      id: source.id,
      productId: source.productId,
      name: source.name,
      sourceType: source.sourceType,
      authoritativeDomain: source.authoritativeDomain,
      status: source.status,
      syncMode: source.syncMode,
      freshnessSeconds: source.freshnessSeconds,
      hasSecretReference: Boolean(source.secretRef),
      baseUrl:
        typeof source.config.baseUrl === "string"
          ? source.config.baseUrl
          : undefined,
      lastAttemptAt: operational?.lastAttemptAt?.toISOString(),
      lastAttemptStatus: operational?.lastAttemptStatus,
      lastSuccessfulSyncAt:
        operational?.lastSuccessfulAt?.toISOString(),
    };
  });

  const readiness = buildC08IntegrationReadiness(context.tenantId, products, sources, operationalStates);

  const activeProducts = products
    .filter((product) => product.status === "active")
    .map(({ id, name, slug }) => ({
      id,
      name,
      slug,
    }));

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">Malha de Integrações</span>
          <h1>Fontes e Integrações</h1>
          <p>
            Cadastro, teste de saúde e sincronização de fontes
            governadas. Nenhuma fonte é considerada conectada apenas
            por estar cadastrada.
          </p>
        </div>
        <Link className="button" href="/dashboard">
          Voltar
        </Link>
      </header>

      <section
        className="foundation-grid"
        aria-label="Princípios das integrações"
      >
        <article>
          <strong>Segredos</strong>
          <span>Somente por referência no servidor</span>
        </article>
        <article>
          <strong>Isolamento</strong>
          <span>Organização validada antes de acessar a fonte</span>
        </article>
        <article>
          <strong>Ingestão</strong>
          <span>Fatos canônicos com idempotência</span>
        </article>
        <article>
          <strong>Ausência</strong>
          <span>Nunca convertida em zero</span>
        </article>
      </section>

      <section className="executive-section" aria-labelledby="c08-readiness-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">C08 · Integrações por produto</span>
            <h2 id="c08-readiness-title">Matriz de prontidão das fontes</h2>
          </div>
          <p>Fonte registrada não equivale a integração homologada. Sincronização local
            recente não substitui autenticação entre serviços nem prova de entrega.</p>
        </div>
        <p role="status">
          {readiness.localSummary.activeProducts} produto(s) ativo(s) ·
          {" "}{readiness.localSummary.boundSources} fonte(s) vinculada(s) ·
          {" "}{readiness.localSummary.sourcesWithRecentLocalSync} sincronização(ões) local(is) recente(s) ·
          {" "}{readiness.localSummary.rowsWithoutRecentLocalSync} linha(s) sem sincronização local recente.
          Estes números não representam integrações certificadas.
        </p>
        {readiness.rows.length === 0 ? (
          <div className="empty-state"><strong>Nenhum produto ativo.</strong>
            <p>Cadastre o produto e sua fonte governada antes da certificação.</p>
          </div>
        ) : (
          <div className="product-grid">
            {readiness.rows.map((item) => {
              const labels: Record<C08EvidenceState, string> = {
                not_configured: "Fonte não cadastrada",
                unverified: "Sem sincronização comprovada",
                persisted_unavailable: "Fonte marcada indisponível",
                sync_running: "Sincronização em andamento",
                sync_failed: "Última sincronização falhou",
                freshness_undefined: "Atualidade sem prazo definido",
                sync_stale: "Sincronização desatualizada",
                sync_recent: "Sincronização local recente",
              };
              const nextActions: Record<C08NextAction, string> = {
                register_source: "Cadastrar fonte governada deste produto",
                investigate_unavailable_source: "Investigar indisponibilidade persistida",
                investigate_failed_sync: "Investigar a última falha de sincronização",
                observe_running_sync: "Acompanhar a sincronização em andamento",
                perform_first_sync: "Verificar conexão e executar a primeira sincronização",
                define_freshness: "Definir atualidade esperada e revisar o contrato da fonte",
                refresh_stale_sync: "Investigar atraso e renovar a sincronização",
                verify_source_health: "Verificar a saúde autenticada da fonte",
                investigate_degraded_health: "Investigar a saúde degradada da fonte",
                certify_authenticated_saas_e2e: "Certificar contrato e E2E autenticado do SaaS em ambiente isolado",
              };
              return <article className="product-card" key={item.sourceId ?? item.productId}>
                <strong>{item.productName}</strong>
                <span>{labels[item.state]}</span>
                <small>{item.sourceType ?? "Sem contrato de conector registrado"}</small>
                <small>Versão: {item.mappingVersion ?? "Indisponível"}</small>
                <small>Próxima verificação: {nextActions[item.nextAction]}</small>
                <small>Último sucesso local: {item.lastSuccessfulAt ??
                  "Sem evidência registrada"}</small>
                <small>Integração S2S E2E: não certificada por esta matriz</small>
                <small>Homologação externa: não comprovada por esta matriz</small>
              </article>;
            })}
          </div>
        )}
        {readiness.unboundSourceCount > 0 ? (
          <p role="status">Há {readiness.unboundSourceCount} fonte(s) sem vínculo com produto
            ativo deste tenant; nenhuma foi contabilizada como integração de produto.</p>
        ) : null}
        <p className="metric-provenance">Autoridade: {readiness.authority}.
          Avaliação em {readiness.asOf}. A certificação real exige gate separado
          de contrato, autenticação, versão publicada, dados e recuperação.</p>
      </section>

      <SourceControlPanel
        products={activeProducts}
        sources={safeSources}
        canWrite={roleHasPermission(context.role, "source:write")}
      />
    </main>
  );
}
