import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { PaymentProviderError, WebhookRejectedError, type CreateSubscriptionInput, type CustomerInput, type PaymentEvent, type PaymentProvider, type ProviderCapabilities, type ProviderSubscription } from "@/domain/billing/cakto-payment-provider-contract";

type Offer = { offerId: string; productId: string; planCode: string; checkoutUrl: string; amountMinor: number; interval: "month" | "year" | "one_time" };
const REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OAuthToken = { value: string; refreshAt: number };
// Cache survives short-lived adapter instances, but never crosses transport or
// credential/purpose boundaries. No token/credential is persisted or logged.
const oauthCaches = new WeakMap<typeof fetch, Map<string, OAuthToken>>();
const oauthPending = new WeakMap<typeof fetch, Map<string, Promise<OAuthToken>>>();
function oauthKey(purpose: "read" | "receipt" | "manage", clientId: string, clientSecret: string) {
  return createHash("sha256").update(JSON.stringify([purpose, clientId, clientSecret])).digest("hex");
}
async function getOAuthToken(transport: typeof fetch, key: string,
  acquire: () => Promise<Record<string, unknown>>): Promise<string> {
  let cache = oauthCaches.get(transport);
  if (!cache) { cache = new Map(); oauthCaches.set(transport, cache); }
  let pending = oauthPending.get(transport);
  if (!pending) { pending = new Map(); oauthPending.set(transport, pending); }
  const cached = cache.get(key);
  if (cached && Date.now() < cached.refreshAt) return cached.value;
  cache.delete(key);
  const existing = pending.get(key);
  if (existing) return (await existing).value;
  const requestedAt = Date.now();
  const work = (async () => {
    const auth = await acquire();
    if (typeof auth.access_token !== "string" || auth.access_token.length < 16 ||
        auth.access_token.length > 8192 || !/^[A-Za-z0-9._~+\/-]+={0,2}$/.test(auth.access_token) ||
        String(auth.token_type).toLowerCase() !== "bearer")
      throw new Error("cakto.oauth_invalid");
    // Missing/invalid expiry is never cached. The documented TTL is 36000s.
    // Cap any unexpectedly long TTL and refresh early even for short TTLs.
    const ttl = typeof auth.expires_in === "number" && Number.isSafeInteger(auth.expires_in)
      && auth.expires_in > 0 ? Math.min(auth.expires_in, 36000) : 0;
    const margin = Math.min(300, Math.ceil(ttl / 10));
    const token = { value: auth.access_token, refreshAt: requestedAt + (ttl - margin) * 1000 };
    if (token.refreshAt > Date.now()) {
      // Bound memory even when credentials are rotated.
      if (cache.size >= 32) cache.delete(cache.keys().next().value!);
      cache.set(key, token);
    }
    return token;
  })();
  pending.set(key, work);
  try { return (await work).value; }
  finally { if (pending.get(key) === work) pending.delete(key); }
}
function invalidateOAuthToken(transport: typeof fetch, key: string, token: string | undefined) {
  const cache = oauthCaches.get(transport);
  if (token && cache?.get(key)?.value === token) cache.delete(key);
}

/**
 * Cakto hosted-checkout adapter. The checkout is created in the seller's account.
 * The opaque Command subscription UUID travels as ?sck= and is returned in
 * signed webhooks. No customer payment information is trusted for tenant scope.
 *
 * A provider-side recurring cancellation needs its own documented/API-controlled
 * implementation; until then cancellation fails closed (no false local cancel).
 */
export class CaktoPaymentProvider implements PaymentProvider {
  readonly id = "cakto";
  readonly currencies = ["BRL"] as const;
  readonly capabilities: ProviderCapabilities = { billingMode: "provider_recurring", methods: ["pix", "card"], refunds: false };
  private readonly offers: Offer[];
  constructor(private readonly env: Record<string, string | undefined> = process.env, private readonly now: () => Date = () => new Date()) {
    if (!env.FMCC_CAKTO_WEBHOOK_SECRET || env.FMCC_CAKTO_WEBHOOK_SECRET.length < 24) throw new Error("cakto.webhook_secret_required");
    let parsed: unknown;
    try { parsed = JSON.parse(env.FMCC_CAKTO_CHECKOUTS_JSON ?? ""); } catch { throw new Error("cakto.checkout_config_invalid"); }
    if (!Array.isArray(parsed) || !parsed.length) throw new Error("cakto.checkout_config_invalid");
    this.offers = parsed.map((item: unknown) => {
      const a = item as Partial<Offer>;
      if (!a || typeof a.offerId !== "string" || !/^[A-Za-z0-9_-]{3,90}$/.test(a.offerId) ||
          typeof a.productId !== "string" || !/^[A-Za-z0-9_-]{3,90}$/.test(a.productId) ||
          typeof a.planCode !== "string" || !/^[A-Z][A-Z0-9_]{1,63}$/.test(a.planCode) ||
          !Number.isSafeInteger(a.amountMinor) || (a.amountMinor ?? 0) < 500 ||
          !["month", "year", "one_time"].includes(a.interval ?? "") || typeof a.checkoutUrl !== "string") throw new Error("cakto.checkout_config_invalid");
      let url: URL;
      try { url = new URL(a.checkoutUrl); } catch { throw new Error("cakto.checkout_config_invalid"); }
      if (url.protocol !== "https:" || url.hostname !== "pay.cakto.com.br" || url.username || url.password ||
          url.searchParams.has("sck") || url.hash) throw new Error("cakto.checkout_config_invalid");
      return {offerId: a.offerId, productId: a.productId, planCode: a.planCode, amountMinor: a.amountMinor!, interval: a.interval!, checkoutUrl: url.toString()};
    });
    if (new Set(this.offers.map(x => x.offerId)).size !== this.offers.length) throw new Error("cakto.checkout_config_duplicate");
  }

  hasExactlyOneOffer(amountMinor: number, interval: "month" | "year", planCode: string): boolean {
    return this.offers.filter(x => x.amountMinor === amountMinor && x.interval === interval && x.planCode === planCode).length === 1;
  }

  async createCustomer(input: CustomerInput): Promise<{ customerRef: string }> {
    if (!REF.test(input.externalReference)) throw new PaymentProviderError("cakto.reference_invalid", "rejected");
    // Customer details are collected by Cakto's hosted checkout; never send PAN/CPF to Command.
    return { customerRef: input.externalReference };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription> {
    if (!REF.test(input.externalReference) || input.price.currency !== "BRL") throw new PaymentProviderError("cakto.reference_invalid", "rejected");
    const matches = this.offers.filter(x => x.amountMinor === input.price.amountMinor && x.interval === input.interval && x.planCode === input.planCode);
    if (matches.length !== 1) throw new PaymentProviderError("cakto.offer_not_configured_or_ambiguous", "rejected");
    const url = new URL(matches[0].checkoutUrl);
    url.searchParams.set("sck", input.externalReference);
    // Idempotent: no provider mutation; reissuing an identical checkout URL is safe.
    return { subscriptionRef: input.externalReference, checkoutUrl: url.toString() };
  }

  /** Fixed one-time credit offer; never reuse a recurring plan, provider is FM Command. */
  oneTimeCheckout(reference: string, amountMinor: number, packageCode: string): string {
    if (!REF.test(reference) || !Number.isSafeInteger(amountMinor) || amountMinor <= 0)
      throw new PaymentProviderError("cakto.credits_reference_invalid", "rejected");
    const matches = this.offers.filter(x => x.interval === "one_time" &&
      x.amountMinor === amountMinor && x.planCode === packageCode);
    if (matches.length !== 1)
      throw new PaymentProviderError("cakto.credits_offer_not_configured_or_ambiguous", "rejected");
    const url = new URL(matches[0].checkoutUrl);
    url.searchParams.set("sck", reference);
    return url.toString();
  }

  /** Signed main-item payment + immutable offer/product/plan binding. */
  verifyOneTimeWebhook(headers: Headers, raw: string): PaymentEvent | null {
    const event = this.verifyWebhook(headers, raw);
    if (!event || event.offerInterval !== "one_time") return null;
    let body: {data?: unknown};
    try { body = JSON.parse(raw) as {data?: unknown}; } catch { return null; }
    const record = Array.isArray(body.data) ? (body.data.length === 1 ? body.data[0] : null) : body.data;
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;
    const item = record as {offer?: {id?: unknown}; product?: {id?: unknown}};
    if (!this.offers.some(o => o.interval === "one_time" &&
      o.planCode === event.offerPlanCode && o.offerId === item.offer?.id &&
      o.productId === item.product?.id)) return null;
    return event;
  }

  /**
   * Read-only provider schedule. The caller supplies the original invoice and
   * payment ID from the signed, tenant-scoped Command ledger, never from UI.
   * Docs: https://docs.cakto.com.br/comece-aqui/primeira-chamada
   * https://docs.cakto.com.br/api-reference/orders/retrieve
   * https://docs.cakto.com.br/api-reference/subscriptions/retrieve
   */
  async readSubscriptionSchedule(input: {
    invoiceId: string; paymentId: string; planCode: string; amountMinor: number;
    interval: "month" | "year";
  }, transport: typeof fetch = fetch): Promise<{ nextPaymentAt: string | null; observedAt: string }> {
    const clientId = this.env.FMCC_CAKTO_READ_CLIENT_ID;
    const clientSecret = this.env.FMCC_CAKTO_READ_CLIENT_SECRET;
    if (!clientId || !clientSecret || !REF.test(input.invoiceId) || !REF.test(input.paymentId))
      throw new Error("cakto.schedule_not_configured_or_bound");
    const offers = this.offers.filter(x => x.planCode === input.planCode &&
      x.amountMinor === input.amountMinor && x.interval === input.interval);
    if (offers.length !== 1) throw new Error("cakto.schedule_offer_invalid");
    const offer = offers[0];
    const key = oauthKey("read", clientId, clientSecret);
    let token: string | undefined;
    const base = "https://api.cakto.com.br/public_api/";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const data = async (path: string, init: RequestInit): Promise<Record<string, unknown>> => {
      const response = await transport(base + path, {
        ...init, redirect: "error", cache: "no-store", signal: controller.signal,
      });
      if (response.status === 401) invalidateOAuthToken(transport, key, token);
      if (!response.ok || !response.body) throw new Error("cakto.schedule_http_failure");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 262144) {
          await reader.cancel().catch(() => undefined);
          throw new Error("cakto.schedule_response_limit");
        }
        chunks.push(value);
      }
      const parsed: unknown = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("cakto.schedule_response_invalid");
      return parsed as Record<string, unknown>;
    };
    try {
      token = await getOAuthToken(transport, key, () => data("token/", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
      }));
      const headers = { authorization: "Bearer " + token };
      const order = await data("orders/" + input.paymentId + "/", { method: "GET", headers });
      const product = order.product as { id?: unknown } | null;
      if (order.id !== input.paymentId || order.sck !== input.invoiceId ||
          order.type !== "subscription" || order.offer_type !== "main" ||
          order.currency !== "BRL" || product?.id !== offer.productId ||
          typeof order.subscription !== "string" || !REF.test(order.subscription))
        throw new Error("cakto.schedule_order_binding_invalid");
      const subscription = await data("subscriptions/" + order.subscription + "/", { method: "GET", headers });
      if (subscription.id !== order.subscription || subscription.parent_order !== input.paymentId ||
          subscription.product !== offer.productId || subscription.offer !== offer.offerId)
        throw new Error("cakto.schedule_subscription_binding_invalid");
      let nextPaymentAt: string | null = null;
      const value = subscription.next_payment_date;
      if (subscription.status === "active") {
        if (value !== null && (typeof value !== "string" || !Number.isFinite(Date.parse(value))))
          throw new Error("cakto.schedule_date_invalid");
        if (typeof value === "string") nextPaymentAt = new Date(value).toISOString();
      }
      return { nextPaymentAt, observedAt: this.now().toISOString() };
    } catch {
      // Never propagate provider response, credentials or buyer PII to logs/UI.
      throw new Error("cakto.schedule_unavailable");
    } finally { clearTimeout(timer); }
  }

  /**
   * Stop the provider recurrence of a superseded IRON plan (upgrade at renewal).
   * The Cakto subscription is reached only through the original signed order of
   * this exact Command invoice and offer; it is never searched by buyer data.
   * Uses a dedicated credential with the documented "write subscriptions" scope.
   */
  async cancelRecurringByAnchor(input: {
    invoiceId: string; paymentId: string; planCode: string; amountMinor: number;
    interval: "month" | "year";
  }, transport: typeof fetch = fetch): Promise<"cancelled" | "already_cancelled"> {
    const clientId = this.env.FMCC_CAKTO_MANAGE_CLIENT_ID;
    const clientSecret = this.env.FMCC_CAKTO_MANAGE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("cakto.manage_not_configured");
    if (!REF.test(input.invoiceId) || !REF.test(input.paymentId)) throw new Error("cakto.cancel_binding_invalid");
    const offers = this.offers.filter(x => x.planCode === input.planCode &&
      x.amountMinor === input.amountMinor && x.interval === input.interval);
    if (offers.length !== 1) throw new Error("cakto.cancel_binding_invalid");
    const offer = offers[0];
    const key = oauthKey("manage", clientId, clientSecret);
    let token: string | undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const call = async (path: string, init: RequestInit) => {
      const response = await transport("https://api.cakto.com.br/public_api/" + path, {
        ...init, redirect: "error", cache: "no-store", signal: controller.signal,
      });
      if (response.status === 401) invalidateOAuthToken(transport, key, token);
      let body: Record<string, unknown> = {};
      if (response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 262144) { await reader.cancel().catch(() => undefined); throw new Error("cakto.cancel_unavailable"); }
          chunks.push(value);
        }
        try {
          const parsed: unknown = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)) || "{}");
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
        } catch { /* status code decides below */ }
      }
      return { status: response.status, body };
    };
    const read = async (path: string, headers: Record<string, string>) => {
      const result = await call(path, { method: "GET", headers });
      if (result.status !== 200) throw new Error("cakto.cancel_unavailable");
      return result.body;
    };
    try {
      token = await getOAuthToken(transport, key, async () => {
        const result = await call("token/", { method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }) });
        if (result.status !== 200) throw new Error("cakto.cancel_unavailable");
        return result.body;
      });
      const headers = { authorization: "Bearer " + token };
      const order = await read("orders/" + input.paymentId + "/", headers);
      const product = order.product as { id?: unknown } | null;
      if (order.id !== input.paymentId || order.sck !== input.invoiceId || order.type !== "subscription" ||
          order.offer_type !== "main" || product?.id !== offer.productId ||
          typeof order.subscription !== "string" || !REF.test(order.subscription))
        throw new Error("cakto.cancel_binding_invalid");
      const path = "subscriptions/" + order.subscription + "/";
      const current = await read(path, headers);
      if (current.id !== order.subscription || current.parent_order !== input.paymentId ||
          current.product !== offer.productId || current.offer !== offer.offerId)
        throw new Error("cakto.cancel_binding_invalid");
      if (current.status === "canceled") return "already_cancelled";
      const result = await call(path + "cancel/", { method: "POST", headers });
      // Never trust the acknowledgement alone: the provider state must read back as canceled.
      if (result.status !== 200 && result.status !== 400) throw new Error("cakto.cancel_unavailable");
      const after = await read(path, headers);
      if (after.id !== order.subscription || after.status !== "canceled") throw new Error("cakto.cancel_not_confirmed");
      return "cancelled";
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      throw new Error(/^cakto\.(manage_not_configured|cancel_binding_invalid|cancel_not_confirmed)$/.test(code)
        ? code : "cakto.cancel_unavailable");
    } finally { clearTimeout(timer); }
  }

  /** Re-send Cakto's own approved-payment email to the address stored on the
   * paid order. Never accept a recipient, never resend access or charge. */
  async resendApprovedEmail(paymentId: string, transport: typeof fetch = fetch): Promise<void> {
    const clientId = this.env.FMCC_CAKTO_RECEIPT_CLIENT_ID;
    const clientSecret = this.env.FMCC_CAKTO_RECEIPT_CLIENT_SECRET;
    if (!clientId || !clientSecret || !REF.test(paymentId))
      throw new Error("cakto.receipt_unavailable");
    const key = oauthKey("receipt", clientId, clientSecret);
    let token: string | undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    async function json(path: string, init: RequestInit) {
      const response = await transport("https://api.cakto.com.br/public_api/" + path, {
        ...init, redirect: "error", cache: "no-store", signal: controller.signal,
      });
      if (response.status === 401) invalidateOAuthToken(transport, key, token);
      if (!response.ok || !response.body) throw new Error("cakto.receipt_unavailable");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for (;;) {
        const {done,value} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 64 * 1024) {
          await reader.cancel().catch(() => undefined);
          throw new Error("cakto.receipt_unavailable");
        }
        chunks.push(value);
      }
      const parsed: unknown = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("cakto.receipt_unavailable");
      return parsed as Record<string,unknown>;
    }
    try {
      token = await getOAuthToken(transport, key, () => json("token/", {method:"POST",
        headers:{"content-type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({client_id:clientId,client_secret:clientSecret})}));
      const result = await json("orders/" + paymentId + "/resend_approved_email/", {
        method:"POST", headers:{authorization:"Bearer " + token},
      });
      if (typeof result.detail !== "string" || !result.detail.trim())
        throw new Error("cakto.receipt_unavailable");
      // Only HTTP 2xx + the documented acknowledgement shape. This does NOT
      // prove mail delivery, settle a payment, or change a subscription.
    } catch { throw new Error("cakto.receipt_unavailable"); }
    finally { clearTimeout(timer); }
  }

  /** Independent authenticated readback. Never persist/log the API body (buyer PII).
   * A signed event is only an observation: current provider state must agree.
   * A stale approval after a terminal reversal is never treated as a payment.
   */
  async confirmFinancialEvent(event: PaymentEvent, sourceEvent: string, transport: typeof fetch = fetch):
    Promise<{ event: PaymentEvent; evidence: string } | null> {
    const clientId=this.env.FMCC_CAKTO_READ_CLIENT_ID;
    const clientSecret=this.env.FMCC_CAKTO_READ_CLIENT_SECRET;
    if(!clientId||!clientSecret||!event.paymentRef||!REF.test(event.paymentRef)||!REF.test(event.subscriptionRef))
      throw new Error("cakto.readback_unavailable");
    const expectedType= ["purchase_approved","subscription_renewed","subscription_late_recovered"].includes(sourceEvent)?"payment_confirmed":
      ["refund","chargeback"].includes(sourceEvent)?"payment_refunded":
      ["subscription_late","subscription_renewal_refused"].includes(sourceEvent)?"payment_overdue":
      sourceEvent==="subscription_canceled"?"subscription_cancelled":null;
    if(expectedType!==event.type||(event.offerInterval==="one_time"&&!["purchase_approved","refund","chargeback"].includes(sourceEvent)))
      throw new Error("cakto.readback_binding_invalid");
    if(clientId===this.env.FMCC_CAKTO_RECEIPT_CLIENT_ID ||
      clientSecret===this.env.FMCC_CAKTO_RECEIPT_CLIENT_SECRET ||
      clientSecret===this.env.FMCC_CAKTO_WEBHOOK_SECRET)
      throw new Error("cakto.readback_binding_invalid");
    const offers=this.offers.filter(o=>o.planCode===event.offerPlanCode&&o.interval===event.offerInterval);
    if(offers.length!==1) throw new Error("cakto.readback_binding_invalid");
    const offer=offers[0];
    const key=oauthKey("read",clientId,clientSecret);
    let token:string|undefined;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),8000);
    const read=async(path:string, init:RequestInit):Promise<Record<string,unknown>>=>{
      const response=await transport("https://api.cakto.com.br/public_api/"+path,{
        ...init,redirect:"error",cache:"no-store",signal:controller.signal});
      if(response.status===401) invalidateOAuthToken(transport,key,token);
      if(!response.ok||!response.body) throw new Error("cakto.readback_unavailable");
      const reader=response.body.getReader();
      const chunks:Uint8Array[]=[];let total=0;
      for(;;){const {done,value}=await reader.read();if(done)break;
        total+=value.byteLength;if(total>262144){await reader.cancel().catch(()=>undefined);throw new Error("cakto.readback_unavailable");}
        chunks.push(value);}
      const obj:unknown=JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
      if(!obj||typeof obj!=="object"||Array.isArray(obj))throw new Error("cakto.readback_unavailable");
      return obj as Record<string,unknown>;
    };
    const money=(v:unknown)=>{
      const text=typeof v==="number"||typeof v==="string"?String(v):"";
      if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(text))return null;
      const [a,b=""]=text.split(".");return Number(a)*100+Number(b.padEnd(2,"0"));
    };
    const date=(v:unknown)=>{
      if(typeof v!=="string"||!Number.isFinite(Date.parse(v))||Date.parse(v)>Date.now()+300000)
        throw new Error("cakto.readback_timestamp_invalid");
      return new Date(v);
    };
    try {
      token=await getOAuthToken(transport,key,()=>read("token/",{method:"POST",
        headers:{"content-type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({client_id:clientId,client_secret:clientSecret})}));
      const headers={authorization:"Bearer "+token};
      const order=await read("orders/"+event.paymentRef+"/",{method:"GET",headers});
      const product=order.product as {id?:unknown}|null;
      if(order.id!==event.paymentRef||order.sck!==event.subscriptionRef||order.offer_type!=="main"||
        order.currency!=="BRL"||product?.id!==offer.productId||
        order.type!==(offer.interval==="one_time"?"unique":"subscription")||
        money(order.amount)!==offer.amountMinor)
        throw new Error("cakto.readback_binding_invalid");
      // Order GET has checkoutUrl but does not guarantee an offer object.
      // Bind the approved hosted checkout path, not arbitrary query parameters.
      const url=typeof order.checkoutUrl==="string"?new URL(order.checkoutUrl):null;
      const configured=new URL(offer.checkoutUrl);
      if(!url||url.origin!==configured.origin||url.pathname!==configured.pathname||url.username||url.password||
        this.offers.filter(o=>o.productId===offer.productId&&new URL(o.checkoutUrl).pathname===configured.pathname).length!==1)
        throw new Error("cakto.readback_binding_invalid");
      let subscriptionStatus:unknown=null;
      let subscriptionId:unknown=null;
      if(offer.interval!=="one_time"){
        if(typeof order.subscription!=="string"||!REF.test(order.subscription))throw new Error("cakto.readback_binding_invalid");
        const sub=await read("subscriptions/"+order.subscription+"/",{method:"GET",headers});
        if(sub.id!==order.subscription||sub.product!==offer.productId||sub.offer!==offer.offerId||
          typeof sub.parent_order!=="string"||!REF.test(sub.parent_order)||
          (sub.parent_order!==event.paymentRef&&(!Array.isArray(sub.orders)||!sub.orders.includes(event.paymentRef)))||
          (sourceEvent==="purchase_approved"&&sub.parent_order!==event.paymentRef))
          throw new Error("cakto.readback_binding_invalid");
        // For a renewal prove the original order is anchored to this invoice.
        if(sub.parent_order!==event.paymentRef){
          const parent=await read("orders/"+sub.parent_order+"/",{method:"GET",headers});
          const parentProduct=parent.product as {id?:unknown}|null;
          if(parent.id!==sub.parent_order||parent.sck!==event.subscriptionRef||
            parent.subscription!==order.subscription||parentProduct?.id!==offer.productId)
            throw new Error("cakto.readback_binding_invalid");
        }
        subscriptionId=sub.id;subscriptionStatus=sub.status;
      }else if(order.subscription!==null) throw new Error("cakto.readback_binding_invalid");
      let occurredAt:Date;
      if(event.type==="payment_confirmed"){
        if(["refunded","chargedback","canceled"].includes(String(order.status)))return null;
        if(order.status!=="paid")throw new Error("cakto.readback_not_confirmed");
        if(offer.interval!=="one_time"&&subscriptionStatus==="canceled")return null;
        if(offer.interval!=="one_time"&&subscriptionStatus!=="active")
          throw new Error("cakto.readback_not_confirmed");
        occurredAt=date(order.paidAt);
      }else if(event.type==="payment_refunded"){
        if(order.status!==(sourceEvent==="chargeback"?"chargedback":"refunded"))
          throw new Error("cakto.readback_not_confirmed");
        occurredAt=date(sourceEvent==="chargeback"?order.chargedbackAt:order.refundedAt);
      }else if(event.type==="payment_overdue"){
        if(subscriptionStatus==="active"&&order.status==="paid")return null;
        if(subscriptionStatus!=="late"||!["refused","blocked","waiting_payment","retrying","canceled"].includes(String(order.status)))
          throw new Error("cakto.readback_not_confirmed");
        occurredAt=date(order.createdAt);
      }else {
        if(subscriptionStatus!=="canceled")throw new Error("cakto.readback_not_confirmed");
        occurredAt=date(order.createdAt);
      }
      const confirmed={...event,occurredAt};
      const evidence=createHash("sha256").update(JSON.stringify([event.paymentRef,event.subscriptionRef,
        offer.offerId,offer.productId,offer.amountMinor,order.status,subscriptionId,subscriptionStatus,
        occurredAt.toISOString()])).digest("hex");
      return {event:confirmed,evidence};
    }catch(e){
      if(e instanceof Error&&/^cakto\.readback_(binding_invalid|timestamp_invalid|not_confirmed|unavailable)$/.test(e.message))throw e;
      throw new Error("cakto.readback_unavailable");
    }finally{clearTimeout(timer);}
  }

  async findSubscriptionByReference(reference: string): Promise<ProviderSubscription | null> {
    // This adapter never creates a remote subscription by POST. No remote recovery needed.
    void reference;
    return null;
  }

  async cancelSubscription(_subscriptionRef: string): Promise<void> {
    // Never say "cancelled" until cancellation has been acknowledged by Cakto.
    throw new PaymentProviderError("cakto.cancel_requires_provider_confirmation", "rejected");
  }

  verifyWebhook(headers: Headers, rawBody: string): PaymentEvent | null {
    const secret = this.env.FMCC_CAKTO_WEBHOOK_SECRET;
    if (!secret || secret.length < 24) throw new WebhookRejectedError("webhook.not_configured");
    // The dashboard's connectivity fixtures can use the documented body secret.
    // Only notifications with NO financial effect can use this compatibility path.
    // A partial/invalid/stale HMAC is never eligible for body-secret fallback.
    if (!headers.has("x-cakto-timestamp") && !headers.has("x-cakto-signature")) {
      let body: unknown;
      try { body = JSON.parse(rawBody); } catch { throw new WebhookRejectedError("webhook.signature_invalid"); }
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new WebhookRejectedError("webhook.signature_invalid");
      const envelope = body as Record<string, unknown>;
      if (typeof envelope.event !== "string" ||
          !["pix_gerado", "boleto_gerado", "checkout_abandonment"].includes(envelope.event))
        throw new WebhookRejectedError("webhook.signature_invalid", "hmac_required");
      if (typeof envelope.secret !== "string")
        throw new WebhookRejectedError("webhook.signature_invalid", "body_secret_missing");
      const received = createHash("sha256").update(envelope.secret, "utf8").digest();
      const configured = createHash("sha256").update(secret, "utf8").digest();
      if (!timingSafeEqual(received, configured))
        throw new WebhookRejectedError("webhook.signature_invalid", "body_secret_mismatch");
      // Deliberately do not return a PaymentEvent, even if fixture data says paid.
      return null;
    }
    const timestamp = headers.get("x-cakto-timestamp") ?? "";
    const signature = headers.get("x-cakto-signature") ?? "";
    if (!headers.has("x-cakto-timestamp") || !headers.has("x-cakto-signature"))
      throw new WebhookRejectedError("webhook.signature_invalid", "partial_headers");
    if (!/^\d{10}$/.test(timestamp) || !/^v1=[0-9a-f]{64}$/i.test(signature))
      throw new WebhookRejectedError("webhook.signature_invalid", "header_format");
    if (Math.abs(this.now().getTime() / 1000 - Number(timestamp)) > 300)
      throw new WebhookRejectedError("webhook.signature_invalid", "timestamp_outside_window");
    const expected = "v1=" + createHmac("sha256", secret).update(timestamp + ".").update(rawBody).digest("hex");
    if (!timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected)))
      throw new WebhookRejectedError("webhook.signature_invalid", "hmac_mismatch");
    let body: unknown;
    try { body = JSON.parse(rawBody); } catch { throw new WebhookRejectedError("webhook.body_invalid"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new WebhookRejectedError("webhook.body_invalid");
    const envelope = body as Record<string, unknown>;
    if (typeof envelope.event !== "string") throw new WebhookRejectedError("webhook.body_invalid");
    // V2 can send multiple orders; accept only independently validated main items.
    const records = Array.isArray(envelope.data) ? envelope.data : [envelope.data];
    if (records.length !== 1) return null; // batch requires its own atomic processing; never pick first arbitrarily
    const order = records[0];
    if (!order || typeof order !== "object" || Array.isArray(order)) return null;
    const data = order as Record<string, unknown>;
    if (data.offer_type !== "main" || !REF.test(String(data.sck ?? "")) ||
        typeof data.id !== "string" || !/^[A-Za-z0-9_-]{6,128}$/.test(data.id)) return null;
    const offer = data.offer as { id?: unknown } | undefined;
    const product = data.product as { id?: unknown } | undefined;
    const matched = this.offers.find(x => x.offerId === offer?.id && x.productId === product?.id);
    if (!matched || data.currency !== "BRL") return null;
    const event = envelope.event;
    const monetary = typeof data.amount === "number" && Number.isFinite(data.amount) && data.amount >= 0
      ? Math.round(data.amount * 100) : null;
    // Never activate a wrong-price offer, even from a correctly signed webhook.
    const isPaid = event === "purchase_approved" || event === "subscription_renewed" || event === "subscription_late_recovered";
    if (isPaid && (data.status !== "paid" || monetary !== matched.amountMinor)) return null;
    const type: PaymentEvent["type"] | null =
      isPaid ? "payment_confirmed" :
      ["subscription_late", "subscription_renewal_refused"].includes(event) ? "payment_overdue" :
      ["refund", "chargeback"].includes(event) ? "payment_refunded" :
      event === "subscription_canceled" ? "subscription_cancelled" : null;
    if (!type) return null;
    const dateStr = type === "payment_confirmed" ? data.paidAt : type === "payment_refunded" ? (data.refundedAt ?? data.chargedbackAt) : data.createdAt;
    const occurredAt = typeof dateStr === "string" && Number.isFinite(Date.parse(dateStr)) ? new Date(dateStr) : this.now();
    // Two payment-success events for the same order are one cycle, never two.
    const tag = type === "payment_confirmed" ? "pay" : type === "payment_overdue" ? "late" : type === "payment_refunded" ? "refund" : "cancel";
    return {eventId: tag + ":" + data.id, type, subscriptionRef: data.sck as string,
      paymentRef: data.id, amount: type === "payment_confirmed" ? { amountMinor: monetary!, currency: "BRL" } : null, occurredAt, offerInterval: matched.interval, offerPlanCode: matched.planCode};
  }
}
