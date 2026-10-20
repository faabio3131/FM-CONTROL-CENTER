import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  BillingQueueInspectionService, type BillingQueueOverview,
} from "@/application/billing/billing-queue-inspection-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { roleHasPermission } from "@/domain/security/permissions";
import {
  AuthenticationRequiredError, TenantScopeRequiredError,
} from "@/domain/security/tenant-context";
import {
  PostgresBillingQueueInspectionRepository,
} from "@/infrastructure/billing/postgres-billing-queue-inspection-repository";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  received: "Recebido", pending: "Pendente", processing: "Em processamento",
  retry: "Aguardando nova tentativa", delivered: "Entregue", processed: "Processado",
  blocked: "Bloqueado", failed: "Falhou", error: "Erro",
};
const label = (value: string) => statusLabels[value.toLowerCase()] ?? "Estado não classificado";
const when = (date: Date) => new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
}).format(date);

export default async function BillingOperationsPage() {
  let context;
  try {
    context = await resolveTenantContext(await headers());
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }
  if (!roleHasPermission(context.role, "billing:read")) redirect("/dashboard");
  let overview: BillingQueueOverview | null = null;
  try {
    overview = await new BillingQueueInspectionService(
      new PostgresBillingQueueInspectionRepository(),
    ).overview(context);
  } catch {
    // An unreachable DB or failed query is not a zero-size queue.
  }

  return <main className="dashboard-shell dashboard-shell-compact">
    <header className="dashboard-header">
      <div>
        <span className="eyebrow">C03/C04 · Billing e entrega de licenças</span>
        <h1>Filas financeiras e operacionais</h1>
        <p>Visualização limitada das filas canônicas, sem executar cobranças, reprocessamentos ou alterações de licença.</p>
      </div>
      {roleHasPermission(context.role, "billing:write") &&
        (context.role === "owner" || context.role === "admin") ? (
        <Link href="/dashboard/billing/lifecycle-reviews">Revisão de assinaturas</Link>
      ) : null}
      <Link href="/dashboard/operations">Voltar às operações</Link>
    </header>
    {overview === null ? (
      <section className="panel" role="alert">
        <h2>Dados operacionais indisponíveis</h2>
        <p>Não foi possível consultar o banco de billing. Isso não significa filas vazias ou saudáveis.</p>
      </section>
    ) : <>
      <section className="panel">
        <h2>Eventos recebidos das contas de gateway</h2>
        <p>Fonte: {overview.sourceAuthority}. Eventos recebidos ou processados não comprovam pagamento liquidado. A atribuição ao produto requer o contrato financeiro canônico.</p>
        {overview.eventsTruncated ? <p role="status">Amostra incompleta: apenas os 40 registros mais recentemente atualizados.</p> : null}
        {overview.events.length === 0 ? <p>Não há eventos registrados no FMCC neste escopo. Não é prova de ausência de eventos externos.</p> : (
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Conta de gateway", "Tipo", "Situação", "Tentativas", "Código de erro", "Recebido em (Brasília)"].map(v =>
              <th key={v} scope="col" style={{ padding: "0.75rem", textAlign: "left" }}>{v}</th>)}</tr></thead>
            <tbody>{overview.events.map(row => <tr key={row.id}>
              <td style={{ padding: "0.75rem" }}><code>{row.gatewayAccountId}</code></td>
              <td style={{ padding: "0.75rem" }}>{row.eventType ?? "Não classificado"}</td>
              <td style={{ padding: "0.75rem" }}>{label(row.status)}</td>
              <td style={{ padding: "0.75rem" }}>{row.attempts}</td>
              <td style={{ padding: "0.75rem" }}>{row.lastErrorCode ?? "Não registrado"}</td>
              <td style={{ padding: "0.75rem" }}>{when(row.receivedAt)}</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>
      <section className="panel">
        <h2>Fila de entrega de licenças IRON</h2>
        <p>O outbox registra tentativas e confirmações de entrega. Estado entregue não garante que o SaaS esteja operacional ou que o pagamento esteja conciliado.</p>
        {overview.outboxTruncated ? <p role="status">Amostra incompleta: apenas os 40 registros mais recentemente atualizados.</p> : null}
        {overview.outbox.length === 0 ? <p>Não há entregas IRON registradas nesta base. Nenhum sucesso é presumido.</p> : (
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Produto", "Ação de licença", "Situação", "Tentativas", "Código de erro", "Atualizado em (Brasília)"].map(v =>
              <th key={v} scope="col" style={{ padding: "0.75rem", textAlign: "left" }}>{v}</th>)}</tr></thead>
            <tbody>{overview.outbox.map(row => <tr key={row.id}>
              <td style={{ padding: "0.75rem" }}><code>{row.productId}</code></td>
              <td style={{ padding: "0.75rem" }}>{row.eventType}</td>
              <td style={{ padding: "0.75rem" }}>{label(row.status)}</td>
              <td style={{ padding: "0.75rem" }}>{row.attempts}</td>
              <td style={{ padding: "0.75rem" }}>{row.lastErrorCode ?? "Não registrado"}</td>
              <td style={{ padding: "0.75rem" }}>{when(row.updatedAt)}</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>
      <p className="metric-provenance">
        Estes registros representam páginas limitadas, não totais globais nem disponibilidade do gateway.
        Nenhuma ação de reprocessamento, conciliação ou licenciamento está disponível nesta tela.
      </p>
    </>}
  </main>;
}
