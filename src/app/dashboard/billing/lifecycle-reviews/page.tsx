import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  SubscriptionLifecycleReviewService, type LifecycleReviewRegister,
} from "@/application/billing/subscription-lifecycle-review-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { roleHasPermission } from "@/domain/security/permissions";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { PostgresSubscriptionLifecycleReviewRepository } from "@/infrastructure/billing/postgres-subscription-lifecycle-review-repository";
import { LifecycleRejectForm } from "./lifecycle-reject-form";

export const dynamic = "force-dynamic";
const when = (date: Date) => new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
}).format(date);
const actions: Record<string, string> = {
  cancel: "Cancelamento", suspend: "Suspensão", reactivate: "Reativação",
  renew: "Renovação", migrate_plan: "Troca de plano", convert_trial: "Conversão de teste",
};

export default async function LifecycleReviewPage() {
  let context;
  try {
    context = await resolveTenantContext(await headers());
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }
  if (!roleHasPermission(context.role, "billing:write") ||
      (context.role !== "owner" && context.role !== "admin")) redirect("/dashboard");
  let data: LifecycleReviewRegister | null = null;
  try {
    data = await new SubscriptionLifecycleReviewService(
      new PostgresSubscriptionLifecycleReviewRepository(),
    ).list(context);
  } catch {
    // Database unavailable is not an empty review queue.
  }
  return <main className="dashboard-shell dashboard-shell-compact">
    <header className="dashboard-header">
      <div>
        <span className="eyebrow">C06 · Decisões contratuais governadas</span>
        <h1>Solicitações para revisão</h1>
        <p>Consulta de solicitações auditadas. Esta lista não aprova nem executa cancelamento, renovação ou cobrança.</p>
      </div>
      <Link href="/dashboard/billing/operations">Voltar às operações</Link>
    </header>
    {data === null ? (
      <section className="panel" role="alert">
        <h2>Fila de revisão indisponível</h2>
        <p>Não foi possível consultar a auditoria. Não considere a fila vazia.</p>
      </section>
    ) : <>
      {data.truncated ? <p role="status">Amostra limitada aos 50 pedidos recentes. Existem registros adicionais.</p> : null}
      {data.items.length === 0 ? <section className="panel">
        <p>Nenhuma solicitação registrada neste tenant do FMCC.</p>
      </section> : data.items.map(item => (
        <section key={item.intentId} className="panel">
          <h2>{actions[item.action] ?? "Operação não classificada"}</h2>
          <p><strong>Estado:</strong> {item.state === "review_rejected"
            ? "Recusada e registrada na auditoria" : "Aguardando política e decisão"}</p>
          <p><strong>Assinatura:</strong> <code>{item.subscriptionId}</code></p>
          <p><strong>Produto:</strong> <code>{item.productId}</code></p>
          <p><strong>Solicitado em:</strong> {when(item.requestedAt)} (Brasília)</p>
          <p><strong>Identificador da solicitação:</strong> <code>{item.intentId}</code></p>
          <Link href={"/dashboard/subscriptions/" + encodeURIComponent(item.subscriptionId)}>
            Consultar assinatura e faturas
          </Link>
          {item.state === "awaiting_policy" ?
            <LifecycleRejectForm intentId={item.intentId}/> :
            <p>Este pedido foi encerrado administrativamente. Não há execução financeira associada.</p>}
        </section>
      ))}
      <p className="metric-provenance">
        Fonte: {data.sourceAuthority}. Recusa não cancela contrato; revisão pendente não confere autorização.
        O sistema não inclui comando de aprovação financeira nesta tela.
      </p>
    </>}
  </main>;
}
