import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("F18 premium UX/UI", () => {
  it("possui design system responsivo, foco visível e reduced motion", () => {
    const css = source("src/app/globals.css");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media(max-width:980px)");
    expect(css).toContain("@media(max-width:720px)");
    expect(css).toContain("@media(max-width:520px)");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain("--surface-strong");
    expect(css).toContain("--focus:");
  });

  it("mostra resumo executivo factual sem score sintético", () => {
    const dashboard = source("src/app/dashboard/page.tsx");
    expect(dashboard).toContain('className="command-overview"');
    expect(dashboard).toContain("Exigem atenção");
    expect(dashboard).toContain("Cobertura factual");
    expect(dashboard).toContain("Produtos ativos");
    expect(dashboard).toContain("alertOverview.occurrences.filter");
    expect(dashboard).not.toMatch(/health\s*score/i);
    expect(dashboard).not.toContain("Math.random");
  });

  it("oferece atalhos governados e evidência acessível no Core", () => {
    const core = source("src/app/dashboard/core-query-form.tsx");
    expect(core).toContain("O que precisa da minha atenção?");
    expect(core).toContain("Explique as principais variações da empresa.");
    expect(core).toContain("Quais são os principais riscos?");
    expect(core).toContain('className="core-evidence"');
    expect(core).toContain('aria-live="polite"');
    expect(core).toContain('type="button"');
  });

  it("remove marcador histórico de fase da entrada comercial", () => {
    const home = source("src/app/page.tsx");
    expect(home).toContain("Preview governado");
    expect(home).not.toContain("Fase 06");
  });

  it("não renderiza escapes literais no grid executivo", () => {
    const dashboard = source("src/app/dashboard/page.tsx");
    expect(dashboard).not.toContain('\\n        <Link href="/dashboard/');
  });

  it("mantém alertas com preview e sem botão de execução crítica", () => {
    const alerts = source("src/app/dashboard/alerts/alert-control-panel.tsx");
    expect(alerts).toContain("Preparar investigação");
    expect(alerts).not.toContain("/execute");
  });

  it("aplica o visual premium aprovado no shell global e no FM Command Core", () => {
    const shell = source("src/app/dashboard/command-shell.tsx");
    const layout = source("src/app/dashboard/layout.tsx");
    const core = source("src/app/dashboard/core-query-form.tsx");
    const css = source("src/app/globals.css");

    expect(layout).toContain("<CommandShell>{children}</CommandShell>");
    expect(shell).toContain("FM Tecnologia");
    expect(shell).toContain("COMMAND");
    expect(shell).toContain("Visão Geral");
    expect(shell).toContain("Financeiro");
    expect(shell).toContain("Comercial");
    expect(shell).toContain("Operações");
    expect(shell).toContain("Incidentes");
    expect(shell).toContain("Core");
    expect(core).toContain("FM COMMAND CORE");
    expect(core).toContain("Core IA");
    expect(core).toContain("Dados em tempo real");
    expect(css).toContain("--command-blue:#1f7aff");
    expect(css).toContain("--command-cyan:#00d9ff");
    expect(css).toContain("--command-violet:#8b5cf6");
    expect(css).toContain(".command-sidebar");
    expect(css).toContain(".command-topbar");
    expect(css).toContain(".core-orb");
  });
});
