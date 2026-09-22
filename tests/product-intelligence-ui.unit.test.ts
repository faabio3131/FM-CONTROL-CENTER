import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("F11 Product Intelligence UI/API contract", () => {
  it("dashboard expõe produtos e comparação sem criar score mágico", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");
    expect(source).toContain("Inteligência por produto");
    expect(source).toContain("Comparação governada");
    expect(source).toContain("ProductCreateForm");
    expect(source).not.toContain("product.performance.score");
  });

  it("visão individual explicita semântica pendente e provenance", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/dashboard/products/[productId]/page.tsx"), "utf8");
    expect(source).toContain("Semântica pendente");
    expect(source).toContain("Sem provenance factual disponível");
    expect(source).toContain("Nenhum score composto é produzido");
  });

  it("API de comparação usa productIds explícitos", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/api/products/compare/route.ts"), "utf8");
    expect(source).toContain('getAll("productId")');
    expect(source).toContain("ProductIntelligenceService");
  });
});
