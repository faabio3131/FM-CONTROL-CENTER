import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("FM Command V1 signed one-time IRON Cakto credits delivery",()=>{
  it("stays disabled until official opt-in and uses dedicated worker",()=>{
    const workflow=readFileSync(".github/workflows/fmcc-iron-cakto-credit-delivery.yml","utf8");
    expect(workflow).toContain("FMCC_CAKTO_CREDITS_OUTBOX_ENABLED");
    expect(workflow).toContain("/api/internal/automation/iron/ai-credits/drain");
    expect(workflow).toContain("FMCC_ALERT_AUTOMATION_SCHEDULER_SECRET");
    expect(workflow).toContain("https://app.fmcommand.com.br");
    expect(workflow).not.toContain("FMCC_CAKTO_OUTBOX_ENABLED }}");
  });
  it("cannot accept new pack grant without authenticated FM payment event",()=>{
    const route=readFileSync("src/app/api/webhooks/iron/cakto/ai-credits/route.ts","utf8");
    const ledger=readFileSync("src/application/billing/iron-ai-credit-billing.ts","utf8");
    expect(route).toContain("WebhookRejectedError");
    expect(ledger).toContain('verifyOneTimeWebhook');
    expect(ledger).toContain('event.offerPlanCode !== order.package_code');
    expect(ledger).toContain("fmcc_iron_ai_credit_order");
  });
});

describe("Cakto financial READ mandatory production boundary",()=>{
  it("queues authenticated observations before any external or financial effect",()=>{
    for(const route of ["src/app/api/webhooks/iron/cakto/route.ts","src/app/api/webhooks/iron/cakto/ai-credits/route.ts"]){
      const content=readFileSync(route,"utf8");
      expect(content).toContain("CaktoIronReadbackInbox");
      expect(content).toContain(".accept(");
      expect(content).not.toContain(".handleWebhook(");
    }
    for(const ledger of ["src/application/billing/cakto-iron-product-billing.ts","src/application/billing/iron-ai-credit-billing.ts"])
      expect(readFileSync(ledger,"utf8")).toContain("await this.provider.confirmFinancialEvent(");
    const worker=readFileSync("src/app/api/internal/automation/iron/cakto-readback/drain/route.ts","utf8");
    expect(worker).toContain('FMCC_CAKTO_READBACK_ENABLED!=="YES"');
    expect(worker).toContain("verifyScheduledWorkerBearer");
    const recovery=readFileSync("src/app/api/billing/products/[productId]/iron-cakto-readback/recover/route.ts","utf8");
    expect(recovery).toContain("verifyPasswordStepUp");
    expect(recovery).toContain(".requeue(context,body.inboxId)");
  });
});
