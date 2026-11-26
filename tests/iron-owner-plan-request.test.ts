import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { POST } from "@/app/api/internal/iron/commerce/plan-change/route";
import { IronCommerceProvisioning } from "@/application/billing/iron-commerce-provisioning";
import { quoteIronPlanChange } from "@/application/billing/iron-plan-change-quote";
import { pool } from "@/infrastructure/db/client";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/unused");
it.skipIf(!["localhost","127.0.0.1"].includes(url.hostname) || url.pathname !== "/fmcc")(
  "persists concurrent owner requests once and rejects changed prices", async () => {
    const tenant = "ci-change-" + randomUUID();
    const product = (await pool.query("INSERT INTO fmcc_product_definition(tenant_id,slug,name,status) VALUES($1,'iron','QA','active') RETURNING id",[tenant])).rows[0].id;
    const token = randomUUID() + randomUUID();
    vi.stubEnv("FMCC_IRON_BILLING_TENANT_ID", tenant);
    vi.stubEnv("FMCC_IRON_PRODUCT_ID", product);
    vi.stubEnv("FMCC_IRON_COMMERCE_S2S_TOKEN", token);
    const body = {gymId:randomUUID(),expectedSubscriptionId:randomUUID(),actorId:randomUUID(),targetPlanCode:"GROWTH"};
    const quote = quoteIronPlanChange({planCode:"START",amountMinor:14700,interval:"monthly"},
      {planCode:"GROWTH",amountMinor:29700,interval:"monthly"},
      {nextPaymentAt:new Date(Date.now()+86400000).toISOString(),observedAt:new Date().toISOString()});
    const stub=vi.spyOn(IronCommerceProvisioning.prototype,"current").mockResolvedValue(
      {changeQuote:quote} as Awaited<ReturnType<IronCommerceProvisioning["current"]>>);
    const send = (extra: Record<string,unknown>, bearer = token) => POST(new Request("https://localhost/plan-change",
      {method:"POST",headers:{authorization:"Bearer "+bearer},body:JSON.stringify({...body,...extra})}));
    try {
      expect((await send({},"wrong")).status).toBe(401);
      const preview=await (await send({})).json();
      expect(preview.amountDueNowMinor).toBe(15000);
      expect((await send({termsHash:"0".repeat(64)})).status).toBe(409);
      const accepted=await Promise.all([send({termsHash:preview.termsHash}),send({termsHash:preview.termsHash})]);
      const a=await accepted[0].json(), b=await accepted[1].json();
      expect(a.status).toBe("awaiting_authorization");
      expect(b.requestId).toBe(a.requestId);
      expect((await pool.query("SELECT id FROM fmcc_iron_plan_change_request WHERE gym_id=$1",[body.gymId])).rowCount).toBe(1);
    } finally {stub.mockRestore();vi.unstubAllEnvs();}
});
