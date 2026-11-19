import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CaktoPaymentProvider } from "@/infrastructure/subscription/cakto-payment-provider";
import type { PaymentEvent } from "@/domain/billing/cakto-payment-provider-contract";
import { caktoReadbackFixture, ciCaktoReadEnv } from "./fixtures/cakto-readback-fixture";

const cfg={...ciCaktoReadEnv,FMCC_CAKTO_WEBHOOK_SECRET:"ci-fixture-webhook-boundary-only-000000",
  FMCC_CAKTO_CHECKOUTS_JSON:JSON.stringify([
    {offerId:"offer_main",productId:"ci_recurring",planCode:"IRON_START",amountMinor:14700,interval:"month",checkoutUrl:"https://pay.cakto.com.br/offer_main"},
    {offerId:"iron_ai100",productId:"ci_credit",planCode:"IRON_AI_WORKOUT_100",amountMinor:1990,interval:"one_time",checkoutUrl:"https://pay.cakto.com.br/ai100"},
  ])};
function setup(credit=false){
  const invoice=randomUUID(),payment=randomUUID(),fixture=caktoReadbackFixture();
  const offer=credit?"iron_ai100":"offer_main", product=credit?"ci_credit":"ci_recurring";
  const plan=credit?"IRON_AI_WORKOUT_100":"IRON_START", amount=credit?19.9:147;
  const event:PaymentEvent={eventId:"pay:"+payment,type:"payment_confirmed",subscriptionRef:invoice,
    paymentRef:payment,amount:{amountMinor:Math.round(amount*100),currency:"BRL"},occurredAt:new Date(0),
    offerInterval:credit?"one_time":"month",offerPlanCode:plan};
  const register=(source:string,status:string,id=payment)=>{
    fixture.register(JSON.stringify({event:source,data:{id,sck:invoice,offer_type:"main",status,amount,
      currency:"BRL",product:{id:product},offer:{id:offer},paidAt:new Date().toISOString()}}));
  };
  register("purchase_approved","paid");
  const provider=new CaktoPaymentProvider(cfg);
  return {fixture,event,register,confirm:(e=event,source="purchase_approved")=>provider.confirmFinancialEvent(e,source,fixture.transport),payment,invoice};
}
describe("Cakto authenticated financial READ independent contract",()=>{
  it.each([false,true])("requires exact provider order and immutable binding, credit=%s",async credit=>{
    const {fixture,event,confirm,payment}=setup(credit);
    const original=fixture.orders.get(payment)!;
    const proof=await confirm();
    expect(proof?.event).toMatchObject({paymentRef:payment,subscriptionRef:event.subscriptionRef,type:"payment_confirmed"});
    expect(proof?.event.occurredAt.getTime()).toBeGreaterThan(0);
    expect(proof?.evidence).toMatch(/^[0-9a-f]{64}$/);
    for(const patch of [{id:randomUUID()},{sck:randomUUID()},{offer_type:"orderbump"},{currency:"USD"},
      {product:{id:"foreign"}},{amount:"1.00"},{checkoutUrl:"https://pay.cakto.com.br/foreign"},
      {type:credit?"subscription":"unique"}]){
      fixture.orders.set(payment,{...original,...patch});
      await expect(confirm()).rejects.toThrow("cakto.readback_binding_invalid");
    }
    fixture.orders.set(payment,{...original,status:"authorized"});
    await expect(confirm()).rejects.toThrow("cakto.readback_not_confirmed");
    fixture.orders.set(payment,{...original,status:"refunded"});
    expect(await confirm()).toBeNull();
    fixture.orders.set(payment,original);
    for(const status of [401,404,429,500,503]){
      fixture.setFailure(status);
      await expect(confirm()).rejects.toThrow("cakto.readback_unavailable");
    }
    fixture.setFailure(null);
    expect(await confirm()).not.toBeNull();
  });
  it("validates recurring subscription, renewal membership and parent anchor, including late and cancel",async()=>{
    const {fixture,event,confirm,register,payment,invoice}=setup();
    const sid=String(fixture.orders.get(payment)!.subscription);
    const origSub=fixture.subscriptions.get(sid)!;
    for(const patch of [{id:randomUUID()},{product:"foreign"},{offer:"foreign"},{parent_order:randomUUID()}]){
      fixture.subscriptions.set(sid,{...origSub,...patch});
      await expect(confirm()).rejects.toThrow("cakto.readback_binding_invalid");
    }
    fixture.subscriptions.set(sid,origSub);
    const renewal=randomUUID();
    register("subscription_renewed","paid",renewal);
    expect(await confirm({...event,paymentRef:renewal},"subscription_renewed")).not.toBeNull();
    const original=fixture.orders.get(payment)!;
    fixture.orders.set(payment,{...original,sck:randomUUID()});
    await expect(confirm({...event,paymentRef:renewal},"subscription_renewed")).rejects.toThrow("cakto.readback_binding_invalid");
    fixture.orders.set(payment,{...original,sck:invoice});
    register("subscription_late","waiting_payment",renewal);
    expect(await confirm({...event,paymentRef:renewal,type:"payment_overdue",amount:null},"subscription_late")).not.toBeNull();
    register("subscription_renewal_refused","refused",renewal);
    expect(await confirm({...event,paymentRef:renewal,type:"payment_overdue",amount:null},"subscription_renewal_refused")).not.toBeNull();
    register("subscription_late_recovered","paid",renewal);
    expect(await confirm({...event,paymentRef:renewal,type:"payment_overdue",amount:null},"subscription_late")).toBeNull();
    expect(await confirm({...event,paymentRef:renewal},"subscription_late_recovered")).not.toBeNull();
    register("subscription_canceled","paid",renewal);
    expect(await confirm({...event,paymentRef:renewal,type:"subscription_cancelled",amount:null},"subscription_canceled")).not.toBeNull();
    expect(await confirm({...event,paymentRef:renewal},"subscription_renewed")).toBeNull();
  });
  it.each([false,true])("only confirms terminal refund or chargeback, credit=%s",async credit=>{
    const {fixture,event,confirm,register,payment}=setup(credit);
    const refund={...event,type:"payment_refunded" as const,amount:null};
    for(const status of ["refund_requested","in_settlement","prechargeback","paid"]){
      fixture.orders.set(payment,{...fixture.orders.get(payment)!,status});
      await expect(confirm(refund,"refund")).rejects.toThrow("cakto.readback_not_confirmed");
    }
    register("refund","refunded");
    expect(await confirm(refund,"refund")).not.toBeNull();
    register("chargeback","chargedback");
    expect(await confirm(refund,"chargeback")).not.toBeNull();
    await expect(confirm(refund,"purchase_approved")).rejects.toThrow("cakto.readback_binding_invalid");
  });
  it("rejects missing or reused credentials before external requests",async()=>{
    const {event,fixture}=setup(true);
    for(const config of [{...cfg,FMCC_CAKTO_READ_CLIENT_ID:""},
      {...cfg,FMCC_CAKTO_RECEIPT_CLIENT_ID:cfg.FMCC_CAKTO_READ_CLIENT_ID}]){
      await expect(new CaktoPaymentProvider(config).confirmFinancialEvent(event,"purchase_approved",fixture.transport)).rejects.toThrow("cakto.readback_");
    }
    expect(fixture.reads()).toBe(0);
  });
});
