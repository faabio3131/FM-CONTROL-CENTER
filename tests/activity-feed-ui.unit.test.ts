import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("R8 Activity Feed UI/API contract", () => {
  it("não seleciona metadata bruto no repositório do feed", () => {
    const repository = source(
      "src/infrastructure/activity/postgres-activity-repository.ts",
    );
    expect(repository).not.toContain("auditEvents.metadata");
    expect(repository).toContain("eq(auditEvents.tenantId, tenantId)");
    expect(repository).toContain("orderBy(desc(auditEvents.occurredAt))");
  });

  it("resolve tenant server-side e valida limite na API", () => {
    const api = source("src/app/api/activity/route.ts");
    expect(api).toContain("resolveTenantContext(await headers())");
    expect(api).toContain("activity.limit_invalid");
    expect(api).not.toContain("x-tenant-id");
    expect(api).not.toContain("tenantId?:");
  });

  it("liga navegação e visão geral ao feed somente via audit:read", () => {
    const navigation = source("src/presentation/command-navigation.ts");
    const dashboard = source("src/app/dashboard/page.tsx");
    expect(navigation).toContain('href: "/dashboard/activity"');
    expect(navigation).toContain('permission: "audit:read"');
    expect(dashboard).toContain(
      'roleHasPermission(context.role, "audit:read")',
    );
    expect(dashboard).toContain("Atividades recentes");
    expect(dashboard).toContain("/dashboard/activity");
  });

  it("declara na página que evento técnico não vira fato comercial adicional", () => {
    const page = source("src/app/dashboard/activity/page.tsx");
    expect(page).toContain("Nenhum metadata bruto é exposto");
    expect(page).toContain(
      "converte eventos técnicos em fatos comerciais adicionais",
    );
  });
});
