import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import pg from "pg";
import { GovernedVendeC06Service } from "../src/application/billing/vende-c06-governed-execution";

const dbUrl=process.env.DATABASE_URL??"";
const tenant="fm-c06-life-"+randomUUID();
const pool=new pg.Pool({connectionString:dbUrl,max:4,allowExitOnIdle:true});
const clock=new Date("2026-10-20T20:00:00.000Z");
const ctx={tenantId:tenant,userId:"fm-owner",role:"owner" as const,correlationId:"life-test"};
const settledPaymentRef="provider-"+randomUUID();
const proof={userId:"fm-owner",verifiedAt:clock};
let productId:string,customerId:string,gw:string;
let cancelSubscription:string,reactivateSubscription:string,reactivateInvoice:string;

async function createContract(status:"active"|"suspended",autoRenew:boolean){
  const sub=await pool.query(
    "INSERT INTO fmcc_billing_subscription(tenant_id,product_id,customer_id,plan_code,status) VALUES ($1,$2,$3,'PLUS','active') RETURNING id",
    [tenant,productId,customerId],
  );
  const id=sub.rows[0].id as string;
  await pool.query(
    "INSERT INTO fmcc_vende_contract_terms(tenant_id,product_id,subscription_id,customer_id,revision,effective_from,paid_through,due_date,auto_renew,lifecycle_state,source_ref,actor_id) VALUES ($1,$2,$3,$4,1,'2026-10-01','2026-11-15','2026-11-16',$5,$6,'human-reviewed-contract','fm-owner')",
    [tenant,productId,id,customerId,autoRenew,status],
  );
  return id;
}

describe("C06 - contract lifecycle CAS, supervised cancellation and reactivation",()=>{
  beforeAll(async()=>{
    const parsed=new URL(dbUrl);
    if(!["localhost","127.0.0.1"].includes(parsed.hostname) ||
       !["/fmcc","/fmcc_billing_ci"].includes(parsed.pathname) ||
       process.env.NODE_ENV!=="test")throw Error("isolated_postgres_required");
    process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID=tenant;
    productId=(await pool.query(
      "INSERT INTO fmcc_product_definition(tenant_id,slug,name) VALUES ($1,'vendeatendeia','Vende lifecycle') RETURNING id",[tenant])).rows[0].id;
    customerId=(await pool.query(
      "INSERT INTO fmcc_billing_customer(tenant_id,external_customer_id) VALUES ($1,$2) RETURNING id",
      [tenant,"external-"+randomUUID()])).rows[0].id;
    gw=(await pool.query(
      "INSERT INTO fmcc_billing_gateway_account(tenant_id,provider,environment,label,secret_ref,status) VALUES ($1,'asaas','sandbox','lifecycle','secret://synthetic','enabled') RETURNING id",[tenant])).rows[0].id;
    await pool.query(
      "INSERT INTO fmcc_billing_customer_binding(tenant_id,product_id,customer_id,external_tenant_id) VALUES ($1,$2,$3,$4)",
      [tenant,productId,customerId,"assistant-life-"+randomUUID()],
    );
    cancelSubscription=await createContract("active",true);
    reactivateSubscription=await createContract("suspended",false);
    reactivateInvoice=(await pool.query(
      "INSERT INTO fmcc_billing_invoice(tenant_id,product_id,customer_id,subscription_id,gateway_account_id,amount_minor,status) VALUES ($1,$2,$3,$4,$5,14900,'paid') RETURNING id",
      [tenant,productId,customerId,reactivateSubscription,gw])).rows[0].id;
    await pool.query(
      "INSERT INTO fmcc_billing_provider_payment(tenant_id,invoice_id,gateway_account_id,external_payment_id,status) VALUES ($1,$2,$3,$4,'received')",
      [tenant,reactivateInvoice,gw,settledPaymentRef],
    );
  });
  afterAll(async()=>{
    try{
      for(const tab of [
        "fmcc_vende_lifecycle_command","fmcc_vende_contract_term_audit",
        "fmcc_vende_payment_attestation","fmcc_vende_business_calendar",
        "fmcc_vende_contract_terms","fmcc_billing_provider_payment",
        "fmcc_billing_invoice","fmcc_billing_subscription",
        "fmcc_billing_customer_binding","fmcc_billing_gateway_account",
        "fmcc_billing_customer","fmcc_product_definition",
      ])await pool.query(`DELETE FROM ${tab} WHERE tenant_id=$1`,[tenant]);
    }finally{await pool.end();}
  });
  it("FM non-renewal is exactly once, retains paid access and cannot claim remote ACK",async()=>{
    const svc=new GovernedVendeC06Service();
    const input={productId,subscriptionId:cancelSubscription,expectedRevision:1,
      operationId:"cancel-2026-"+randomUUID(),customerConsentRef:"fm-human-verified-cancel"};
    const results=await Promise.allSettled([
      svc.scheduleCancellation(ctx,proof,input,clock),
      svc.scheduleCancellation(ctx,proof,input,clock),
    ]);
    expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);
    expect(results.filter(x=>x.status==="rejected")).toHaveLength(1);
    const result=results.find(x=>x.status==="fulfilled");
    if(!result||result.status!=="fulfilled")throw Error("missing cancellation");
    expect(result.value).toMatchObject({
      state:"cancel_at_period_end",paidAccessUntil:"2026-11-15",
      autoRenew:false,remoteEntitlementConfirmed:false,revision:2,
    });
    const term=(await pool.query(
      "SELECT lifecycle_state,auto_renew,paid_through::text,revision FROM fmcc_vende_contract_terms WHERE tenant_id=$1 AND subscription_id=$2",
      [tenant,cancelSubscription])).rows[0];
    expect(term).toMatchObject({
      lifecycle_state:"cancel_at_period_end",auto_renew:false,
      paid_through:"2026-11-15",revision:2,
    });
    const out=(await pool.query(
      "SELECT action,state,effective_date::text FROM fmcc_vende_lifecycle_command WHERE tenant_id=$1 AND subscription_id=$2",
      [tenant,cancelSubscription])).rows;
    expect(out).toEqual([{action:"SCHEDULE_CANCEL",state:"pending",effective_date:"2026-11-15"}]);
    await expect(svc.scheduleCancellation(ctx,proof,input,clock)).rejects.toThrow();
    const history=await svc.contractHistory(ctx,{productId,subscriptionId:cancelSubscription});
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({snapshotStatus:"captured",termsSnapshot:{
      schema:"fm.vende.contract-terms.v1",
      before:{revision:1,lifecycleState:"active",autoRenew:true,paidThrough:"2026-11-15"},
      after:{revision:2,lifecycleState:"cancel_at_period_end",autoRenew:false,paidThrough:"2026-11-15"},
    }});
    await pool.query("UPDATE fmcc_vende_contract_terms SET paid_through='2026-12-15' WHERE tenant_id=$1 AND subscription_id=$2",[tenant,cancelSubscription]);
    expect((await svc.contractHistory(ctx,{productId,subscriptionId:cancelSubscription})).items).toEqual(history.items);
  });
  it("regularization fails closed on absent or stale settlement, never revives cancelled",async()=>{
    const svc=new GovernedVendeC06Service();
    const input={productId,subscriptionId:reactivateSubscription,
      paidInvoiceId:reactivateInvoice,expectedRevision:1,
      operationId:"reactivate-2026-"+randomUUID(),sourceRef:"fm-verified-settlement"};
    await expect(svc.requestRegularization(ctx,proof,input,clock))
      .rejects.toThrow("attestation_stale");
    await pool.query(
      "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'settled_verified',$4,'signed-gateway-stale')",
      [tenant,reactivateInvoice,settledPaymentRef,new Date("2026-10-19T20:00:00Z")],
    );
    await expect(svc.requestRegularization(ctx,proof,input,clock))
      .rejects.toThrow("attestation_stale");
    await pool.query(
      "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'settled_verified',$4,'unrelated-payment-proof')",
      [tenant,reactivateInvoice,"unrelated-"+randomUUID(),clock],
    );
    await expect(svc.requestRegularization(ctx,proof,input,clock)).rejects.toThrow("attestation_stale");
    await pool.query(
      "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'settled_verified',$4,'signed-gateway-readback')",
      [tenant,reactivateInvoice,settledPaymentRef,clock],
    );
    const result=await svc.requestRegularization(ctx,proof,input,clock);
    expect(result).toMatchObject({
      state:"reactivation_pending",revision:2,remoteEntitlementConfirmed:false,
      preservedIds:{customerId,subscriptionId:reactivateSubscription},
    });
    const pending=await pool.query(
      "SELECT action,state FROM fmcc_vende_lifecycle_command WHERE tenant_id=$1 AND subscription_id=$2",
      [tenant,reactivateSubscription],
    );
    expect(pending.rows).toEqual([{action:"REACTIVATE_VERIFIED",state:"pending"}]);
    const term=(await pool.query(
      "SELECT lifecycle_state,revision FROM fmcc_vende_contract_terms WHERE tenant_id=$1 AND subscription_id=$2",
      [tenant,reactivateSubscription])).rows[0];
    expect(term).toMatchObject({lifecycle_state:"reactivation_pending",revision:2});
    expect((await svc.contractHistory(ctx,{productId,subscriptionId:reactivateSubscription})).items[0]).toMatchObject({
      termsSnapshot:{before:{revision:1,lifecycleState:"suspended"},after:{revision:2,lifecycleState:"reactivation_pending"}},
    });
    await expect(svc.requestRegularization(ctx,proof,input,clock)).rejects.toThrow();
  });
  it("scopes and paginates legacy history without inventing snapshots",async()=>{
    const svc=new GovernedVendeC06Service();const subscriptionId=await createContract("active",true);
    await pool.query(`INSERT INTO fmcc_vende_contract_term_audit
      (tenant_id,subscription_id,revision,operation_id,action,actor_id,new_state,effective_date,source_ref)
      SELECT $1,$2::uuid,n,'legacy-'||($2::uuid)::text||'-'||n,'SCHEDULE_CANCEL','fm-owner','active','2026-10-01','legacy'
      FROM generate_series(1,101) n`,[tenant,subscriptionId]);
    const first=await svc.contractHistory(ctx,{productId,subscriptionId});
    expect(first.items).toHaveLength(100);expect(first.nextBeforeRevision).toBe(2);
    expect(first.items.every(x=>x.termsSnapshot===null&&x.snapshotStatus==="historical_snapshot_unavailable")).toBe(true);
    const last=await svc.contractHistory(ctx,{productId,subscriptionId,beforeRevision:first.nextBeforeRevision!});
    expect(last.items.map(x=>x.revision)).toEqual([1]);expect(last.nextBeforeRevision).toBeNull();
    for(const input of [{productId:randomUUID(),subscriptionId},{productId,subscriptionId:randomUUID()},
      {productId,subscriptionId,beforeRevision:0}])await expect(svc.contractHistory(ctx,input)).rejects.toThrow();
    await expect(svc.contractHistory({...ctx,tenantId:"foreign"},{productId,subscriptionId})).rejects.toThrow();
    await expect(svc.contractHistory({...ctx,role:"viewer"},{productId,subscriptionId})).rejects.toThrow();
  });

});
