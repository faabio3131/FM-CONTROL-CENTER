import { describe,it,expect } from "vitest";
import { AsaasVendePaymentReadOnlyClient } from "../src/infrastructure/billing/asaas-vende-payment-readonly-client";
const scope={tenantId:"fm",gatewayAccountId:"d532a6da-a4a5-4537-a891-aad997142991",provider:"asaas" as const,
  environment:"sandbox" as const,secretRef:"vault://fm/payment/account-1"};
const expected={paymentId:"pay_synthetic",providerCustomerRef:"cus_synthetic",
  invoiceId:"e532a6da-a4a5-4537-a891-aad997142992",amountMinor:14990};
const payload={id:expected.paymentId,customer:expected.providerCustomerRef,
  externalReference:expected.invoiceId,value:149.90,billingType:"PIX",deleted:false,status:"RECEIVED"};
const response=(p:unknown)=>new Response(JSON.stringify(p),{status:200});

describe("Vende authenticated Asaas GET boundary",()=>{
  it("binds the account-scoped secret and exact GET, with no payload or redirect",async()=>{
    let calls=0;
    const client=new AsaasVendePaymentReadOnlyClient(async requested=>{
      expect(requested).toEqual(scope);return "synthetic-only-service-key";
    },(async(url,init)=>{
      calls++;expect(url).toBe("https://api-sandbox.asaas.com/v3/payments/pay_synthetic");
      expect(init?.method).toBe("GET");expect(init?.body).toBeUndefined();
      expect(init?.redirect).toBe("error");expect(init?.cache).toBe("no-store");
      expect(new Headers(init?.headers).get("access_token")).toBe("synthetic-only-service-key");
      return response(payload);
    }) as typeof fetch);
    expect(await client.read(scope,expected)).toBe("settled_verified");expect(calls).toBe(1);
  });
  it.each([
    ["PENDING","unpaid_verified"],["OVERDUE","unpaid_verified"],["RECEIVED","settled_verified"],
    ["REFUNDED","reversed_verified"],["CONFIRMED","needs_attention"],["RECEIVED_IN_CASH","needs_attention"],
    ["REFUND_IN_PROGRESS","needs_attention"],["CHARGEBACK_REQUESTED","needs_attention"],["NEW_STATUS","needs_attention"],
  ])("maps %s conservatively",async(status,outcome)=>{
    const client=new AsaasVendePaymentReadOnlyClient(async()=>"synthetic-only-service-key",
      (async()=>response({...payload,status})) as typeof fetch);
    expect(await client.read(scope,expected)).toBe(outcome);
  });
  it.each([
    {id:"pay_other"},{customer:"cus_other"},{externalReference:"other-invoice"},
    {value:149.901},{value:"149.90"},{deleted:true},{deleted:undefined},{billingType:"UNKNOWN"},
  ])("rejects mismatched or malformed provider attributes %j",async change=>{
    const client=new AsaasVendePaymentReadOnlyClient(async()=>"synthetic-only-service-key",
      (async()=>response({...payload,...change})) as typeof fetch);
    await expect(client.read(scope,expected)).rejects.toThrow("readback_unavailable");
  });
  it.each([{refunds:[{value:10}]},{chargeback:{status:"REQUESTED"}},{refunds:"malformed"}])("does not treat partial or disputed money as fully settled %j",async change=>{
    const client=new AsaasVendePaymentReadOnlyClient(async()=>"synthetic-only-service-key",
      (async()=>response({...payload,...change})) as typeof fetch);
    expect(await client.read(scope,expected)).toBe("needs_attention");
  });
  it("rejects unsafe credentials and malformed IDs before network",async()=>{
    let network=0,secrets=0;
    const http=(async()=>{network++;return response(payload);}) as typeof fetch;
    const client=new AsaasVendePaymentReadOnlyClient(async()=>{secrets++;return "secret\nheader-injection";},http);
    await expect(client.read(scope,{...expected,paymentId:"../payments"})).rejects.toThrow();
    expect(secrets).toBe(0);
    await expect(client.read(scope,expected)).rejects.toThrow();expect(network).toBe(0);
  });
  it("does not retry network, HTTP, malformed JSON or oversized responses or expose secrets",async()=>{
    for(const action of [
      ()=>{throw Error("leaked-secret");},()=>new Response("leaked-secret",{status:302}),
      ()=>new Response("leaked-secret",{status:404}),()=>new Response("not json",{status:200}),
      ()=>new Response("x".repeat(65537),{status:200}),()=>response([]),
    ]){
      let calls=0;
      const client=new AsaasVendePaymentReadOnlyClient(async()=>"synthetic-only-service-key",
        (async()=>{calls++;return action();}) as typeof fetch);
      await expect(client.read(scope,expected)).rejects.toThrow(/^vende.payment_readback_unavailable$/);
      expect(calls).toBe(1);
    }
  });
});
