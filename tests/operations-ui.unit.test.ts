import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("F14 operations UI", () => {
  it("não apresenta uptime artificial e usa a autoridade operacional governada", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/dashboard/operations/page.tsx"),
      "utf8",
    );
    expect(source).toContain("Health pontual não é uptime");
    expect(source).toContain("Disponibilidade só aparece");
    expect(source).toContain("OperationalHealthService");
    expect(source).toContain("PostgresOperationalHealthRepository");
    expect(source).toContain("Status dos Serviços");
    expect(source).toContain("Stale é tratado como desconhecido");
    expect(source).toContain("Nenhum serviço monitorado.");
    expect(source).toContain("PostgresSourceRepository");
    expect(source).toContain("healthCards.map");
    expect(source).toContain('aria-controls="operations-detail"');
    expect(source).toContain('id="operations-detail"');
    expect(source).toContain('href="/dashboard/operations"');
    expect(source).toContain("Fechar ×");
    expect(source).toContain("selectedServices.map");
    expect(source).toContain("sources.map");
    expect(source).toContain("Status persistido");
    expect(source).toContain("overview.metrics.map");
    expect(source).toContain("/dashboard/activity?category=operations");
    expect(source).toContain("roleHasPermission");
    expect(source).not.toContain('<article className="metric-card">');
    expect(source).not.toContain("99.9%");
    expect(source).not.toContain("Math.random");
  });
});
