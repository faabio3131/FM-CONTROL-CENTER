import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Command governance NFCore: audit terminal and deterministic vs AI", () => {
  it("renders log only from permission-gated existing activity feed", () => {
    const home=read("src/app/dashboard/page.tsx");
    expect(home).toContain('roleHasPermission(context.role, "audit:read")');
    expect(home).toContain('{activityFeed ? (');
    expect(home).toContain('className="panel nfcore-ops-audit-console"');
    expect(home).toContain('{event.actorRef ?? "não informado"}');
    expect(home).toContain('{context.tenantId}');
    expect(home).toContain('{event.action ?? event.eventType}');
    expect(home).toContain('{event.result ?? "não informado"}');
    expect(home).toContain("Nenhum evento auditável disponível no escopo autorizado.");
  });
  it("distinguishes advisory output from authorized deterministic actions", () => {
    const core=read("src/app/dashboard/core-query-form.tsx");
    expect(core).toContain("Recomendação IA · análise, sem execução");
    expect(core).toContain("Autoridade Determinística · ações somente em fluxos autenticados");
    expect(core).not.toContain("Acionar Kill Switch");
    const css=read("src/app/globals.css");
    expect(css).toContain(".nfcore-ops-audit-log");
    expect(css).toContain("#020817");
    expect(css).toContain("rgba(6,17,43,.94)");
  });
});
