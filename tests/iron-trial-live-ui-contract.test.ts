import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/dashboard/trials/page.tsx","utf8");
const service = readFileSync("src/application/customer/iron-trial-portfolio-service.ts","utf8");

describe("Live FM Command IRON trial roster",()=>{
  it("uses session-derived tenant and existing IRON source registry",()=>{
    expect(page).toContain("resolveTenantContext(await headers())");
    expect(page).toContain("new PostgresSourceRepository()");
    expect(page).toContain("new IronTrialPortfolioService(");
    expect(service).toContain("sourceMatchesAdapter(source, profile)");
    expect(service).toContain("new IronCommercialConnector().snapshot(ctx, source)");
    expect(service).toContain('requirePermission(context, "commercial:read")');
    expect(service).not.toContain("FMCC_CAKTO_WEBHOOK_SECRET");
    expect(service).not.toContain("FMCC_IRON_CONTROL_PLANE_URL");
  });
  it("does not infer financial conversions from a trial and shows unavailable as unavailable",()=>{
    expect(page).toContain('ironTrials.state === "unavailable"');
    expect(page).toContain("Cobranças e conversão financeira não são inferidas");
    expect(page).toContain("ironTrials.academies.map");
    expect(page).toContain("academy.endsAt");
    expect(page).toContain("academy.subscriptionStatus");
    expect(page).not.toContain("academy.cnpj");
    expect(page).not.toContain("academy.email");
  });
  it("paginates source-backed academies within the authorized IRON product",()=>{
    expect(page).toContain("selectedProduct?.id, requestedPage");
    expect(page).toContain("ironTrials.pages");
    expect(page).toContain("query.set(\"productId\", selectedProduct.id)");
    expect(page).toContain("ironTrials.page + 1");
  });
});
