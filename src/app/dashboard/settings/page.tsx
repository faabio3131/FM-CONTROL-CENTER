import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { roleHasPermission } from "@/domain/security/permissions";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { rotuloPapelFmcc } from "@/presentation/pt-br";

export default async function SettingsPage() {
  let context;
  try { context = await resolveTenantContext(await headers()); }
  catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }
  const canReadSources = roleHasPermission(context.role, "source:read");
  const canManageTenant = roleHasPermission(context.role, "tenant:manage");
  const canManageMembers = roleHasPermission(context.role, "member:manage");
  const canReadCommercial = roleHasPermission(context.role, "commercial:read");

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div><span className="eyebrow">Configurações</span><h1>Governança do FM Command</h1>
          <p>Organização, permissões, produtos, integrações e capacidades preservando as autoridades canônicas.</p></div>
        <Link href="/dashboard">Voltar</Link>
      </header>
      <section className="foundation-grid" aria-label="Configurações disponíveis">
        <article><strong>Organização</strong><span>{canManageTenant ? "Administração autorizada" : "Somente contexto autorizado"}</span></article>
        <article><strong>Usuários e papéis</strong><span>{canManageMembers ? "Gestão autorizada" : "Sem permissão administrativa"}</span></article>
        <article><strong>Produtos</strong><span>Registry canônico por organização</span></article>
        <article><strong>Segurança</strong><span>Autorização e tenant validados no servidor</span></article>
      </section>
      <section className="command-quick-actions">
        <div className="foundation-grid command-action-grid">
          <Link href="/dashboard#product-intelligence-title"><strong>Produtos</strong><span>Administrar portfólio conforme permissão</span></Link>
          {canReadSources ? <Link href="/dashboard/sources"><strong>Fontes e integrações</strong><span>Conectividade, health e sincronização</span></Link> : null}
          {canReadCommercial ? <Link href="/dashboard/commercial/kordena"><strong>Kordena</strong><span>Plano de controle comercial governado</span></Link> : null}
          <Link href="/dashboard/alerts"><strong>Alertas</strong><span>Regras, ocorrências e ações governadas</span></Link>
          <Link href="/dashboard/intelligence"><strong>Core</strong><span>Inteligência executiva e proveniência</span></Link>
          <Link href="/dashboard/customers"><strong>Clientes e suporte</strong><span>Uso, engajamento e atendimento</span></Link>
        </div>
      </section>
      <section className="panel"><h2>Escopo ativo</h2>
        <p>Papel atual: <strong>{rotuloPapelFmcc(context.role)}</strong>. O identificador técnico da organização permanece disponível apenas para diagnóstico autorizado.</p>
      </section>
    </main>
  );
}
