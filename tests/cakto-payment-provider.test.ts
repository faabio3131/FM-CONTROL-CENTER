import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CaktoPaymentProvider } from "@/infrastructure/subscription/cakto-payment-provider";

const ID = "fa9c7a11-5725-4495-bc16-f09a86c52d3e";
const secret = "test-only-secret-1234567890-test-secret";
const config = {
  FMCC_CAKTO_WEBHOOK_SECRET: secret,
  FMCC_CAKTO_CHECKOUTS_JSON: JSON.stringify([
    { offerId: "offer_month", productId: "iron_product", planCode: "IRON_PRO", checkoutUrl: "https://pay.cakto.com.br/offer_month", amountMinor: 26900, interval: "month" },
    { offerId: "offer_year", productId: "iron_product", planCode: "IRON_YEAR", checkoutUrl: "https://pay.cakto.com.br/offer_year", amountMinor: 269000, interval: "year" },
  ]),
};
const now = new Date("2026-11-09T12:00:00Z");
const provider = () => new CaktoPaymentProvider(config, () => now);
const webhook = (data: Record<string, unknown>, event = "purchase_approved") => {
  const body = JSON.stringify({ event, data });
  const ts = String(Math.floor(now.getTime() / 1000));
  const sig = "v1=" + createHmac("sha256", secret).update(ts + "." + body).digest("hex");
  return { body, headers: new Headers({ "x-cakto-timestamp": ts, "x-cakto-signature": sig }) };
};
const order = (changes: Record<string, unknown> = {}) => ({
  id: "purchase_000001", offer_type: "main", sck: ID, status: "paid",
  amount: 269, currency: "BRL", paidAt: now.toISOString(),
  offer: { id: "offer_month" }, product: { id: "iron_product" }, ...changes,
});
describe("Cakto hosted checkout and authenticated webhook", () => {
  it("is not enabled without seller config", () => {
    expect(() => new CaktoPaymentProvider({ NODE_ENV: "production" })).toThrow("cakto.webhook_secret_required");
    expect(() => new CaktoPaymentProvider({ NODE_ENV: "production", ...config })).not.toThrow();
  });
  it("creates no remote charge; returns opaque tenant-bound callback URL", async () => {
    const p = provider();
    expect(await p.createCustomer({ name: "Maria", email: "maria@example.com", taxId: null, externalReference: ID })).toEqual({ customerRef: ID });
    const r = await p.createSubscription({ customerRef: ID, externalReference: ID,
      price: { amountMinor: 26900, currency: "BRL" }, interval: "month", planCode: "IRON_PRO", description: "IRON", firstDueDate: "2026-11-09" });
    expect(r).toEqual({ subscriptionRef: ID, checkoutUrl: "https://pay.cakto.com.br/offer_month?sck=" + ID });
    await expect(p.findSubscriptionByReference(ID)).resolves.toBeNull();
    await expect(p.cancelSubscription(ID)).rejects.toThrow("cakto.cancel_requires_provider_confirmation");
  });
  it("validates signature and amount, accepts only main offer of expected product", () => {
    const p = provider(); const x = webhook(order());
    expect(p.verifyWebhook(x.headers, x.body)).toMatchObject({
      eventId: "pay:purchase_000001", type: "payment_confirmed", subscriptionRef: ID, amount: { amountMinor: 26900, currency: "BRL" },
    });
    const tampered = x.body.replace("269", "1");
    expect(() => p.verifyWebhook(x.headers, tampered)).toThrow("webhook.signature_invalid");
    for (const changes of [{ amount: 1 }, { product: { id: "other" } }, { offer: { id: "offer_year" } }, { sck: null }, { offer_type: "orderbump" }, { status: "waiting_payment" }]) {
      const y = webhook(order(changes)); expect(p.verifyWebhook(y.headers, y.body)).toBeNull();
    }
  });
  it("rejects stale, unsigned, and malformed deliveries", () => {
    const p = provider(), x = webhook(order());
    x.headers.set("x-cakto-timestamp", String(Math.floor(now.getTime() / 1000) - 301));
    expect(() => p.verifyWebhook(x.headers, x.body)).toThrow("webhook.signature_invalid");
    x.headers.delete("x-cakto-signature");
    expect(() => p.verifyWebhook(x.headers, x.body)).toThrow("webhook.signature_invalid");
  });
  it("deduplicates approval and renewal on the same order ID and never grants access from refund", () => {
    const p = provider();
    const success = webhook(order());
    const renewed = webhook(order(), "subscription_renewed");
    const refund = webhook(order(), "refund");
    expect(p.verifyWebhook(success.headers, success.body)?.eventId).toBe(p.verifyWebhook(renewed.headers, renewed.body)?.eventId);
    expect(p.verifyWebhook(refund.headers, refund.body)).toMatchObject({ type: "payment_refunded", amount: null });
  });
  it("refuses ambiguous price mappings and unsafe checkout targets", async () => {
    expect(() => new CaktoPaymentProvider({ ...config, FMCC_CAKTO_CHECKOUTS_JSON: JSON.stringify([
      { offerId: "a12", productId: "p12", planCode: "IRON_PRO", checkoutUrl: "https://attacker.example/pay", amountMinor: 26900, interval: "month" },
    ]) })).toThrow("cakto.checkout_config_invalid");
    expect(provider().hasExactlyOneOffer(26900, "month", "IRON_PRO")).toBe(true);
    expect(provider().hasExactlyOneOffer(26900, "month", "IRON_OTHER")).toBe(false);
    await expect(provider().createSubscription({ customerRef: ID, externalReference: ID,
      price: { amountMinor: 26900, currency: "BRL" }, interval: "month", planCode: "IRON_OTHER",
      description: "IRON", firstDueDate: "2026-11-09" })).rejects.toThrow("cakto.offer_not_configured_or_ambiguous");
    await expect(provider().createSubscription({ customerRef: ID, externalReference: ID,
      price: { amountMinor: 1, currency: "BRL" }, interval: "month", planCode: "IRON_PRO", description: "IRON", firstDueDate: "2026-11-09" })).rejects.toThrow("cakto.offer_not_configured_or_ambiguous");
  });
});


describe("documented Cakto read-only subscription schedule", () => {
  it("validates order, invoice, original subscription and offer; returns only schedule metadata", async () => {
    const invoiceId = "fa9c7a11-5725-4495-bc16-f09a86c52d3e";
    const paymentId = "a9c7a111-5725-4495-bc16-f09a86c52d3e";
    const subscriptionId = "b9c7a111-5725-4495-bc16-f09a86c52d3e";
    const cfg = { FMCC_CAKTO_WEBHOOK_SECRET: "ci-secret-"+"x".repeat(40),
      FMCC_CAKTO_READ_CLIENT_ID: "ci-client", FMCC_CAKTO_READ_CLIENT_SECRET: "ci-secret",
      FMCC_CAKTO_CHECKOUTS_JSON: JSON.stringify([{offerId:"offer_ci", productId:"product_ci",
        planCode:"IRON_PRO", amountMinor:26900, interval:"month", checkoutUrl:"https://pay.cakto.com.br/official"}]) };
    let foreign = false;
    const transport = (async (url: string|URL|Request, init?: RequestInit) => {
      const u = new URL(String(url));
      expect(u.origin).toBe("https://api.cakto.com.br");
      expect(init?.redirect).toBe("error");
      if (u.pathname.endsWith("/token/")) return new Response(JSON.stringify({access_token:"ci-token-"+"a".repeat(40),token_type:"Bearer"}));
      expect(new Headers(init?.headers).get("authorization")).toContain("Bearer ci-token-");
      if (u.pathname.includes("/orders/")) return new Response(JSON.stringify({
        id:paymentId,sck:invoiceId,type:"subscription",offer_type:"main",currency:"BRL",
        product:{id:"product_ci"},subscription:subscriptionId,customer:{email:"not-returned@example.com"},
      }));
      return new Response(JSON.stringify({
        id:subscriptionId,parent_order:foreign?"another-order":paymentId,product:"product_ci",
        offer:"offer_ci",status:"active",next_payment_date:"2027-01-18T00:00:00Z",customer:"private",
      }));
    }) as typeof fetch;
    const provider = new CaktoPaymentProvider(cfg);
    const input = {invoiceId,paymentId,planCode:"IRON_PRO",amountMinor:26900,interval:"month" as const};
    const result = await provider.readSubscriptionSchedule(input,transport);
    expect(result.nextPaymentAt).toBe("2027-01-18T00:00:00.000Z");
    expect(Object.keys(result).sort()).toEqual(["nextPaymentAt","observedAt"]);
    foreign = true;
    await expect(provider.readSubscriptionSchedule(input,transport)).rejects.toThrow("cakto.schedule_unavailable");
    await expect(provider.readSubscriptionSchedule({...input,paymentId:"not-a-provider-order"},transport))
      .rejects.toThrow("cakto.schedule_not_configured_or_bound");
  });
});


describe("official Cakto receipt resend",()=>{
  it("only posts to the paid order's original-recipient endpoint; never includes an address",async()=>{
    const cfg={...config,FMCC_CAKTO_RECEIPT_CLIENT_ID:"ci-receipt",FMCC_CAKTO_RECEIPT_CLIENT_SECRET:"ci-only"};
    const requests:{url:string,init?:RequestInit}[]=[];
    const transport=(async(url:string|URL|Request,init?:RequestInit)=>{
      requests.push({url:String(url),init});
      if(String(url).endsWith("/token/"))return new Response(JSON.stringify({access_token:"ci-token-"+"x".repeat(40),token_type:"Bearer"}));
      return new Response(JSON.stringify({detail:"Email reenviado com sucesso!"}));
    }) as typeof fetch;
    const p=new CaktoPaymentProvider(cfg);
    await p.resendApprovedEmail(ID,transport);
    expect(requests.length).toBe(2);
    expect(requests[1].url).toBe("https://api.cakto.com.br/public_api/orders/"+ID+"/resend_approved_email/");
    expect(requests[1].init?.method).toBe("POST");
    expect(requests[1].init?.body).toBeUndefined();
    expect(requests[1].init?.redirect).toBe("error");
    await expect(p.resendApprovedEmail("../other",transport)).rejects.toThrow("cakto.receipt_unavailable");
    expect(requests.length).toBe(2);
  });
});


describe("Cakto body-secret connectivity notifications (no financial authority)", () => {
  const body = (event: string, value: unknown = secret) =>
    JSON.stringify({ event, secret: value, data: order() });

  it.each(["pix_gerado", "boleto_gerado", "checkout_abandonment"])(
    "authenticates %s without HMAC but never produces a PaymentEvent", (event) => {
      expect(provider().verifyWebhook(new Headers(), body(event))).toBeNull();
    });

  it("rejects missing, incorrect and non-string body secrets", () => {
    for (const value of ["", "x".repeat(secret.length), null, 123, {value: secret}])
      expect(() => provider().verifyWebhook(new Headers(), body("pix_gerado", value)))
        .toThrow("webhook.signature_invalid");
    for (const raw of ["{}", "null", "[]", "{", JSON.stringify({event:"pix_gerado",data:order()})])
      expect(() => provider().verifyWebhook(new Headers(), raw))
        .toThrow("webhook.signature_invalid");
  });

  it.each(["purchase_approved", "subscription_renewed", "subscription_late_recovered",
    "subscription_late", "subscription_renewal_refused", "refund", "chargeback",
    "subscription_canceled", "unknown"])(
    "does not authorize %s with a body secret alone", (event) => {
      expect(() => provider().verifyWebhook(new Headers(), body(event)))
        .toThrow("webhook.signature_invalid");
    });

  it("never downgrades partial, stale or invalid HMAC even with a correct body secret", () => {
    const raw = body("boleto_gerado");
    const ts = String(Math.floor(now.getTime()/1000));
    const sig = (t: string) => "v1=" + createHmac("sha256",secret).update(t+"."+raw).digest("hex");
    const old = String(Number(ts)-301);
    for (const headers of [
      new Headers({"x-cakto-timestamp":ts}),
      new Headers({"x-cakto-signature":sig(ts)}),
      new Headers({"x-cakto-timestamp":ts,"x-cakto-signature":"v1="+"0".repeat(64)}),
      new Headers({"x-cakto-timestamp":old,"x-cakto-signature":sig(old)}),
      new Headers({"x-cakto-timestamp":"","x-cakto-signature":""}),
    ])
      expect(() => provider().verifyWebhook(headers,raw)).toThrow("webhook.signature_invalid");
    expect(provider().verifyWebhook(new Headers({
      "x-cakto-timestamp":ts,"x-cakto-signature":sig(ts)
    }),raw)).toBeNull();
  });
});


describe("Cakto OAuth cache", () => {
  it("shares tokens across instances, deduplicates concurrent acquisition, refreshes before expiry, and isolates receipt credentials", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(now);
      const cfg = {...config, FMCC_CAKTO_RECEIPT_CLIENT_ID:"ci-client", FMCC_CAKTO_RECEIPT_CLIENT_SECRET:"ci-secret",
        FMCC_CAKTO_READ_CLIENT_ID:"ci-client", FMCC_CAKTO_READ_CLIENT_SECRET:"ci-secret"};
      let authCalls=0;
      let fail=false;
      const transport=(async(url:string|URL|Request, init?:RequestInit)=>{
        const path=new URL(String(url)).pathname;
        if(path.endsWith("/token/")){
          authCalls++;
          return new Response(JSON.stringify({access_token:"test-token-"+String(authCalls).padStart(20,"0"),token_type:"Bearer",expires_in:36000}));
        }
        expect(new Headers(init?.headers).get("authorization")).toMatch(/^Bearer test-token-/);
        if(fail) return new Response("",{status:401});
        if(path.endsWith("/resend_approved_email/"))return new Response(JSON.stringify({detail:"ok"}));
        if(path.includes("/orders/"))return new Response(JSON.stringify({id:ID,sck:ID,type:"subscription",offer_type:"main",currency:"BRL",product:{id:"iron_product"},subscription:ID}));
        return new Response(JSON.stringify({id:ID,parent_order:ID,product:"iron_product",offer:"offer_month",status:"active",next_payment_date:null}));
      }) as typeof fetch;
      const receipt=()=>new CaktoPaymentProvider(cfg).resendApprovedEmail(ID,transport);
      const schedule=()=>new CaktoPaymentProvider(cfg).readSubscriptionSchedule({invoiceId:ID,paymentId:ID,planCode:"IRON_PRO",amountMinor:26900,interval:"month"},transport);
      await Promise.all([receipt(),receipt(),receipt()]);
      expect(authCalls).toBe(1);
      await schedule();
      expect(authCalls).toBe(2);
      await receipt();
      expect(authCalls).toBe(2);
      vi.setSystemTime(now.getTime()+35700*1000);
      await receipt();
      expect(authCalls).toBe(3);
      fail=true;
      await expect(receipt()).rejects.toThrow("cakto.receipt_unavailable");
      expect(authCalls).toBe(3);
      fail=false;
      await receipt();
      expect(authCalls).toBe(4);
      await new CaktoPaymentProvider({...cfg,FMCC_CAKTO_RECEIPT_CLIENT_SECRET:"rotated"}).resendApprovedEmail(ID,transport);
      expect(authCalls).toBe(5);
    } finally {vi.useRealTimers();}
  });
});
