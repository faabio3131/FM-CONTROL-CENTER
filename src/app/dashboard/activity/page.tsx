import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildActivityFeedService } from "@/application/activity/activity-feed-composition";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { roleHasPermission } from "@/domain/security/permissions";
import {
  AuthenticationRequiredError,
  TenantScopeRequiredError,
} from "@/domain/security/tenant-context";

function resultLabel(result: string): string {
  if (result === "success") return "Sucesso";
  if (result === "failure") return "Falha";
  if (result === "allowed" || result === "authorized") return "Autorizado";
  if (result === "denied") return "Negado";
  if (result === "ignored") return "Ignorado";
  if (result === "retryable") return "Nova tentativa prevista";
  return result;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export default async function ActivityPage() {
  let context;
  try {
    context = await resolveTenantContext(await headers());
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }

  if (!roleHasPermission(context.role, "audit:read")) {
    redirect("/dashboard");
  }

  const feed = await buildActivityFeedService().recent(context, 100);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">R8 · Activity Feed governado</span>
          <h1>Atividades recentes</h1>
          <p>
            Projeção cronológica do Registro de Auditoria da organização ativa.
            Nenhum metadata bruto é exposto.
          </p>
        </div>
        <Link className="button" href="/dashboard">
          Voltar à Visão Geral
        </Link>
      </header>

      <section className="panel">
        <h2>Fronteira do feed</h2>
        <p>{feed.dataBoundary}</p>
        <p>{feed.windowNote}</p>
      </section>

      <section className="executive-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Audit Ledger</span>
            <h2>Timeline tenant-scoped</h2>
          </div>
          <p>
            Ação e resultado são apresentados como registrados. O Command não
            converte eventos técnicos em fatos comerciais adicionais.
          </p>
        </div>

        <div className="product-grid">
          {feed.items.length ? (
            feed.items.map((item) => (
              <article className="product-card" key={item.id}>
                <span className="eyebrow">
                  {resultLabel(item.result)} · {dateLabel(item.occurredAt)}
                </span>
                <strong>
                  <code>{item.action}</code>
                </strong>
                <small>
                  Recurso: <code>{item.resourceType}</code>
                  {item.resourceId ? (
                    <>
                      {" "}· <code>{item.resourceId}</code>
                    </>
                  ) : null}
                </small>
                <small>
                  Ator: {item.actorType} · <code>{item.actorId}</code>
                </small>
                <small>
                  Correlação: <code>{item.correlationId}</code>
                </small>
              </article>
            ))
          ) : (
            <article className="product-card">
              <strong>Nenhuma atividade auditável encontrada.</strong>
              <small>
                Ausência de eventos não é convertida em garantia de inatividade.
              </small>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}
