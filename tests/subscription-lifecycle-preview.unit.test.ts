import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { previewSubscriptionLifecycle } from "../src/domain/billing/subscription-lifecycle-policy";
import { SubscriptionLifecyclePreviewService } from "../src/application/billing/subscription-lifecycle-preview-service";
import { BillingSubscriptionTraceService, type SubscriptionFinancialTrace, type SubscriptionTraceRepository } from "../src/application/billing/billing-subscription-trace-service";
import type { TenantContext } from "../src/domain/security/tenant-context";
const id = "11111111-1111-4111-8111-111111111111";
const context: TenantContext = { tenantId: "fm", userId: "owner", role: "owner", correlationId: "corr" };
const trace: SubscriptionFinancialTrace = {
  authority: "fmcc_billing_invoice_and_provider_payment",
  subscription: { subscriptionId: id, productId: "product", customerId: "customer", externalTenantId: "saas", planCode: "PLAN", status: "active", createdAt: new Date("2026-10-20") },
  invoices: [{ invoiceId: "invoice", invoiceStatus: "paid", amountMinor: 2000, currency: "BRL", createdAt: new Date("2026-10-20"), gatewayAccountId: "gateway", recordedPaymentStatus: "received", paymentRecordedAt: new Date("2026-10-20") }],
  limit: 50, truncated: false, settlementConfirmedByThisView: false,
};
describe("C06 - advisory-only contract lifecycle", () => {
  it("classifies active without granting authority", () => {
    const x=previewSubscriptionLifecycle(trace);
    expect(x.executable).toBe(false);
    expect(x.settlementProven).toBe(false);
    expect(x.options.every(o => o.executionAuthorized === false)).toBe(true);
    expect(x.options.filter(o=>o.status === "candidate_for_review").map(o=>o.action))
      .toEqual(["cancel", "suspend", "renew", "migrate_plan"]);
  });
  it("does not invent trial or unknown status transitions", () => {
    for(const status of ["trial", "suspended", "unknown", "cancelled"]) {
      expect(previewSubscriptionLifecycle({ ...trace, subscription: {...trace.subscription, status} })
        .options.every(o=>o.status === "not_applicable")).toBe(true);
    }
    expect(previewSubscriptionLifecycle({...trace,subscription:{...trace.subscription,status:"past_due"}})
      .options.find(o=>o.action==="reactivate")?.status).toBe("candidate_for_review");
  });
  it("keeps refunds and truncated financial history explicit", () => {
    const x=previewSubscriptionLifecycle({...trace,truncated:true,invoices:[{...trace.invoices[0], recordedPaymentStatus:"refunded"}]});
    expect(x.invoicesIncomplete).toBe(true);
    expect(x.options.find(o=>o.action==="renew")?.status).toBe("not_applicable");
    expect(x.options[0].prerequisites.some(p=>p.includes("integral"))).toBe(true);
  });
  it("reuses identity and existing tenant-fenced trace", async () => {
    const repo: SubscriptionTraceRepository={
      getSubscription:vi.fn(async()=>trace.subscription),
      listInvoices:vi.fn(async()=>trace.invoices),
    };
    const svc=new SubscriptionLifecyclePreviewService(new BillingSubscriptionTraceService(repo));
    await svc.get(context,id);
    expect(repo.getSubscription).toHaveBeenCalledWith("fm",id);
    await expect(svc.get({...context,role:"viewer"},id))
      .rejects.toThrow("security.permission_denied:billing:read");
    await expect(svc.get(context,"../outside")).rejects.toThrow();
    expect(repo.listInvoices).toHaveBeenCalledTimes(1);
  });
  it("has GET-only no-store API and non-executable Portuguese UI",()=>{
    const api=readFileSync(resolve("src/app/api/billing/subscriptions/[subscriptionId]/lifecycle-preview/route.ts"),"utf8");
    const page=readFileSync(resolve("src/app/dashboard/subscriptions/[subscriptionId]/page.tsx"),"utf8");
    expect(api).toContain("resolveTenantContext(await headers())");
    expect(api).toContain('"Cache-Control": "no-store"');
    expect(api).not.toContain("export async function POST");
    expect(page).toContain("Análise contratual — sem execução");
    expect(page).not.toContain("Registrar cancelamento agora");
  });
});
