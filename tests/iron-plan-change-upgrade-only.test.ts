import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { POST } from "@/app/api/internal/iron/commerce/plan-change/route";
import { IronCommerceProvisioning } from "@/application/billing/iron-commerce-provisioning";
import { quoteIronPlanChange } from "@/application/billing/iron-plan-change-quote";

it("refuses a downgrade before quoting or persisting it", async () => {
  const token = randomUUID() + randomUUID();
  vi.stubEnv("FMCC_IRON_COMMERCE_S2S_TOKEN", token);
    vi.stubEnv("FMCC_IRON_DIFFERENCE_CHANGE_SANDBOX", "true");
  const renewal = {nextPaymentAt:new Date(Date.now()+86400000).toISOString(),observedAt:new Date().toISOString()};
  const down = quoteIronPlanChange({planCode:"GROWTH",amountMinor:29700,interval:"monthly"},
    {planCode:"START",amountMinor:14700,interval:"monthly"}, renewal);
  const up = quoteIronPlanChange({planCode:"START",amountMinor:14700,interval:"monthly"},
    {planCode:"GROWTH",amountMinor:29700,interval:"monthly"}, renewal);
  const stub = vi.spyOn(IronCommerceProvisioning.prototype,"current");
  const send = (termsHash?: string) => POST(new Request("https://localhost/plan-change",{method:"POST",
    headers:{authorization:"Bearer "+token},body:JSON.stringify({gymId:randomUUID(),expectedSubscriptionId:randomUUID(),
      actorId:randomUUID(),targetPlanCode:"START",...(termsHash?{termsHash}:{})})}));
  try {
    stub.mockResolvedValue({changeQuote:down} as Awaited<ReturnType<IronCommerceProvisioning["current"]>>);
    const preview = await send();
    expect(preview.status).toBe(409);
    expect(await preview.json()).toEqual({error:"iron.change_downgrade_not_offered"});
    expect((await send("a".repeat(64))).status).toBe(409);
    stub.mockResolvedValue({changeQuote:up} as Awaited<ReturnType<IronCommerceProvisioning["current"]>>);
    const upgrade = await send();
    expect(upgrade.status).toBe(200);
    expect((await upgrade.json()).amountDueNowMinor).toBe(15000);
  } finally { stub.mockRestore(); vi.unstubAllEnvs(); }
});
