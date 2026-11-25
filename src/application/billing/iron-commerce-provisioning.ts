import { quoteIronPlanChange } from "@/application/billing/iron-plan-change-quote";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { CaktoIronProductBilling } from "@/application/billing/cakto-iron-product-billing";
import { CaktoPaymentProvider } from "@/infrastructure/subscription/cakto-payment-provider";
import { PostgresProductBillingAuthorityRepository } from "@/infrastructure/billing/postgres-product-billing-authority-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const IDEM = /^[a-zA-Z0-9._:-]{8,127}$/;

export function verifyIronCommerceBearer(authorization: string | null, expected: string | undefined): boolean {
  if (!expected || expected.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const received = authorization.slice(7);
  if (received.length < 32 || received.length > 255) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}

/**
 * Commercial eligibility is independent of operational entitlement.
 * SUSPENDED is allowed only for a uniquely proven, already-expired original
 * trial; all unknown/admin/finance suspensions remain blocked.
 */
export function eligibleIronCheckoutSubscription(
  subscription: Record<string, unknown>,
  trials: unknown, gymId: string, expectedSubscriptionId: string, now = Date.now(),
): boolean {
  if (subscription.tenant_id !== gymId || subscription.external_id !== expectedSubscriptionId)
    return false;
  if (subscription.status === "ACTIVE") return true;
  if (subscription.status !== "SUSPENDED" ||
      typeof subscription.effective_until !== "string" ||
      !Number.isFinite(Date.parse(subscription.effective_until)) ||
      Date.parse(subscription.effective_until) > now ||
      !Array.isArray(trials)) return false;
  return trials.filter((trial: unknown) => {
    if (!trial || typeof trial !== "object" || Array.isArray(trial)) return false;
    const v = trial as Record<string, unknown>;
    return v.tenant_id === gymId && v.subscription_id === expectedSubscriptionId &&
      v.status === "expired" && v.ends_at === subscription.effective_until &&
      typeof v.ends_at === "string" && Number.isFinite(Date.parse(v.ends_at)) &&
      Date.parse(v.ends_at) <= now;
  }).length === 1;
}

export interface IronCommerceRequest {
  gymId: string;
  expectedSubscriptionId: string;
  planCode: string;
  idempotencyKey: string;
}
export class IronCommerceProvisioning {
  constructor(
    private readonly env: Record<string, string | undefined> = process.env,
    private readonly transport: typeof fetch = fetch,
    private readonly provider = new PostgresProductBillingAuthorityRepository(),
  ) {}

  private config() {
    const productId = this.env.FMCC_IRON_PRODUCT_ID ?? "";
    const tenantId = this.env.FMCC_IRON_BILLING_TENANT_ID ?? "";
    const base = this.env.FMCC_IRON_CONTROL_PLANE_URL ?? "";
    const token = this.env.FMCC_IRON_CONTROL_PLANE_TOKEN ?? "";
    if (!UUID.test(productId) || !/^[A-Za-z0-9._:-]{3,128}$/.test(tenantId) || token.length < 32)
      throw new Error("iron.commerce_configuration_missing");
    const url = new URL(base);
    if (url.protocol !== "https:" || url.hostname !== "api.ironfitcore.com.br" ||
      url.pathname !== "/api/v1/control-plane/fmcc" || url.search || url.hash ||
      url.username || url.password) throw new Error("iron.commerce_control_plane_invalid");
    return { productId, tenantId, base: url.toString().replace(/\/$/, ""), token };
  }

  private async fetchControl(url: string, token: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await this.transport(url, {
        method: "GET", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { authorization: "Bearer " + token, "x-correlation-id": "checkout-preflight-" + randomUUID() },
      });
      if (!response.ok) throw new Error("iron.commerce_control_plane_unavailable");
      return await response.json();
    } finally { clearTimeout(timer); }
  }

  async offers(): Promise<Array<{planCode: string; name: string; interval: "monthly" | "yearly"; amountMinor: number; currency: "BRL"}>> {
    const conf = this.config();
    const route = await this.provider.getRoute(conf.tenantId, conf.productId);
    if (!route || route.status !== "enabled" || route.provider !== "cakto" ||
      route.environment !== "production") return [];
    const catalog = await this.fetchControl(conf.base + "/plan-versions", conf.token) as { plans?: unknown };
    if (!Array.isArray(catalog?.plans)) throw new Error("iron.commerce_plan_catalog_invalid");
    const published = new Set(catalog.plans
      .filter((v: unknown) => v && typeof v === "object" && !Array.isArray(v))
      .map((v: unknown) => {
        const p = v as { plan_code?: unknown; version?: unknown };
        return typeof p.plan_code === "string" && typeof p.version === "number" && Number.isSafeInteger(p.version)
          ? p.plan_code + ":" + p.version : null;
      }).filter((key: unknown): key is string => typeof key === "string"));
    // Each immutable commercial offer (including monthly/yearly variants) must
    // map to an independently published canonical IRON plan/version.
    const bindings = await this.provider.listIronCommerceMappings(conf.tenantId, conf.productId);
    const mapped = new Map(bindings.map(b => [b.commercialPlanCode, b]));
    // Construction validates the Cakto seller's hosted offer URLs and IDs at startup.
    const provider = new CaktoPaymentProvider(this.env);
    const plans = await this.provider.listPlans(conf.tenantId, conf.productId);
    return plans.filter(p => {
      const binding = mapped.get(p.planCode);
      return p.status === "active" && !!binding &&
        published.has(binding.ironPlanCode + ":" + binding.ironPlanVersion) &&
        provider.hasExactlyOneOffer(p.amountMinor, p.interval === "monthly" ? "month" : "year", p.planCode);
    }).map(p => ({ planCode:p.planCode, name:p.name, interval:p.interval,
        amountMinor:p.amountMinor, currency: "BRL" as const }));
  }

  /**
   * Read-only client status. Verify the signed IRON control-plane ownership
   * before looking up any FMCC customer binding. Never infer paid/active
   * status from a checkout redirect or provider payment record.
   */
  async current(input: Pick<IronCommerceRequest, "gymId" | "expectedSubscriptionId"> & { targetPlanCode?: string }) {
    if (!UUID.test(input.gymId) || !UUID.test(input.expectedSubscriptionId))
      throw new Error("iron.commerce_input_invalid");
    const conf = this.config();
    const snapshot = await this.fetchControl(conf.base + "/snapshot", conf.token);
    const subscriptions = (snapshot as { subscriptions?: unknown } | null)?.subscriptions;
    if (!Array.isArray(subscriptions)) throw new Error("iron.commerce_control_plane_invalid_response");
    const owned = subscriptions.filter((s: unknown) => {
      if (!s || typeof s !== "object" || Array.isArray(s)) return false;
      const v = s as Record<string, unknown>;
      return v.tenant_id === input.gymId && v.external_id === input.expectedSubscriptionId;
    });
    if (owned.length !== 1) throw new Error("iron.commerce_subscription_invalid");
    const data = await this.provider.readIronCommerceCustomer(conf.tenantId, conf.productId, input.gymId);
    let schedule: { nextPaymentAt: string | null; observedAt: string } | null = null;
    if (data.scheduleAnchor && data.subscription?.status === "active" &&
        this.env.FMCC_CAKTO_READ_CLIENT_ID && this.env.FMCC_CAKTO_READ_CLIENT_SECRET) {
      try {
        schedule = await new CaktoPaymentProvider(this.env).readSubscriptionSchedule(data.scheduleAnchor, this.transport);
      } catch {
        // Canonical local history remains readable when the read-only provider is offline.
      }
    }
    let changeQuote: ReturnType<typeof quoteIronPlanChange> | undefined;
    if (input.targetPlanCode !== undefined) {
      const anchor = data.scheduleAnchor;
      if (!CODE.test(input.targetPlanCode) || data.subscription?.status !== "active" ||
          !anchor || anchor.planCode !== data.subscription.planCode || !data.subscription.interval)
        throw new Error("iron.plan_change_unavailable");
      const matches = (await this.offers()).filter(p => p.planCode === input.targetPlanCode);
      if (matches.length !== 1) throw new Error("iron.plan_change_unavailable");
      changeQuote = quoteIronPlanChange({
        planCode: anchor.planCode, amountMinor: anchor.amountMinor, interval: data.subscription.interval,
      }, matches[0], schedule);
    }
    return {
      authority: "FM_COMMAND" as const,
      productCode: "IRON_FIT_CORE" as const,
      gymId: input.gymId,
      source: "FM_COMMAND_CANONICAL" as const,
      ...(changeQuote ? { changeQuote } : {}),
      checkedAt: new Date().toISOString(),
      subscription: data.subscription ? { ...data.subscription,
        nextPaymentAt: schedule?.nextPaymentAt ?? null,
        scheduleObservedAt: schedule?.observedAt ?? null,
        caktoManagementAvailable: data.caktoManagementAvailable === true,
      } : null,
      invoices: data.invoices.map(({gatewayProvider,gatewayEnvironment,gatewayStatus,...invoice})=>({
        ...invoice,receiptReference: invoice.status === "paid" && invoice.recordedPaymentStatus === "received" &&
          gatewayProvider === "cakto" && gatewayEnvironment === "production" && gatewayStatus === "enabled" &&
          this.env.FMCC_CAKTO_RECEIPT_CLIENT_ID && this.env.FMCC_CAKTO_RECEIPT_CLIENT_SECRET ? invoice.invoiceId : null,
      })),
      historyTruncated: data.historyTruncated,
      settlementConfirmedByThisView: false as const,
    };
  }

  async resendReceipt(input: {gymId:string;expectedSubscriptionId:string;invoiceId:string;actorId:string;requestId:string}) {
    if (![input.gymId,input.expectedSubscriptionId,input.invoiceId,input.actorId,input.requestId].every(x=>UUID.test(x)) ||
        !this.env.FMCC_CAKTO_RECEIPT_CLIENT_ID || !this.env.FMCC_CAKTO_RECEIPT_CLIENT_SECRET)
      throw new Error("iron.receipt_unavailable");
    const conf=this.config();
    const snapshot=await this.fetchControl(conf.base+"/snapshot",conf.token);
    const subscriptions=(snapshot as {subscriptions?:unknown}|null)?.subscriptions;
    if(!Array.isArray(subscriptions)||subscriptions.filter((s:unknown)=>{
      if(!s||typeof s!=="object"||Array.isArray(s)) return false;
      const row=s as Record<string,unknown>;
      return row.tenant_id===input.gymId && row.external_id===input.expectedSubscriptionId;
    }).length!==1) throw new Error("iron.receipt_unavailable");
    const provider=new CaktoPaymentProvider(this.env);
    const paymentId=await this.provider.reserveIronReceipt({
      tenantId:conf.tenantId,productId:conf.productId,gymId:input.gymId,invoiceId:input.invoiceId,
      actorId:input.actorId,requestId:input.requestId,
    });
    await provider.resendApprovedEmail(paymentId,this.transport);
    return {productCode:"IRON_FIT_CORE" as const, provider:"CAKTO" as const,
      status:"EMAIL_RESEND_ACCEPTED" as const,deliveryConfirmed:false as const};
  }

  async prepare(input: IronCommerceRequest): Promise<{ checkoutUrl: string; invoiceId: string; productCode: "IRON_FIT_CORE" }> {
    if (!UUID.test(input.gymId) || !UUID.test(input.expectedSubscriptionId) ||
        !CODE.test(input.planCode) || !IDEM.test(input.idempotencyKey))
      throw new Error("iron.commerce_input_invalid");
    const conf = this.config();
    const [snapshot, planList, bindings] = await Promise.all([
      this.fetchControl(conf.base + "/snapshot", conf.token),
      this.fetchControl(conf.base + "/plan-versions", conf.token),
      this.provider.listIronCommerceMappings(conf.tenantId, conf.productId),
    ]);
    if (!snapshot || typeof snapshot !== "object" || !planList || typeof planList !== "object")
      throw new Error("iron.commerce_control_plane_invalid_response");
    const subscriptions = (snapshot as { subscriptions?: unknown }).subscriptions;
    const plans = (planList as { plans?: unknown }).plans;
    if (!Array.isArray(subscriptions) || !Array.isArray(plans))
      throw new Error("iron.commerce_control_plane_invalid_response");
    const owned = subscriptions.filter((s: unknown) => {
      if (!s || typeof s !== "object" || Array.isArray(s)) return false;
      const v = s as Record<string, unknown>;
      return v.tenant_id === input.gymId && v.external_id === input.expectedSubscriptionId;
    });
    if (owned.length !== 1) throw new Error("iron.commerce_subscription_invalid");
    const current = owned[0] as Record<string, unknown>;
    if (!eligibleIronCheckoutSubscription(
      current, (snapshot as { trials?: unknown }).trials, input.gymId, input.expectedSubscriptionId,
    )) throw new Error("iron.commerce_subscription_invalid");
    const matches = bindings.filter(b => b.commercialPlanCode === input.planCode);
    if (matches.length !== 1) throw new Error("iron.commerce_plan_mapping_unavailable");
    const binding = matches[0];
    const published = plans.some((s: unknown) => s && typeof s === "object" && !Array.isArray(s) &&
      (s as Record<string, unknown>).plan_code === binding.ironPlanCode &&
      (s as Record<string, unknown>).version === binding.ironPlanVersion);
    if (!published) throw new Error("iron.commerce_plan_not_published");
    const route=await this.provider.getRoute(conf.tenantId,conf.productId);
    const matchingPlans=(await this.provider.listPlans(conf.tenantId,conf.productId))
      .filter(p=>p.planCode===input.planCode && p.status==="active" && p.currency==="BRL");
    if (!route || route.provider!=="cakto" || route.environment!=="production" || route.status!=="enabled" ||
        matchingPlans.length!==1 || !new CaktoPaymentProvider(this.env).hasExactlyOneOffer(
          matchingPlans[0].amountMinor,matchingPlans[0].interval==="monthly"?"month":"year",input.planCode))
      throw new Error("iron.commerce_offer_not_ready");
    const hash = createHash("sha256").update(JSON.stringify({
      productId: conf.productId, externalTenantId: input.gymId, planCode: input.planCode,
    })).digest("hex");
    const invoice = await this.provider.prepareSubscriptionInvoice({
      tenantId: conf.tenantId, productId: conf.productId,
      externalTenantId: input.gymId, planCode: input.planCode,
      idempotencyKey: input.idempotencyKey, payloadHash: hash,
    });
    if (invoice.gatewayProvider !== "cakto" || invoice.gatewayEnvironment !== "production")
      throw new Error("iron.commerce_provider_not_live");
    const checkoutUrl = await new CaktoIronProductBilling(this.env).checkoutUrl(invoice.invoiceId);
    return { checkoutUrl, invoiceId: invoice.invoiceId, productCode: "IRON_FIT_CORE" };
  }
}
