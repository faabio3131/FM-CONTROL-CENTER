import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("F10 Executive Command Center contract", () => {
  it("uses governed MetricService and explicitly renders unavailable data", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");
    expect(source).toContain("new MetricService(new PostgresMetricStore())");
    expect(source).toContain("Ausência de fonte é exibida como indisponível");
    expect(source).toContain("Fonte ainda não conectada");
    expect(source).not.toContain("Math.random");
  });

  it("keeps Core query behind the governed API boundary", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/dashboard/core-query-form.tsx"), "utf8");
    expect(source).toContain('fetch("/api/core/query"');
    expect(source).toContain("Provider cognitivo indisponível");
    expect(source).toContain("contrato cognitivo governado");
    expect(source).not.toContain("Core canônico ainda não está conectado neste ambiente");
  });

  it("recovers from transport or invalid-response failures instead of remaining in loading", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/dashboard/core-query-form.tsx"), "utf8");
    expect(source).toContain("try {");
    expect(source).toContain("catch {");
    expect(source).toContain('setState({ status: "error", answer: cognitiveErrorMessage() })');
    expect(source).toContain('typeof payload.answer !== "string"');
  });
});
