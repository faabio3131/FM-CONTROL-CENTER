import { PostgresProductBillingAuthorityRepository } from "@/infrastructure/billing/postgres-product-billing-authority-repository";
import { pool } from "@/infrastructure/db/client";
import { processDueIronPlanChange } from "./iron-plan-change-worker";
import type { Authorization, IronPlanChangePorts, Payment } from "./iron-plan-change";

// The simulator is reachable only on the same machine as this disposable Command instance.
// Live billing needs its own verified payment/authorization adapters.
type Renewal = Awaited<ReturnType<IronPlanChangePorts["readTargetRenewal"]>>;
let controller: AbortController | undefined;
let running: Promise<void> | undefined;

export function startIronPlanChangeSandbox() {
  if (running) return;
  const database = new URL(process.env.DATABASE_URL ?? "");
  const tenantId = process.env.FMCC_IRON_BILLING_TENANT_ID;
  const productId = process.env.FMCC_IRON_PRODUCT_ID;
  const token = process.env.FMCC_IRON_CONTROL_PLANE_TOKEN;
  const providerToken = process.env.FMCC_IRON_SANDBOX_PROVIDER_TOKEN;
  if (process.env.NODE_ENV === "production" || !["localhost","127.0.0.1"].includes(database.hostname) ||
      database.pathname !== "/fmcc_cross_ci" || !tenantId || !productId ||
      !token || token.length < 32 || !providerToken || providerToken.length < 32 || token === providerToken)
    throw Error("iron.change_sandbox_configuration");
  const catalog = new PostgresProductBillingAuthorityRepository();
  const abort = new AbortController();
  const call = async <T>(path: string, body: unknown): Promise<T> => {
    const result = await fetch("http://127.0.0.1:18462/" + path, {method:"POST", redirect:"error",
      signal:AbortSignal.any([abort.signal,AbortSignal.timeout(8000)]),
      headers:{"content-type":"application/json",authorization:"Bearer "+providerToken},
      body:JSON.stringify({tenantId,productId,body})});
    if (!result.ok) throw Error("iron.sandbox_provider_unavailable");
    return await result.json() as T;
  };
  const ports: Omit<IronPlanChangePorts,"differenceInvoice"> = {
    bindChange: async () => { /* The worker claims an immutable, tenant-bound request. */ },
    readAuthorization: change => call<Authorization|null>("authorization", change),
    readPayment: invoice => call<Payment|null>("payment", invoice),
    replaceRenewal: async (change, authorization, allowSwitch) => {
      await call("replace", {change,authorization,allowSwitch});
    },
    readTargetRenewal: change => call<Renewal>("renewal",change),
    applyLicense: async change => {
      const mappings = await catalog.listIronCommerceMappings(tenantId, productId);
      const mapping = mappings.find(m => m.commercialPlanCode === change.quote.targetPlanCode);
      if (!mapping) throw Error("iron.sandbox_plan_unbound");
      const response = await fetch("http://127.0.0.1:3333/api/v1/control-plane/fmcc/subscription/commands",{
        method:"POST", redirect:"error", signal:AbortSignal.any([abort.signal,AbortSignal.timeout(8000)]),
        headers:{authorization:"Bearer "+token,"content-type":"application/json","idempotency-key":"iron-change-"+change.changeId,
          "x-correlation-id":change.changeId},
        body:JSON.stringify({action:"subscription.plan.transition",gymId:change.gymId,
          expectedSubscriptionId:change.sourceSubscriptionId,commercialStatus:"active",planCode:mapping.ironPlanCode,
          planVersion:mapping.ironPlanVersion,transitionKind:change.quote.effectiveOn==="NEXT_RENEWAL"?"DOWNGRADE":"UPGRADE",
          reason:"Sandbox payment reconciled for change "+change.changeId})});
      if (!response.ok) throw Error("iron.sandbox_license_failed");
    },
  };
  controller=abort;
  running=(async () => {
    while (!abort.signal.aborted) {
      try {
        const now = new Date(await call<string>("clock",null));
        if (!Number.isFinite(now.getTime())) throw Error("iron.sandbox_invalid_clock");
        await processDueIronPlanChange(pool,{tenantId,productId},ports,now);
      } catch {
        if (!abort.signal.aborted) console.warn("iron.plan_change_sandbox_tick_failed");
      }
      if (!abort.signal.aborted) await new Promise(resolve=>setTimeout(resolve,1000));
    }
  })();
}

export async function stopIronPlanChangeSandbox() {
  controller?.abort();
  await running;
  controller=undefined;
  running=undefined;
}
