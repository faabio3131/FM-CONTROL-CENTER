import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pool } from "@/infrastructure/db/client";
import { IronBillingLedgerMaterializer } from "@/infrastructure/metrics/iron-billing-ledger-materializer";
import { IronAiCreditBilling } from "@/application/billing/iron-ai-credit-billing";
import { recoverBlockedIronAiCredit } from "@/application/billing/recover-blocked-iron-ai-credit";
import type { TenantContext } from "@/domain/security/tenant-context";

const enabled = process.env.FMCC_IRON_CREDITS_DB_CERTIFICATION === "YES" &&
  process.env.DATABASE_URL?.includes("/fmcc_billing_ci");
const dbIt = enabled ? it : it.skip;

describe("IRON paid AI credits V1 real isolated PostgreSQL, no external Cakto", () => {
  dbIt("serializes concurrent checkout; signed PAID/refund event grants once then revokes once", async () => {
    const tenant = "ci-iron-credit-" + randomUUID().slice(0, 12);
    const gym = randomUUID();
    const secret = "ci-only-credits-iron-" + "x".repeat(40);
    const product = await pool.query<{id:string}>(
      "INSERT INTO fmcc_product_definition(tenant_id,slug,name,status) VALUES($1,$2,'IRON credit CI','active') RETURNING id",
      [tenant, "iron"],
    );
    const productId=product.rows[0].id;
    const source=await pool.query<{id:string}>(
      "INSERT INTO fmcc_source_definition(tenant_id,product_id,name,source_type,authoritative_domain,sync_mode,secret_ref,mapping_version,config) VALUES($1,$2,'IRON FIT CORE Commercial','iron-commercial-v1','commercial','pull','env:FMCC_IRON_CONTROL_PLANE_TOKEN','iron-commercial-v1','{}'::jsonb) RETURNING id",
      [tenant,productId]);
    const metricScope={tenantId:tenant,productId,sourceId:source.rows[0].id,mappingVersion:"iron-commercial-v1"};
    const metric=new IronBillingLedgerMaterializer({FMCC_IRON_BILLING_TENANT_ID:tenant,FMCC_IRON_PRODUCT_ID:productId});
    const metrics=async()=>Object.fromEntries((await pool.query("SELECT metric_id,value FROM fmcc_metric_value WHERE tenant_id=$1 AND product_id=$2",[tenant,productId])).rows.map(x=>[x.metric_id,x.value]));
    const customer=await pool.query<{id:string}>(
      "INSERT INTO fmcc_billing_customer(tenant_id,external_customer_id) VALUES($1,$2) RETURNING id",
      [tenant,"credit-ci-"+randomUUID()],
    );
    const customerId=customer.rows[0].id;
    const gateway=await pool.query<{id:string}>(
      "INSERT INTO fmcc_billing_gateway_account(tenant_id,provider,environment,label,secret_ref,status) VALUES($1,'cakto','production','ci-credit','env://FMCC_CAKTO_WEBHOOK_SECRET','enabled') RETURNING id",
      [tenant],
    );
    const gatewayId=gateway.rows[0].id;
    await pool.query("INSERT INTO fmcc_billing_customer_binding(tenant_id,product_id,customer_id,external_tenant_id) VALUES($1,$2,$3,$4)",[tenant,productId,customerId,gym]);
    await pool.query("INSERT INTO fmcc_billing_product_plan(tenant_id,product_id,plan_code,name,interval,amount_minor,status) VALUES($1,$2,'IRON_START_M_2026','IRON START','monthly',14700,'active')",[tenant,productId]);
    await pool.query("INSERT INTO fmcc_billing_product_route(tenant_id,product_id,gateway_account_id,status) VALUES($1,$2,$3,'enabled')",[tenant,productId,gatewayId]);
    await pool.query(
      "INSERT INTO fmcc_billing_subscription(tenant_id,product_id,customer_id,plan_code,status,paid_through) VALUES($1,$2,$3,'IRON_START_M_2026','active',now()+interval '30 days')",
      [tenant,productId,customerId],
    );
    const env={
      FMCC_IRON_COMMERCIAL_SALES_ENABLED:"true",
      FMCC_IRON_BILLING_TENANT_ID:tenant,
      FMCC_IRON_PRODUCT_ID:productId,
      FMCC_CAKTO_WEBHOOK_SECRET:secret,
      FMCC_CAKTO_CHECKOUTS_JSON:JSON.stringify([
        {offerId:"iron_ai100_official_ci",productId:"iron_ai_ci",
          planCode:"IRON_AI_WORKOUT_100",checkoutUrl:"https://pay.cakto.com.br/ai100",
          amountMinor:1990,interval:"one_time"},
      ]),
    };
    const billing=new IronAiCreditBilling(env);
    const idem="ci-credit-"+randomUUID();
    const [first, replay] = await Promise.all([
      billing.prepareCheckout(gym,"IRON_AI_WORKOUT_100",idem),
      billing.prepareCheckout(gym,"IRON_AI_WORKOUT_100",idem),
    ]);
    expect(first.invoiceId).toBe(replay.invoiceId);
    const orderId=first.invoiceId;
    const counted=await pool.query<{n:number}>(
      "SELECT count(*)::int n FROM fmcc_iron_ai_credit_order WHERE tenant_id=$1 AND gym_id=$2",[tenant,gym]);
    expect(counted.rows[0].n).toBe(1);
    expect(await metric.materialize(metricScope)).toEqual({materialized:2});
    expect(await metrics()).toEqual({"subscription.active.count":"0","billing.gross_billed":"19.90"});
    const signed=(event:string,amount=19.9,payment="paid-credit-"+randomUUID().slice(0,8))=>{
      const raw=JSON.stringify({event,data:{
        id:payment,offer_type:"main",sck:orderId,status:event==="purchase_approved"?"paid":"refunded",
        amount,currency:"BRL",offer:{id:"iron_ai100_official_ci"},product:{id:"iron_ai_ci"},
        paidAt:new Date().toISOString(),
      }});
      const stamp=String(Math.floor(Date.now()/1000));
      return {raw,headers:new Headers({"x-cakto-timestamp":stamp,
        "x-cakto-signature":"v1="+createHmac("sha256",secret).update(stamp+"."+raw).digest("hex")})};
    };
    const payment="purchase_credit_ci_001";
    const wrong=signed("purchase_approved",1,payment);
    expect(await billing.handleWebhook(wrong.headers,wrong.raw)).toBe("ignored");
    const paid=signed("purchase_approved",19.9,payment);
    expect(await billing.handleWebhook(paid.headers,paid.raw)).toBe("applied");
    expect(await billing.handleWebhook(paid.headers,paid.raw)).toBe("duplicate");
    const refund=signed("refund",19.9,payment);
    expect(await billing.handleWebhook(refund.headers,refund.raw)).toBe("applied");
    expect(await billing.handleWebhook(refund.headers,refund.raw)).toBe("duplicate");
    const outcomes=await pool.query<{event_type:string,n:number}>(
      "SELECT event_type,count(*)::int n FROM fmcc_iron_ai_credit_outbox WHERE order_id=$1 GROUP BY event_type ORDER BY event_type",[orderId]);
    expect(outcomes.rows).toEqual([{event_type:"GRANT",n:1},{event_type:"REVOKE",n:1}]);
    const st=await pool.query<{status:string}>("SELECT status FROM fmcc_iron_ai_credit_order WHERE id=$1",[orderId]);
    expect(st.rows[0].status).toBe("refunded");
    // Add a prior-period order and a recurring face value. Refunds do not net
    // gross billed, and neither a credit nor its payment activates a subscription.
    const prior=await billing.prepareCheckout(gym,"IRON_AI_WORKOUT_100","ci-prior-"+randomUUID());
    await pool.query("UPDATE fmcc_iron_ai_credit_order SET created_at=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '1 day' WHERE id=$1",[prior.invoiceId]);
    await pool.query("INSERT INTO fmcc_billing_invoice(tenant_id,product_id,customer_id,subscription_id,gateway_account_id,amount_minor,status) SELECT tenant_id,product_id,customer_id,id,$2,14700,'pending' FROM fmcc_billing_subscription WHERE tenant_id=$1",[tenant,gatewayId]);
    await Promise.all([metric.materialize(metricScope),metric.materialize(metricScope)]);
    expect(await metrics()).toEqual({"subscription.active.count":"0","billing.gross_billed":"166.90"});
    expect(await metric.materialize({...metricScope,tenantId:tenant+"-foreign"})).toEqual({materialized:0});
    const blocked=await pool.query<{id:string}>(
      "UPDATE fmcc_iron_ai_credit_outbox SET status='blocked',attempts=12 WHERE order_id=$1 AND event_type='REVOKE' RETURNING id",[orderId]);
    const context={tenantId:tenant,userId:"ci-owner",role:"owner",correlationId:"ci-credit-recovery",
      permissions:["billing:write"]} as unknown as TenantContext;
    const outboxId=blocked.rows[0].id;
    await expect(recoverBlockedIronAiCredit({...context,tenantId:tenant+"-foreign"},productId,outboxId)).rejects.toThrow("iron.credits_recovery_scope_denied");
    expect(await recoverBlockedIronAiCredit(context,productId,outboxId)).toEqual({
      status:"retry",outboxId,previousAttempts:12,deliveryExecuted:false,
    });
    await expect(recoverBlockedIronAiCredit(context,productId,outboxId)).rejects.toThrow("iron.credits_recovery_not_ready");
    const recovered=await pool.query("SELECT status,attempts FROM fmcc_iron_ai_credit_outbox WHERE id=$1",[outboxId]);
    expect(recovered.rows[0]).toEqual({status:"retry",attempts:0});
    const foreign=await pool.query<{n:number}>(
      "SELECT count(*)::int n FROM fmcc_iron_ai_credit_order WHERE gym_id=$1 AND tenant_id<>$2",
      [gym,tenant]);
    expect(foreign.rows[0].n).toBe(0);
  });
});
