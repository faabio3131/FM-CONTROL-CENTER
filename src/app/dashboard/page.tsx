import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { AuthenticationRequiredError,TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { SignOutButton } from "./sign-out-button";

export default async function DashboardPage(){
  let context;
  try { context=await resolveTenantContext(await headers()); }
  catch(error){ if(error instanceof AuthenticationRequiredError) redirect("/sign-in"); if(error instanceof TenantScopeRequiredError) redirect("/onboarding"); throw error; }

  return (
    <main className="shell">
      <section className="card">
        <span className="eyebrow">Fundação técnica ativa</span>
        <h1>Control Center</h1>
        <p>Tenant autenticado: <code>{context.tenantId}</code></p>
        <div className="grid">
          <article><strong>Identidade</strong><span>Server-side</span></article>
          <article><strong>Tenant isolation</strong><span>Fail-closed</span></article>
          <article><strong>Metric Engine</strong><span>Fase 08</span></article>
          <article><strong>FM Cognitive Core</strong><span>Fase 09</span></article>
        </div>
        <div className="actions">
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
