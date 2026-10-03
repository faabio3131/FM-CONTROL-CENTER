import { describe, expect, it } from "vitest";
import { commandNavigationForRole } from "@/presentation/command-navigation";

describe("FM Command navigation RBAC", () => {
  it("oculta administracao de fontes de viewer/member", () => {
    for (const role of ["viewer", "member"] as const) {
      const items = commandNavigationForRole(role);
      expect(items.some((item) => item.href === "/dashboard/sources")).toBe(false);
      expect(items.some((item) => item.href === "/dashboard/commercial/kordena")).toBe(true);
    }
  });

  it("mantem fontes visivel para owner/admin/analyst", () => {
    for (const role of ["owner", "admin", "analyst"] as const) {
      expect(
        commandNavigationForRole(role).some(
          (item) => item.href === "/dashboard/sources",
        ),
      ).toBe(true);
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
