import { describe, expect, it } from "vitest";
import { commandNavigationForRole } from "@/presentation/command-navigation";

describe("FM Command navigation RBAC", () => {
  it("expõe os módulos executivos comuns para todos os papéis com metric:read", () => {
    for (const role of ["owner", "admin", "analyst", "viewer", "member"] as const) {
      const items = commandNavigationForRole(role);
      const hrefs = items.map((item) => item.href);
      expect(hrefs).toContain("/dashboard/trials");
      expect(hrefs).toContain("/dashboard/subscriptions");
      expect(hrefs).toContain("/dashboard/settings");
      expect(hrefs).toContain("/dashboard/commercial/kordena");
    }
  });

  it("oculta administração de fontes de viewer/member", () => {
    for (const role of ["viewer", "member"] as const) {
      const items = commandNavigationForRole(role);
      expect(items.some((item) => item.href === "/dashboard/sources")).toBe(false);
      expect(items.some((item) => item.href === "/dashboard/commercial/kordena")).toBe(true);
    }
  });

  it("mantém fontes visível para owner/admin/analyst", () => {
    for (const role of ["owner", "admin", "analyst"] as const) {
      expect(
        commandNavigationForRole(role).some(
          (item) => item.href === "/dashboard/sources",
        ),
      ).toBe(true);
    }
  });

  it("deriva cada item de uma permissão canônica", () => {
    for (const role of ["owner", "admin", "analyst", "viewer", "member"] as const) {
      const items = commandNavigationForRole(role);
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => Boolean(item.permission))).toBe(true);
    }
  });
});
