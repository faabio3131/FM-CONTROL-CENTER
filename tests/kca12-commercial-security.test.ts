import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { roleHasPermission } from "@/domain/security/permissions";

describe("KCA-12 commercial control security contract", () => {
  it("permite escrita comercial somente para owner/admin", () => {
    expect(roleHasPermission("owner", "commercial:write")).toBe(true);
    expect(roleHasPermission("admin", "commercial:write")).toBe(true);
    expect(roleHasPermission("analyst", "commercial:write")).toBe(false);
    expect(roleHasPermission("viewer", "commercial:write")).toBe(false);
    expect(roleHasPermission("member", "commercial:write")).toBe(false);
  });

  it("mantém leitura comercial disponível sem conceder mutação", () => {
    expect(roleHasPermission("analyst", "commercial:read")).toBe(true);
    expect(roleHasPermission("viewer", "commercial:read")).toBe(true);
  });

  it("exige password step-up antes de encaminhar comando ao Kordena", () => {
    const route = readFileSync(
      new URL(
        "../src/app/api/integrations/kordena-commercial/commands/route.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const stepUp = readFileSync(
      new URL(
        "../src/application/security/password-step-up.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(route).toContain("verifyPasswordStepUp");
    expect(route).toContain("commercial:write");
    expect(route).toContain("recordAuditEvent");
    expect(stepUp).toContain("auth.api.signInEmail");
    expect(stepUp).toContain("current.user.id");
  });
});
