import { describe, expect, it } from "vitest";
import { commandNavigationForRole } from "@/presentation/command-navigation";

describe("FM Command navigation RBAC", () => {
  it("expõe a navegação executiva aprovada sem perder o gate por permissão", () => {
    for (const role of ["owner", "admin", "analyst", "viewer", "member"] as const) {
      const items = commandNavigationForRole(role);
      const labels = items.map((item) => item.label);
      expect(labels).toContain("Visão Geral");
      expect(labels).toContain("Financeiro");
      expect(labels).toContain("Comercial");
      expect(labels).toContain("Trials");
      expect(labels).toContain("Assinaturas");
      expect(labels).toContain("Operações");
      expect(labels).toContain("Incidentes");
      expect(labels).toContain("Core");
      expect(labels).toContain("Configurações");
      expect(labels).not.toContain("Fontes e Integrações");
      expect(labels).not.toContain("Kordena");
    }
  });

  it("deriva cada item de uma permissao canonica", () => {
    for (const role of ["owner", "admin", "analyst", "viewer", "member"] as const) {
      const items = commandNavigationForRole(role);
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => Boolean(item.permission))).toBe(true);
    }
  });
});
