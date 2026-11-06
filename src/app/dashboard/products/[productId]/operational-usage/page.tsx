import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { projectOperationalUsage, quotaView } from "@/application/integration/universal-usage-projection";
import { universalSaasProfileForProduct, sourceMatchesAdapter } from "@/application/integration/saas-adapter-profiles";
import { SourceRegistryService } from "@/application/integration/source-registry-service";
import { ProductNotFoundError, ProductRegistryService } from "@/application/products/product-registry-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { roleHasPermission } from "@/domain/security/permissions";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { db } from "@/infrastructure/db/client";
import { canonicalFacts } from "@/infrastructure/db/platform-schema";
import { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";

export const dynamic = "force-dynamic";
const MAX_ROWS = 80;

function when(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
  }).format(value);
}

export default async function OperationalUsagePage({
  params,
}: { params: Promise<{ productId: string }> }) {
  let context;
  try { context = await resolveTenantContext(await headers()); }
  catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }

  if ((context.role !== "owner" && context.role !== "admin") ||
    !roleHasPermission(context.role, "product:read") ||
    !roleHasPermission(context.role, "source:read") ||
    !roleHasPermission(context.role, "metric:read")) {
    redirect("/dashboard");
  }

  const { productId } = await params;
  const products = new PostgresProductRepository();
  let product;
  try { product = await new ProductRegistryService(products).get(context, productId); }
  catch (error) {
    if (error instanceof ProductNotFoundError) notFound();
    throw error;
  }
  // Defensive scope check even if the product repository is compromised.
  if (product.tenantId !== context.tenantId) notFound();
  const profile = universalSaasProfileForProduct(product.slug);
  const allSources = await new SourceRegistryService(new PostgresSourceRepository(), products).list(context);
  const bound = profile ? allSources.filter(source =>
    source.tenantId === context.tenantId && source.productId === product.id &&
    sourceMatchesAdapter(source, profile)
  ) : [];
  const observations = bound.length ? await db.select({
    id: canonicalFacts.id,
    sourceId: canonicalFacts.sourceId,
    payload: canonicalFacts.payload,
    sourceTimestamp: canonicalFacts.sourceTimestamp,
    ingestedAt: canonicalFacts.ingestedAt,
  }).from(canonicalFacts).where(and(
    eq(canonicalFacts.tenantId, context.tenantId),
    eq(canonicalFacts.productId, product.id),
    eq(canonicalFacts.factType, "saas.usage.snapshot.v1"),
    inArray(canonicalFacts.sourceId, bound.map(source => source.id)),
  )).orderBy(desc(canonicalFacts.ingestedAt), desc(canonicalFacts.id)).limit(MAX_ROWS + 1) : [];

  const rows = observations.slice(0, MAX_ROWS).map(item => ({
    ...item,
    data: projectOperationalUsage(item.payload),
  })).filter(item => item.data !== null);

  return <main className="dashboard-shell">
    <header className="dashboard-header">
      <div>
        <span className="eyebrow">FM Command · Consumo operacional por SaaS</span>
        <h1>{product.name}</h1>
        <p>Leitura direta dos fatos de uso recebidos pelo contrato universal v1.
          Esta tela não calcula faturas, não autoriza emissão e não altera contratos.</p>
      </div>
      <div>
        <Link className="button" href="/dashboard/sources">Gerenciar fontes</Link>
        <Link className="button" href={`/dashboard/products/${product.id}`}>Voltar ao produto</Link>
      </div>
    </header>
    <section className="foundation-grid" aria-label="Estado da integração">
      <article><strong>Contrato</strong><span>FMCC SaaS Usage v1 · somente leitura</span></article>
      <article><strong>Fonte vinculada</strong><span>{bound.length
        ? `${bound.length} fonte(s) registrada(s)` : "Não configurada"}</span></article>
      <article><strong>Fatos disponíveis</strong><span>{observations.length
        ? "Observações locais, não certificação financeira"
        : "Sem evidência registrada"}</span></article>
      <article><strong>Autoridade</strong><span>Consumo reportado pelo SaaS, não pelo gateway</span></article>
    </section>
    {!bound.length ? <section className="panel" role="status">
      <h2>Consumo ainda não conectado</h2>
      <p>Cadastre a fonte universal deste produto em Fontes e Integrações, configure
        o token exclusivo na infraestrutura FM e valide o endpoint autenticado do SaaS.
        Nenhuma medição será inventada antes disso.</p>
    </section> : !rows.length ? <section className="panel" role="status">
      <h2>Sem observações válidas</h2>
      <p>A fonte está cadastrada, mas ainda não existem fatos de uso válidos.
        Verifique a conexão e a primeira sincronização. Desconhecido não significa consumo zero.</p>
    </section> : <>
      <section className="executive-section">
        <div className="section-heading">
          <div><span className="eyebrow">Telemetria SaaS</span><h2>Consumo informado por tenant</h2></div>
          <p>Últimos {rows.length} registros recebidos, ordenados por ingestão.
            Registros históricos podem repetir o mesmo tenant em períodos distintos; não são somados.</p>
        </div>
        <div className="product-grid">
          {rows.map(row => <article className="product-card" key={row.id}>
            <strong>Tenant externo: {row.data!.externalTenantRef}</strong>
            <small>Período: {row.data!.periodStart} → {row.data!.periodEnd}</small>
            <small>Observado: {when(row.sourceTimestamp)} · Ingerido: {when(row.ingestedAt)}</small>
            <small>Fonte interna: {row.sourceId} · Qualidade: reportado, não conciliado financeiramente</small>
            {row.data!.metrics.length ? row.data!.metrics.map(m => {
              const quota = quotaView(m);
              return <div className="fmcc-universal-usage-metric" data-severity={quota.severity} key={m.metricId}>
                <span>{m.metricId} ({m.unit === "tokens" ? "tokens" : "unidades"})</span>
                <strong>{quota.text}</strong>
                {quota.percentage !== null ? <progress
                  max={100} value={Math.min(100,quota.percentage)}
                  aria-label={`${m.metricId}: ${quota.percentage}% da quota informada`}/> : null}
              </div>;
            }) : <p>Nenhuma medição reportada para esta janela.</p>}
          </article>)}
        </div>
        {observations.length > MAX_ROWS ? <p role="status">
          Existem observações anteriores não exibidas neste recorte. Não inferir
          quantidade total, cobrança ou consumo agregado a partir desta página.
        </p> : null}
      </section>
    </>}
  </main>;
}
