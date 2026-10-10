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

  it("mostra readiness da credencial e resultado da recuperação no próprio bloco", () => {
    const ui = readFileSync(
      resolve(process.cwd(), "src/app/dashboard/billing/pilot-checkout.tsx"),
      "utf8",
    );
    const route = readFileSync(
      resolve(process.cwd(), "src/app/api/billing/checkout/pilot/route.ts"),
      "utf8",
    );
    expect(route).toContain("providerCredentialConfigured");
    expect(route).toContain("FMCC_ASAAS_PRODUCTION_API_KEY");
    expect(ui).toContain("Credencial Asaas:");
    expect(ui).toContain("Não configurada");
    expect(ui).toContain("Diagnóstico:");
    expect(ui).toContain("billing.asaas_authentication_failed");
    expect(ui).toContain("billing.provider_payment_not_found_manual_review");
  });

  it("mantém logs de recuperação sanitizados e sem material secreto", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/api/billing/checkout/pilot/recover/route.ts"),
      "utf8",
    );
    expect(source).toContain("billing_pilot_recovery_started");
    expect(source).toContain("billing_pilot_recovery_failed");
    expect(source).toContain("billing_pilot_recovery_succeeded");
    expect(source).not.toContain("FMCC_ASAAS_PRODUCTION_API_KEY");
    expect(source).not.toContain("access_token");
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
