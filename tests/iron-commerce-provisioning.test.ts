import { describe, expect, it } from "vitest";
import { IronCommerceProvisioning, verifyIronCommerceBearer } from "@/application/billing/iron-commerce-provisioning";

const gym="d29f0dd5-0f3b-4c46-93b5-b5c18f53a073";
const sub="0592a749-ab6c-4cbc-94d9-bdc5fca927b0";
const product="33804d46-6da3-4273-803f-cefcf73b74d4";
const invoice="98c06e68-96ba-46c0-9e75-2eaecf613f24";
const token="test-private-iron-commerce-token-"+"q".repeat(45);
const env={
  FMCC_IRON_PRODUCT_ID: product, FMCC_IRON_BILLING_TENANT_ID:"fm-ci-tenant",
  FMCC_IRON_CONTROL_PLANE_URL:"https://api.ironfitcore.com.br/api/v1/control-plane/fmcc",
  FMCC_IRON_CONTROL_PLANE_TOKEN:token,
  FMCC_CAKTO_WEBHOOK_SECRET: "ci-webhook-"+ "a".repeat(35),
  FMCC_CAKTO_CHECKOUTS_JSON:JSON.stringify([
    {offerId:"offer_ci",productId:"product_ci",planCode:"IRON_PRO",
      checkoutUrl:"https://pay.cakto.com.br/offer_ci",amountMinor:26900,interval:"month"},
    {offerId:"offer_monthly",productId:"product_ci",planCode:"IRON_PRO_MONTHLY",
      checkoutUrl:"https://pay.cakto.com.br/offer_monthly",amountMinor:26900,interval:"month"},
    {offerId:"offer_yearly",productId:"product_ci",planCode:"IRON_PRO_YEARLY",
      checkoutUrl:"https://pay.cakto.com.br/offer_yearly",amountMinor:269000,interval:"year"},
  ]),
};
const req={gymId:gym,expectedSubscriptionId:sub,planCode:"IRON_PRO",idempotencyKey:"iron-ct-test-ref-01"};
function create(overrides: { snapshot?: unknown; plans?: unknown; bindings?: Array<{commercialPlanCode:string;ironPlanCode:string;ironPlanVersion:number}> } = {}) {
  const provider={
    listIronCommerceMappings: async () => overrides.bindings ?? [
      {commercialPlanCode:"IRON_PRO",ironPlanCode:"IRON_PRO",ironPlanVersion:1},
      {commercialPlanCode:"IRON_PRO_MONTHLY",ironPlanCode:"IRON_PRO",ironPlanVersion:1},
      {commercialPlanCode:"IRON_PRO_YEARLY",ironPlanCode:"IRON_PRO",ironPlanVersion:1},
    ],
    getRoute: async()=>({provider:"cakto",environment:"production",status:"enabled"}),
    listPlans: async()=>[
      {planCode:"IRON_PRO_MONTHLY",name:"Pro Mensal",interval:"monthly",amountMinor:26900,status:"active"},
      {planCode:"IRON_PRO_YEARLY",name:"Pro Anual",interval:"yearly",amountMinor:269000,status:"active"},
      {planCode:"IRON_FORGED",name:"Forjado",interval:"monthly",amountMinor:26900,status:"active"},
    ],
    prepareSubscriptionInvoice: async (x: Record<string,unknown>)=> {
    expect(x.externalTenantId).toBe(gym);expect(x.planCode).toBe("IRON_PRO");
    return { invoiceId:invoice,gatewayProvider:"cakto",gatewayEnvironment:"production" };
  }};
  const transport=(async (url: string | URL | Request,init?:RequestInit)=>{
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer "+token);
    if (String(url).endsWith("/snapshot")) return new Response(JSON.stringify(overrides.snapshot ?? {
      subscriptions:[{tenant_id:gym,external_id:sub,status:"ACTIVE"}]
    }),{status:200});
    return new Response(JSON.stringify(overrides.plans ?? {plans:[{plan_code:"IRON_PRO",version:1}]}),{status:200});
  }) as typeof fetch;
  return new IronCommerceProvisioning(env,transport,provider as never);
}
describe("IRON commerce S2S purchase boundary",()=>{
  it("refuses invalid machine bearer",()=>{
    expect(verifyIronCommerceBearer("Bearer "+token,token)).toBe(true);
    expect(verifyIronCommerceBearer("Bearer "+token+"x",token)).toBe(false);
    expect(verifyIronCommerceBearer(null,token)).toBe(false);
    expect(verifyIronCommerceBearer("Bearer "+token,"")).toBe(false);
  });
  it("exposes two commercial billing periods for the same canonical IRON tier, never an unbound price",async()=>{
    const offers = await create().offers();
    expect(offers.map(o=>o.planCode).sort()).toEqual(["IRON_PRO_MONTHLY","IRON_PRO_YEARLY"]);
    expect(offers.find(o=>o.interval==="yearly")?.amountMinor).toBe(269000);
    const stale = await create({plans:{plans:[{plan_code:"IRON_PRO",version:2}]}}).offers();
    expect(stale).toEqual([]);
  });
  it("refuses a commercial code without an immutable IRON plan binding",async()=>{
    await expect(create({bindings:[]}).prepare(req)).rejects.toThrow("iron.commerce_plan_mapping_unavailable");
    await expect(create({bindings:[{commercialPlanCode:"IRON_PRO",ironPlanCode:"IRON_PRO",ironPlanVersion:2}]}).prepare(req))
      .rejects.toThrow("iron.commerce_plan_not_published");
  });
  it("refuses forged/foreign/expired current IRON subscriptions before writing invoice",async()=>{
    await expect(create({snapshot:{subscriptions:[{tenant_id:"other",external_id:sub,status:"ACTIVE"}]}})
      .prepare(req)).rejects.toThrow("iron.commerce_subscription_invalid");
    await expect(create({snapshot:{subscriptions:[{tenant_id:gym,external_id:sub,status:"SUSPENDED"}]}})
      .prepare(req)).rejects.toThrow("iron.commerce_subscription_invalid");
    await expect(create({plans:{plans:[{plan_code:"IRON_OTHER",version:1}]}})
      .prepare(req)).rejects.toThrow("iron.commerce_plan_not_published");
    await expect(create().prepare({...req,gymId:"forged"})).rejects.toThrow("iron.commerce_input_invalid");
  });
});
