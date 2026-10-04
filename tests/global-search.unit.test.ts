import { describe, expect, it } from "vitest";
import { GlobalSearchService } from "@/application/search/global-search-service";
import { GlobalSearchQueryError } from "@/domain/search/contracts";
import type { TenantContext } from "@/domain/security/tenant-context";

const owner: TenantContext = {
  tenantId: "tenant-a",
  userId: "owner-a",
  role: "owner",
  correlationId: "corr-a",
};

function buildService(options?: { sourceCounter?: { value: number } }) {
  return new GlobalSearchService(
    {
      async list() {
        return [
          {
            id: "product-kordena",
            tenantId: "tenant-a",
            slug: "kordena",
            name: "Kordena",
            status: "active" as const,
          },
          {
            id: "product-cross-tenant",
            tenantId: "tenant-b",
            slug: "secret-product",
            name: "Produto de outro tenant",
            status: "active" as const,
          },
        ];
      },
    },
    {
      async list() {
        if (options?.sourceCounter) options.sourceCounter.value += 1;
        return [
          {
            id: "source-kordena",
            tenantId: "tenant-a",
            productId: "product-kordena",
            name: "Kordena Commercial",
            sourceType: "kordena-commercial",
            authoritativeDomain: "commercial",
            status: "healthy" as const,
            syncMode: "pull" as const,
            secretRef: "env:SEARCH_MUST_NOT_EXPOSE_ME",
            config: {
              apiKey: "api-secret-must-not-be-searchable",
              baseUrl: "https://private.example.test",
            },
            mappingVersion: "v1",
          },
          {
            id: "source-cross-tenant",
            tenantId: "tenant-b",
            name: "Fonte secreta de outro tenant",
            sourceType: "secret",
            authoritativeDomain: "other",
            status: "healthy" as const,
            syncMode: "pull" as const,
            config: {},
            mappingVersion: "v1",
          },
        ];
      },
    },
    {
      async listRules() {
        return [
          {
            id: "rule-service-errors",
            tenantId: "tenant-a",
            metricId: "service.error.count",
            operator: "gt" as const,
            threshold: "10",
            severity: "critical" as const,
            enabled: true,
            archived: false,
            createdBy: "owner-a",
            createdAt: new Date("2026-10-03T10:00:00Z"),
          },
          {
            id: "rule-cross-tenant",
            tenantId: "tenant-b",
            metricId: "incident.count",
            operator: "gt" as const,
            threshold: "1",
            severity: "warning" as const,
            enabled: true,
            archived: false,
            createdBy: "other",
            createdAt: new Date("2026-10-03T10:00:00Z"),
          },
        ];
      },
    },
  );
}

describe("R9 Global Search", () => {
  it("compõe navegação, produto e fonte no tenant sem expor secrets/config", async () => {
    const result = await buildService().search(owner, "kordena", 20);

    expect(result.items.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["navigation", "product", "source"]),
    );
    expect(result.items.some((item) => item.id === "product:product-cross-tenant")).toBe(false);
    expect(result.items.some((item) => item.id === "source:source-cross-tenant")).toBe(false);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("SEARCH_MUST_NOT_EXPOSE_ME");
    expect(serialized).not.toContain("api-secret-must-not-be-searchable");
    expect(serialized).not.toContain("private.example.test");
  });

  it("não consulta nem retorna Source Registry para papel sem source:read", async () => {
    const sourceCounter = { value: 0 };
    const result = await buildService({ sourceCounter }).search(
      { ...owner, role: "viewer" },
      "kordena",
    );

    expect(sourceCounter.value).toBe(0);
    expect(result.items.some((item) => item.kind === "source")).toBe(false);
    expect(result.items.some((item) => item.kind === "product")).toBe(true);
  });

  it("normaliza acentos na busca de navegação", async () => {
    const result = await buildService().search(owner, "configuracoes");
    expect(
      result.items.some(
        (item) =>
          item.kind === "navigation" &&
          item.href === "/dashboard/settings",
      ),
    ).toBe(true);
  });

  it("expõe métricas pendentes como semântica pendente, nunca como valor inventado", async () => {
    const result = await buildService().search(owner, "MRR");
    const metric = result.items.find(
      (item) => item.id === "metric:revenue.mrr",
    );

    expect(metric).toBeDefined();
    expect(metric?.description).toContain("Semântica pendente");
    expect(metric?.authority).toBe("executive_metric_target");
    expect(metric?.href).toBe("/dashboard/finance");
  });

  it("localiza regra de alerta pela métrica e mantém escopo do tenant", async () => {
    const result = await buildService().search(owner, "service.error");
    const rule = result.items.find(
      (item) => item.id === "alert_rule:rule-service-errors",
    );

    expect(rule?.href).toBe(
      "/dashboard/alerts/rules/rule-service-errors",
    );
    expect(
      result.items.some(
        (item) => item.id === "alert_rule:rule-cross-tenant",
      ),
    ).toBe(false);
  });

  it("rejeita consultas fora do contrato e limita resultados", async () => {
    await expect(buildService().search(owner, "x")).rejects.toBeInstanceOf(
      GlobalSearchQueryError,
    );
    await expect(
      buildService().search(owner, "a".repeat(81)),
    ).rejects.toBeInstanceOf(GlobalSearchQueryError);

    const limited = await buildService().search(owner, "a", 1).catch(
      () => null,
    );
    expect(limited).toBeNull();

    const validLimited = await buildService().search(owner, "co", 1);
    expect(validLimited.items).toHaveLength(1);
    expect(validLimited.counts.returned).toBe(1);
  });
});
