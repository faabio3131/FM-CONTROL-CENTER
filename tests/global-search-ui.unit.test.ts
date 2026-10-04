import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("R9 Global Search UI/API contract", () => {
  it("resolve tenant server-side e lê somente query/limit da URL", () => {
    const api = source("src/app/api/search/route.ts");
    expect(api).toContain("resolveTenantContext(await headers())");
    expect(api).toContain('url.searchParams.get("q")');
    expect(api).not.toContain("x-tenant-id");
    expect(api).not.toContain("tenantId?:");
  });

  it("declara a fronteira de dados e não promete busca de PII/segredos", () => {
    const page = source("src/app/dashboard/search/page.tsx");
    expect(page).toContain("tenant-scoped");
    expect(page).toContain("permission-aware");
    expect(page).toContain("não");
    expect(page).toContain("segredos");
    expect(page).toContain("metadata bruto");
    expect(page).toContain("PII");
  });

  it("possui formulário GET funcional e rota própria no menu", () => {
    const page = source("src/app/dashboard/search/page.tsx");
    const navigation = source("src/domain/navigation/command-navigation.ts");

    expect(page).toContain('action="/dashboard/search"');
    expect(page).toContain('name="q"');
    expect(page).toContain('type="search"');
    expect(navigation).toContain('href: "/dashboard/search"');
    expect(navigation).toContain('permission: "search:use"');
  });
});
