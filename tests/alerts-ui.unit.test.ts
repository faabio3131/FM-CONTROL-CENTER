import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("F17 alerts UI", () => {
  it("expõe empty state, idempotência e preview sem ação crítica direta", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/dashboard/alerts/page.tsx"), "utf8");
    const control = readFileSync(resolve(process.cwd(), "src/app/dashboard/alerts/alert-control-panel.tsx"), "utf8");
    const archivePage = readFileSync(resolve(process.cwd(), "src/app/dashboard/alerts/rules/[ruleId]/page.tsx"), "utf8");
    const archiveActions = readFileSync(resolve(process.cwd(), "src/app/dashboard/alerts/rules/[ruleId]/archived-rule-actions.tsx"), "utf8");
    expect(page).toContain("Unknown nunca vira zero");
    expect(page).toContain("Fingerprint + lock");
    expect(page).toContain("Preview somente");
    expect(control).toContain("Nenhuma regra operacional");
    expect(control).toContain("Preparar investigação");
    expect(control).toContain("Desativar");
    expect(control).toContain("Arquivar");
    expect(control).toContain("Histórico arquivado");
    expect(control).toContain("Abrir arquivo");
    expect(control).toContain("/dashboard/alerts/rules/");
    expect(archivePage).toContain("Arquivo governado de regra");
    expect(archivePage).toContain("Comparação atual");
    expect(archivePage).toContain("Linha do tempo");
    expect(archivePage).toContain("Ocorrências vinculadas");
    expect(archiveActions).toContain("Criar nova regra baseada nesta");
    expect(control).toContain("Já existe uma regra ativa equivalente.");
    expect(control).toContain("Avaliação concluída: métrica indisponível; nenhum alerta criado.");
    expect(control).toContain("threshold não atingido; nenhum alerta criado.");
    expect(control).not.toContain("/execute");
  });
});
