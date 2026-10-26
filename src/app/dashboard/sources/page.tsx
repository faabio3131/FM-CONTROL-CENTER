import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildC08IntegrationReadiness, type C08EvidenceState, type C08NextAction } from "@/application/integration/c08-product-readiness";
import { assertC08SnapshotCapacity, readC08OperationalStates } from "@/application/integration/c08-operational-snapshot";
import { SAAS_ADAPTER_PROFILES, profileForProductSlug } from "@/application/integration/saas-adapter-profiles";
import { buildSaasAdapterPreflight, type SaasAdapterPreflightStatus } from "@/application/integration/saas-adapter-preflight";
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
import { commercialOriginOverride, commercialOriginOverrideEnabled } from "@/application/integration/commercial-origin-override";
import { environmentIronAllowedOrigins, environmentIronControlTenantId, IRON_COMMERCIAL_SECRET_REF, IRON_COMMERCIAL_SOURCE_TYPE } from "@/infrastructure/integration/iron-commercial-connector";
import { environmentKordenaAllowedOrigins, environmentKordenaControlTenantId, KORDENA_COMMERCIAL_SECRET_REF, KORDENA_COMMERCIAL_SOURCE_TYPE } from "@/infrastructure/integration/kordena-commercial-connector";

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
    // Display both the persisted address and the actually selected in-memory route.
    // This never rewrites the canonical source row or expands any permissions.
    let runtimeOrigin: string | undefined;
    let originOverrideInvalid = false;
    const iron = source.sourceType === IRON_COMMERCIAL_SOURCE_TYPE;
    const kordena = source.sourceType === KORDENA_COMMERCIAL_SOURCE_TYPE;
    if (iron || kordena) {
      try {
        runtimeOrigin = commercialOriginOverride(source, {
          enabled: commercialOriginOverrideEnabled(iron
            ? process.env.FMCC_IRON_SOURCE_ORIGIN_OVERRIDE
            : process.env.FMCC_KORDENA_SOURCE_ORIGIN_OVERRIDE),
          controlTenantId: iron ? environmentIronControlTenantId() : environmentKordenaControlTenantId(),
          sourceType: iron ? IRON_COMMERCIAL_SOURCE_TYPE : KORDENA_COMMERCIAL_SOURCE_TYPE,
          secretRef: iron ? IRON_COMMERCIAL_SECRET_REF : KORDENA_COMMERCIAL_SECRET_REF,
          configuredBaseUrl: iron ? process.env.FMCC_IRON_BASE_URL : process.env.FMCC_KORDENA_BASE_URL,
          allowedOrigins: iron ? environmentIronAllowedOrigins() : environmentKordenaAllowedOrigins(),
        }) ?? undefined;
      } catch {
        originOverrideInvalid = true;
      }
    }
    return {
      runtimeOrigin,
      originOverrideInvalid,
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
  const admission = buildSaasAdapterPreflight(context.tenantId, products, sources);

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
              const preflight = admission.rows.find(row =>
                row.productId === item.productId && row.sourceId === item.sourceId
              );
              const preflightLabels: Record<SaasAdapterPreflightStatus, string> = {
                adapter_missing: "Adaptador ainda não implementado",
                source_missing: "Fonte governada ainda não cadastrada",
                binding_mismatch: "Contrato local incompatível: verificar versão, produto, modo e referência de credencial",
                local_contract_ready: "Contrato local compatível; autenticação entre serviços ainda pendente",
              };
              return <article className="product-card" key={item.sourceId ?? item.productId}>
                <strong>{item.productName}</strong>
                <span>{labels[item.state]}</span>
                <small>{item.sourceType ?? "Sem contrato de conector registrado"}</small>
                <small>Versão: {item.mappingVersion ?? "Indisponível"}</small>
                <small>Compatibilidade local: {preflight
                  ? preflightLabels[preflight.status] : "Sem evidência suficiente"}</small>
                <small>Próxima verificação: {preflight &&
                  preflight.status !== "local_contract_ready"
                  ? preflightLabels[preflight.status]
                  : nextActions[item.nextAction]}</small>
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

      <section className="executive-section" aria-labelledby="c08-adapters-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">C08 · Preparação de novos SaaS</span>
            <h2 id="c08-adapters-title">Catálogo de adaptadores</h2>
          </div>
          <p>Adaptador implementado não significa fonte conectada, testes E2E aprovados ou homologação.</p>
        </div>
        <p>Adaptadores disponíveis neste build: {SAAS_ADAPTER_PROFILES.map(profile => profile.title.replace("Conectar ", "")).join(", ")}.</p>
        {activeProducts.filter(product => !profileForProductSlug(product.slug)).length > 0 ? (
          <p role="status">
            SaaS sem adaptador neste build: {activeProducts
              .filter(product => !profileForProductSlug(product.slug))
              .map(product => product.name).join(", ")}. A conexão exige contrato e adaptador aprovados;
            não serão criados endpoints ou credenciais automaticamente.
          </p>
        ) : null}
      </section>
      <SourceControlPanel
        products={activeProducts}
        sources={safeSources}
        supportedAdapters={SAAS_ADAPTER_PROFILES}
        canWrite={roleHasPermission(context.role, "source:write")}
      />
    </main>
  );
}
