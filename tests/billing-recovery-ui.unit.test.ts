import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("billing recovery and password UX", () => {
  it("expõe recuperação administrativa sem liberar nova cobrança", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/dashboard/billing/pilot-checkout.tsx"),
      "utf8",
    );
    expect(source).toContain('submit("recover")');
    expect(source).toContain("Recuperar cobrança");
    expect(source).toContain("não cria uma nova cobrança");
    expect(source).toContain('pilot.invoiceStatus!=="pending"');
  });

  it("mantém senha mascarada por padrão e documenta a política 8-128", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/dashboard/billing/pilot-checkout.tsx"),
      "utf8",
    );
    expect(source).toContain('useState(false)');
    expect(source).toContain('aria-label={showPassword?"Ocultar senha":"Mostrar senha"}');
    expect(source).toContain("minLength={8}");
    expect(source).toContain("maxLength={128}");
    expect(source).toContain("8 a 128 caracteres");
  });

  it("fixa a mesma política no backend de autenticação", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/infrastructure/auth/auth.ts"),
      "utf8",
    );
    expect(source).toContain("minPasswordLength: 8");
    expect(source).toContain("maxPasswordLength: 128");
  });
});
