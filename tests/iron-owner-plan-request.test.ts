import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { processDueIronPlanChange } from "@/application/billing/iron-plan-change-worker";
import type { IronPlanChangePorts } from "@/application/billing/iron-plan-change";
import { POST } from "@/app/api/internal/iron/commerce/plan-change/route";
import { IronCommerceProvisioning } from "@/application/billing/iron-commerce-provisioning";
import { quoteIronPlanChange } from "@/application/billing/iron-plan-change-quote";
import { postPlanChange } from "@/infrastructure/billing/iron-plan-change-ledger";
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
    vi.stubEnv("FMCC_IRON_DIFFERENCE_CHANGE_SANDBOX", "true");
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
      const req = (await pool.query("SELECT * FROM fmcc_iron_plan_change_request WHERE id=$1",[a.requestId])).rows[0];
      const differentSource = {expectedSubscriptionId:randomUUID()};
      const secondPreview = await (await send(differentSource)).json();
      expect((await send({...differentSource,termsHash:secondPreview.termsHash})).status).toBe(409);
      const customer=(await pool.query("INSERT INTO fmcc_billing_customer(tenant_id,external_customer_id) VALUES($1,$2) RETURNING id",[tenant,randomUUID()])).rows[0].id;
      await pool.query("INSERT INTO fmcc_billing_customer_binding(tenant_id,product_id,customer_id,external_tenant_id) VALUES($1,$2,$3,$4)",[tenant,product,customer,body.gymId]);
      const gateway=(await pool.query("INSERT INTO fmcc_billing_gateway_account(tenant_id,provider,environment,label,secret_ref,status) VALUES($1,'cakto','production','QA','env://QA','enabled') RETURNING id",[tenant])).rows[0].id;
      const sub=(await pool.query("INSERT INTO fmcc_billing_subscription(tenant_id,product_id,customer_id,plan_code,status) VALUES($1,$2,$3,'START','active') RETURNING id",[tenant,product,customer])).rows[0].id;
      await pool.query("INSERT INTO fmcc_billing_invoice(id,tenant_id,product_id,customer_id,subscription_id,gateway_account_id,amount_minor,status) VALUES($1,$2,$3,$4,$5,$6,15000,'paid')",[req.id,tenant,product,customer,sub,gateway]);
      await pool.query("INSERT INTO fmcc_billing_provider_payment(tenant_id,invoice_id,gateway_account_id,external_payment_id,status) VALUES($1,$2,$3,'fixture-payment','received')",[tenant,req.id,gateway]);
      const clock = new Date(req.created_at.getTime()+1000);
      const applied = new Set<string>();
      const ports: IronPlanChangePorts = {
        bindChange: async c => { expect(c.changeId).toBe(a.requestId); },
        readAuthorization: async c => ({gymId:c.gymId,targetSubscriptionId:c.targetSubscriptionId,
          reference:"fixture-consent",amountMinor:29700,currency:"BRL",interval:"monthly",
          firstChargeAt:req.renewal_at.toISOString(),acceptedAt:clock.toISOString()}),
        differenceInvoice: async c => ({id:"fixture-invoice",gymId:c.gymId,changeId:c.changeId,amountMinor:15000,currency:"BRL"}),
        readPayment: async i => ({id:"fixture-payment",gymId:i.gymId,invoiceId:i.id,amountMinor:i.amountMinor,
          currency:i.currency,status:"paid",paidAt:clock.toISOString()}),
        applyLicense: async c => { applied.add(c.changeId); },
        replaceRenewal: async () => {},
        readTargetRenewal: async c => ({gymId:c.gymId,subscriptionId:c.targetSubscriptionId,paymentId:"fixture-renewal",
          amountMinor:29700,currency:"BRL",periodStart:req.renewal_at.toISOString(),paidAt:req.renewal_at.toISOString()}),
      };
      const scope = {tenantId:tenant,productId:product};
      const concurrent = await Promise.all([processDueIronPlanChange(pool,scope,ports,clock),processDueIronPlanChange(pool,scope,ports,clock)]);
      expect(concurrent.sort()).toEqual(["idle","renewal_scheduled"]);
      expect(await processDueIronPlanChange(pool,scope,ports,req.renewal_at)).toBe("completed");
      expect(await processDueIronPlanChange(pool,scope,ports,req.renewal_at)).toBe("idle");
      // Replay the same settled change in the disposable tenant after losing an acknowledgement.
      await pool.query("UPDATE fmcc_iron_plan_change_request SET status='awaiting_renewal',next_attempt_at=renewal_at WHERE id=$1",[req.id]);
      expect(await processDueIronPlanChange(pool,scope,ports,req.renewal_at)).toBe("completed");
      const canonical = await pool.query(`SELECT s.plan_code,i.amount_minor,i.period_end=s.paid_through AS same_period,p.external_payment_id
        FROM fmcc_billing_subscription s JOIN fmcc_billing_invoice i ON i.subscription_id=s.id
        JOIN fmcc_billing_provider_payment p ON p.invoice_id=i.id WHERE s.id=$1 AND i.period_end IS NOT NULL`,[sub]);
      expect(canonical.rows).toEqual([{plan_code:"GROWTH",amount_minor:"29700",same_period:true,external_payment_id:"fixture-renewal"}]);
      // An expired claim may be taken by another worker before the first one commits.
      const replay = () => pool.query("UPDATE fmcc_iron_plan_change_request SET status='awaiting_renewal',next_attempt_at=renewal_at WHERE id=$1",[req.id]);
      await replay();
      const leased = {...ports,readTargetRenewal: async (change: Parameters<typeof ports.readTargetRenewal>[0]) => {
        await pool.query("UPDATE fmcc_iron_plan_change_request SET lease_token=gen_random_uuid(),lease_until=renewal_at WHERE id=$1",[req.id]);
        return ports.readTargetRenewal(change);
      }};
      expect(await processDueIronPlanChange(pool,scope,leased,req.renewal_at)).toBe("lease_lost");
      // A matching payment reference with an incompatible period must quarantine the request before a new remote effect.
      await pool.query("UPDATE fmcc_billing_invoice SET period_end=NULL WHERE subscription_id=$1 AND period_end IS NOT NULL",[sub]);
      const mustNotDeliver=vi.fn();
      expect(await processDueIronPlanChange(pool,scope,{...ports,applyLicense:mustNotDeliver},req.renewal_at)).toBe("reconciliation_required");
      expect(mustNotDeliver).not.toHaveBeenCalled();
      expect((await pool.query("SELECT status,last_error FROM fmcc_iron_plan_change_request WHERE id=$1",[req.id])).rows)
        .toEqual([{status:"reconciliation_required",last_error:"iron.change_settlement_conflict"}]);
      expect(await processDueIronPlanChange(pool,scope,ports,new Date(req.renewal_at.getTime()+86400000))).toBe("idle");
      // Two historical Cakto gateways on one contract: use the accepted source invoice.
      const tx=await pool.connect();
      try {
        await tx.query("BEGIN");
        const rotated=(await tx.query("INSERT INTO fmcc_billing_gateway_account(tenant_id,provider,environment,label,secret_ref,status) VALUES($1,'cakto','production','rotated','env://QA2','enabled') RETURNING id",[tenant])).rows[0].id;
        const source=(await tx.query("INSERT INTO fmcc_billing_invoice(tenant_id,product_id,customer_id,subscription_id,gateway_account_id,amount_minor,status) VALUES($1,$2,$3,$4,$5,29700,'paid') RETURNING id",[tenant,product,customer,sub,rotated])).rows[0].id;
        await tx.query("INSERT INTO fmcc_billing_provider_payment(tenant_id,invoice_id,gateway_account_id,external_payment_id,status) VALUES($1,$2,$3,'rotated-origin','received')",[tenant,source,rotated]);
        const downQuote=quoteIronPlanChange({planCode:"GROWTH",amountMinor:29700,interval:"monthly"},
          {planCode:"START",amountMinor:14700,interval:"monthly"},{nextPaymentAt:req.renewal_at.toISOString(),observedAt:clock.toISOString()},
          {ironPlanCode:"IRON_START",ironPlanVersion:1,sourceInvoiceId:source});
        await postPlanChange(tx,scope,{changeId:randomUUID(),gymId:body.gymId,sourceSubscriptionId:req.source_subscription_id,
          targetSubscriptionId:req.target_subscription_id,quote:downQuote},{gymId:body.gymId,subscriptionId:req.target_subscription_id,
          paymentId:"rotation-renewal",amountMinor:14700,currency:"BRL",periodStart:req.renewal_at.toISOString(),paidAt:req.renewal_at.toISOString()},null);
        expect((await tx.query("SELECT gateway_account_id FROM fmcc_billing_provider_payment WHERE tenant_id=$1 AND external_payment_id='rotation-renewal'",[tenant])).rows).toEqual([{gateway_account_id:rotated}]);
      } finally {await tx.query("ROLLBACK");tx.release();}
      // A gateway from the wrong environment cannot post a paid upgrade.
      await pool.query("UPDATE fmcc_billing_gateway_account SET environment='sandbox' WHERE id=$1",[gateway]);
      await replay();
      expect(await processDueIronPlanChange(pool,scope,{...ports,applyLicense:mustNotDeliver},req.renewal_at)).toBe("reconciliation_required");
      expect((await pool.query("SELECT last_error FROM fmcc_iron_plan_change_request WHERE id=$1",[req.id])).rows[0].last_error).toBe("iron.change_gateway_ambiguous");
      expect(mustNotDeliver).not.toHaveBeenCalled();
      // Start a fresh transient failure sequence and verify each persisted deadline.
      await pool.query("UPDATE fmcc_iron_plan_change_request SET status='awaiting_renewal',next_attempt_at=renewal_at,retry_count=0 WHERE id=$1",[req.id]);
      const unavailable = {...ports,readAuthorization:async()=>{throw Error("provider offline");}};
      let attemptAt = req.renewal_at;
      for (let attempt=1;attempt<=6;attempt++) {
        const terminal=attempt===6;
        expect(await processDueIronPlanChange(pool,scope,unavailable,attemptAt)).toBe(terminal?"reconciliation_required":"retry_scheduled");
        const retry=(await pool.query("SELECT status,retry_count,last_error,next_attempt_at FROM fmcc_iron_plan_change_request WHERE id=$1",[req.id])).rows[0];
        expect(retry.status).toBe(terminal?"reconciliation_required":"awaiting_renewal");
        expect(retry.last_error).toBe("iron.change_dependency_failed");
        expect(retry.retry_count).toBe(attempt);
        expect(retry.next_attempt_at.getTime()-attemptAt.getTime()).toBe(60000*2**(attempt-1));
        expect(await processDueIronPlanChange(pool,scope,unavailable,attemptAt)).toBe("idle");
        attemptAt=retry.next_attempt_at;
      }
      expect(await processDueIronPlanChange(pool,scope,unavailable,attemptAt)).toBe("idle");
      expect(applied.size).toBe(1);
      expect((await pool.query("SELECT id FROM fmcc_iron_plan_change_request WHERE gym_id=$1",[body.gymId])).rowCount).toBe(1);
    } finally {stub.mockRestore();vi.unstubAllEnvs();}
});
