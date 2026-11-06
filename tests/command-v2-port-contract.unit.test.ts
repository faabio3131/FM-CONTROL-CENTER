import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const code = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Command V2 port boundaries", () => {
  it("keeps the existing Command billing, product, and Core interfaces untouched", () => {
    const page = code("src/app/dashboard/page.tsx");
    expect(page).toContain("new MetricService(new PostgresMetricStore())");
    expect(page).toContain("buildAlertService().overview(context)");
    expect(page).toContain("new ProductRegistryService(productsRepository).list(context)");
    expect(page).toContain("<BarChart items={healthBars}");
    expect(page).toContain("<BarChart items={alertBars}");
    expect(page).toContain("<LiveRefresh />");
  });
  it("keeps the live route authenticated, fail-closed and private", () => {
    const route = code("src/app/api/live/pulse/route.ts");
    const repo = code("src/infrastructure/live/postgres-live-pulse-repository.ts");
    expect(route).toContain("resolveTenantContext(await headers())");
    expect(route).toContain("live.access_denied");
    expect(route).toContain("private, no-store");
    expect(route).toContain("status: 503");
    expect(repo).toContain("eq(metricValues.tenantId, tenantId)");
    expect(repo).toContain("eq(auditEvents.tenantId, tenantId)");
    expect(repo).toContain("includeAudit");
  });
  it("does not poll while hidden, refresh blindly or convert missing to zero", () => {
    const client = code("src/app/dashboard/live/live-refresh.tsx");
    expect(client).toContain('document.visibilityState === "hidden"');
    expect(client).toContain("shouldRefresh(previous.current, result.token)");
    expect(client).toContain("nextDelayMs(failures)");
    const chart = code("src/app/dashboard/charts/bar-chart.tsx");
    expect(chart).toContain("item.valueText !== null");
    expect(chart).toContain("unavailableText");
  });
});
