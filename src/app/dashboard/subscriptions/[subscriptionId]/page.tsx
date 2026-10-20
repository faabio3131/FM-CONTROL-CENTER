import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  BillingSubscriptionTraceService, SubscriptionTraceNotFoundError,
  SubscriptionTraceInputError,
} from "@/application/billing/billing-subscription-trace-service";
import { previewSubscriptionLifecycle } from "@/domain/billing/subscription-lifecycle-policy";
import { assessLifecycleExecutionPrerequisites } from "@/domain/billing/subscription-execution-prerequisites";
import { LifecycleIntentRequestForm } from "./lifecycle-intent-request-form";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { roleHasPermission } from "@/domain/security/permissions";
import {
  AuthenticationRequiredError, TenantScopeRequiredError,
} from "@/domain/security/tenant-context";
import {
  PostgresBillingSubscriptionTraceRepository,
} from "@/infrastructure/billing/postgres-billing-subscription-trace-repository";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {
  pending: "Pendente", active: "Ativa", past_due: "Em atraso",
  suspended: "Suspensa", cancelled: "Cancelada", canceled: "Cancelada",
  received: "Recebido (registro interno)", confirmed: "Confirmado (registro interno)",
  paid: "Pago (registro interno)", refunded: "Estornado (registro interno)",
  overdue: "Vencida", failed: "Falhou",
};
const statusText = (status: string | null) =>
  status === null ? "Sem pagamento registrado" :
    statusLabel[status.toLowerCase()] ?? "Situação não classificada";
const when = (date: Date) => new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
}).format(date);
const amount = (minor: number, currency: string) =>
  Number.isSafeInteger(minor) && currency === "BRL"
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(minor / 100)
    : "Valor indisponível";

export default async function SubscriptionTracePage({
  params,
}: { params: Promise<{ subscriptionId: string }> }) {
  let context;
  try {
    context = await resolveTenantContext(await headers());
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }
  if (!roleHasPermission(context.role, "billing:read")) redirect("/dashboard");
  const { subscriptionId } = await params;
  let trace;
  try {
    trace = await new BillingSubscriptionTraceService(
      new PostgresBillingSubscriptionTraceRepository(),
    ).get(context, subscriptionId);
  } catch (error) {
    if (error instanceof SubscriptionTraceNotFoundError ||
        error instanceof SubscriptionTraceInputError) notFound();
    throw error;
  }

  return (
    <main className="dashboard-shell dashboard-shell-compact">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">C02 · Billing do Command</span>
          <h1>Rastro financeiro da assinatura</h1>
          <p>Somente leitura. Estados internos não constituem confirmação independente de pagamento ou licença.</p>
        </div>
        <Link href="/dashboard/subscriptions">Voltar às assinaturas</Link>
      </header>

      <section className="panel" aria-labelledby="subscription-summary">
        <h2 id="subscription-summary">Identificação e estado registrado</h2>
        <div className="foundation-grid">
          <article><strong>Assinatura</strong><code>{trace.subscription.subscriptionId}</code></article>
          <article><strong>Produto</strong><code>{trace.subscription.productId}</code></article>
          <article><strong>Cliente FMCC</strong><code>{trace.subscription.customerId}</code></article>
          <article><strong>Tenant no SaaS</strong>
            <span>{trace.subscription.externalTenantId ?? "Vínculo indisponível"}</span></article>
          <article><strong>Plano</strong><span>{trace.subscription.planCode}</span></article>
          <article><strong>Estado</strong><span>{statusText(trace.subscription.status)}</span></article>
          <article><strong>Cadastro</strong><span>{when(trace.subscription.createdAt)}</span></article>
        </div>
      </section>

      <section className="panel" aria-labelledby="lifecycle-advisory">
        <h2 id="lifecycle-advisory">Análise contratual — sem execução</h2>
        <p>Esta prévia não autoriza cobrança, cancelamento ou concessão de licença. Cada operação exige verificações financeiras, autorização e confirmação próprias.</p>
        {trace.truncated ? <p role="status">Histórico financeiro incompleto: análise limitada aos registros disponíveis.</p> : null}
        <div className="foundation-grid">
          {previewSubscriptionLifecycle(trace).options.map(option => (
            <article key={option.action}>
              <strong>{option.title}</strong>
              <span>{option.status === "candidate_for_review" ? "Candidata para revisão" : "Não aplicável"}</span>
              <small>{option.reason}</small>
              <p>Exigências antes de executar:</p>
              <ul>{option.prerequisites.map(item => <li key={item}>{item}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      {roleHasPermission(context.role, "billing:write") &&
        (context.role === "owner" || context.role === "admin") ? (
        <section className="panel" aria-labelledby="lifecycle-intent">
          <h2 id="lifecycle-intent">Registrar intenção de mudança contratual</h2>
          <LifecycleIntentRequestForm subscriptionId={trace.subscription.subscriptionId}
            recordedStatus={trace.subscription.status}
            options={previewSubscriptionLifecycle(trace).options}/>
        </section>
      ) : null}

      <section className="panel" aria-labelledby="contract-prerequisites">
        <h2 id="contract-prerequisites">Autoridades pendentes para execução contratual</h2>
        <p>Prévia de regras e fontes. Nenhuma aprovação, cobrança ou licença é executada nesta consulta.</p>
        {previewSubscriptionLifecycle(trace).options
          .filter(option => option.status === "candidate_for_review")
          .map(option => {
            const result = assessLifecycleExecutionPrerequisites(trace, option.action, context.tenantId);
            return <details key={option.action}>
              <summary>{option.title} — {result.blockReasons.length} verificações pendentes</summary>
              <ul>{result.gates.map(gate => (
                <li key={gate.kind}>{gate.label}: {gate.status === "verified_by_authority"
                  ? "Comprovado pela autoridade" : "Aguardando fonte autoritativa"}</li>
              ))}</ul>
              <p>Execução indisponível até política aprovada e executor governado.</p>
            </details>;
          })}
      </section>

      <section className="panel" aria-labelledby="invoice-trace">
        <h2 id="invoice-trace">Faturas e pagamentos registrados</h2>
        <p>Fonte: {trace.authority}. Valores representam faturas emitidas no cadastro interno, não caixa recebido, receita reconhecida ou lucro.</p>
        {trace.truncated ? <p role="status">Exibindo apenas as 50 faturas mais recentes. Histórico incompleto.</p> : null}
        {trace.invoices.length === 0 ? <p>Nenhuma fatura registrada para esta assinatura. Isso não prova ausência de cobrança no provedor.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{[
                "Fatura", "Registrada em (Brasília)", "Valor da fatura",
                "Situação da fatura", "Pagamento vinculado", "Conta de gateway",
              ].map(value => <th key={value} scope="col" style={{ textAlign: "left", padding: "0.75rem" }}>{value}</th>)}</tr></thead>
              <tbody>{trace.invoices.map(row => (
                <tr key={row.invoiceId}>
                  <td style={{ padding: "0.75rem" }}><code>{row.invoiceId}</code></td>
                  <td style={{ padding: "0.75rem" }}>{when(row.createdAt)}</td>
                  <td style={{ padding: "0.75rem" }}>{amount(row.amountMinor, row.currency)}</td>
                  <td style={{ padding: "0.75rem" }}>{statusText(row.invoiceStatus)}</td>
                  <td style={{ padding: "0.75rem" }}>
                    {statusText(row.recordedPaymentStatus)}
                    {row.paymentRecordedAt ? " · " + when(row.paymentRecordedAt) : ""}
                  </td>
                  <td style={{ padding: "0.75rem" }}><code>{row.gatewayAccountId}</code></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="metric-provenance">
          O status de pagamento é o último estado conhecido no banco FMCC. Somente a
          reconciliação autorizada com o provedor pode comprovar liquidação financeira.
          Este painel não concede acesso ao SaaS nem altera assinaturas.
        </p>
      </section>
    </main>
  );
}
