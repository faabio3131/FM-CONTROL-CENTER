import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BillingCustomerBindingRegisterService, type BillingCustomerBindingRegister } from "@/application/billing/billing-customer-binding-register-service";
import { ProductRegistryService } from "@/application/products/product-registry-service";
import { roleHasPermission } from "@/domain/security/permissions";
import { PostgresBillingCustomerBindingRegisterRepository } from "@/infrastructure/billing/postgres-billing-customer-binding-register-repository";
import { CustomerIntelligenceService } from "@/application/customer/customer-intelligence-service";
import { MetricService } from "@/application/metrics/metric-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresMetricStore } from "@/infrastructure/metrics/postgres-metric-store";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  let context;
  try { context = await resolveTenantContext(await headers()); }
  catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }

  const overview = await new CustomerIntelligenceService(
    new MetricService(new PostgresMetricStore()),
    new PostgresProductRepository(),
  ).overview(context);


  const canReadBilling = roleHasPermission(context.role, "billing:read");
  const products = canReadBilling
    ? await new ProductRegistryService(new PostgresProductRepository()).list(context)
    : [];
  const requestedProductId = (await searchParams).productId?.trim();
  const selectedProduct = requestedProductId
    ? products.find(product => product.id === requestedProductId)
    : undefined;
  if (requestedProductId && !selectedProduct) redirect("/dashboard/customers");

  // Absent DB is not zero. No binding data is disclosed to non-billing roles.
  let register: BillingCustomerBindingRegister | null = null;
  if (canReadBilling) {
    try {
      register = await new BillingCustomerBindingRegisterService(
        new PostgresBillingCustomerBindingRegisterRepository(),
      ).list(context, selectedProduct?.id);
    } catch {
      register = null;
    }
  }

  return (
    <main className="dashboard-shell dashboard-shell-compact customers-compact">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">F15 · Clientes, Uso e Suporte</span>
          <h1>Inteligência de uso e suporte</h1>
          <p>A superfície usa somente agregados governados. Nenhum score de risco ou experiência é inventado.</p>
        </div>
        <Link href="/dashboard">Voltar</Link>
      </header>

      <section className="metric-grid">
        {overview.metrics.map(({ target, status, value }) => (
          <article className="metric-card" key={target.metricId}>
            <span className="metric-label">{target.displayName}</span>
            <strong>{status === "pending_semantics" ? "Semântica pendente" : value?.value ?? "Indisponível"}</strong>
            <small>{value ? `Fonte: ${value.sourceAuthority}` : status === "pending_semantics" ? "Regra ainda não aprovada" : "Fonte ainda não conectada"}</small>
          </article>
        ))}
      </section>


      <section className="panel" aria-labelledby="customer-bindings-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">C02 · Billing FMCC</span>
            <h2 id="customer-bindings-title">Clientes vinculados aos produtos</h2>
          </div>
          <p>Vínculos existentes no cadastro financeiro do Command, sem duplicar o cadastro de clientes de cada SaaS.</p>
        </div>
        {!canReadBilling ? <p role="status">Consulta reservada a usuários com permissão financeira.</p> : (
          <>
            <form action="/dashboard/customers" method="get" className="command-quick-actions">
              <label htmlFor="customers-billing-product">Produto</label>
              <select id="customers-billing-product" name="productId" defaultValue={selectedProduct?.id ?? ""}>
                <option value="">Todos os produtos autorizados</option>
                {products.map(product =>
                  <option value={product.id} key={product.id}>{product.name}</option>)}
              </select>
              <button className="button" type="submit">Aplicar escopo</button>
            </form>
            {register === null ? (
              <p role="alert">Cadastro de vínculos indisponível. Isso não significa ausência de clientes.</p>
            ) : register.items.length === 0 ? (
              <p>Nenhum vínculo local encontrado neste escopo. Isso não comprova ausência de clientes no SaaS.</p>
            ) : (
              <>
                {register.truncated ? (
                  <p role="status">Exibindo apenas os 100 vínculos mais recentes, não o cadastro completo.</p>
                ) : null}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <caption className="metric-provenance" style={{ textAlign: "left" }}>
                      Autoridade: fmcc_billing_customer_binding · consulta somente leitura.
                    </caption>
                    <thead><tr>
                      {["Cliente FMCC", "Identificador externo", "Produto", "Tenant no SaaS", "Vínculo registrado em (Brasília)"].map(label =>
                        <th key={label} scope="col" style={{ textAlign: "left", padding: "0.75rem" }}>{label}</th>)}
                    </tr></thead>
                    <tbody>{register.items.map(row => (
                      <tr key={row.productId + ":" + row.customerId}>
                        <td style={{ padding: "0.75rem" }}><code>{row.customerId}</code></td>
                        <td style={{ padding: "0.75rem" }}><code>{row.externalCustomerId}</code></td>
                        <td style={{ padding: "0.75rem" }}>
                          {products.find(product => product.id === row.productId)?.name ?? row.productId}
                        </td>
                        <td style={{ padding: "0.75rem" }}><code>{row.externalTenantId}</code></td>
                        <td style={{ padding: "0.75rem" }}>
                          {new Intl.DateTimeFormat("pt-BR", {
                            dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
                          }).format(row.createdAt)}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <h2>Sinais factuais disponíveis</h2>
        {overview.factualSignals.length ? (
          <ul>
            {overview.factualSignals.map((signal) => (
              <li key={signal.metricId}><strong>{signal.displayName}:</strong> {signal.value ?? "Indisponível"}</li>
            ))}
          </ul>
        ) : <p>Nenhum sinal factual disponível nas fontes autorizadas.</p>}
      </section>

      <section className="panel">
        <h2>Risco e adoção</h2>
        <p>{overview.customerRisk.reason}</p>
        <p>{overview.adoption.reason}</p>
        <p>{overview.privacy.note}</p>
      </section>
    </main>
  );
}
