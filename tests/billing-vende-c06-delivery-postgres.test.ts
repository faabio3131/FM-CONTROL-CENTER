/** Fully synthetic HTTPS responses; real SQL/claim/outbox/finance fences.
 * No Evolution, Assistant HTTP service, real gateway or deployment.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,describe,it,expect } from "vitest";
import pg from "pg";
import { GovernedVendeC06Service } from "../src/application/billing/vende-c06-governed-execution";
import {
  dispatchVendeDelinquencyOnce,reconcileUnknownVendeDelinquency,
  quarantineAbandonedVendeClaims,
} from "../src/application/billing/vende-c06-delivery";

const database=process.env.DATABASE_URL??"";
const tenant="fm-c06-delivery-"+randomUUID();
const pool=new pg.Pool({connectionString:database,max:3,allowExitOnIdle:true});
const context={tenantId:tenant,userId:"fm-owner",role:"owner" as const,correlationId:"c06-delivery"};
const config={
  organizationId:tenant,assistantOrigin:"https://assistant.example.test",
  keyId:"fm-test-key",signingKey:"synthetic-command-assistant-commercial-key-for-tests",
};
let productId:string,customerId:string,gatewayId:string;
const json=(data:object)=>new Response(JSON.stringify(data),{
  status:200,headers:{"Content-Type":"application/json"},
});

async function makePending(){
  const sub=await pool.query(
    "INSERT INTO fmcc_billing_subscription(tenant_id,product_id,customer_id,plan_code,status) VALUES ($1,$2,$3,'BASE','active') RETURNING id",
    [tenant,productId,customerId],
  );
  const subscriptionId=sub.rows[0].id as string;
  const inv=await pool.query(
    "INSERT INTO fmcc_billing_invoice(tenant_id,product_id,customer_id,subscription_id,gateway_account_id,amount_minor,status) VALUES ($1,$2,$3,$4,$5,15900,'pending') RETURNING id",
    [tenant,productId,customerId,subscriptionId,gatewayId],
  );
  const invoiceId=inv.rows[0].id as string;
  await pool.query(
    "INSERT INTO fmcc_vende_contract_terms(tenant_id,product_id,subscription_id,customer_id,revision,effective_from,paid_through,due_date,auto_renew,lifecycle_state,source_ref,actor_id) VALUES ($1,$2,$3,$4,1,'2026-09-01','2026-10-01','2026-10-02',true,'active','fm-reviewed-term','fm-owner')",
    [tenant,productId,subscriptionId,customerId],
  );
  await pool.query(
    "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'unpaid_verified',$4,'signed-provider-readback')",
    [tenant,invoiceId,"fresh-"+randomUUID(),new Date()],
  );
  const operationId="hold-"+randomUUID();
  const out=await new GovernedVendeC06Service().requestSuspension(
    context,{userId:"fm-owner",verifiedAt:new Date()},
    {productId,subscriptionId,invoiceId,expectedRevision:1,
      operationId,sourceRef:"fm-reviewed-delivery"},
    new Date(),
  );
  expect(out.state).toBe("pending");
  const cmd=await pool.query(
    "SELECT id,source_invoice_id FROM fmcc_vende_lifecycle_command WHERE tenant_id=$1 AND operation_id=$2",
    [tenant,operationId],
  );
  expect(cmd.rows[0].source_invoice_id).toBe(invoiceId);
  return {id:cmd.rows[0].id as string,invoiceId,subscriptionId,operationId};
}

describe("C06 commercial dispatcher: one-shot, signed snapshot and no false ACK",()=>{
  beforeAll(async()=>{
    const url=new URL(database);
    if(!["localhost","127.0.0.1"].includes(url.hostname) ||
       !["/fmcc","/fmcc_billing_ci"].includes(url.pathname) ||
       process.env.NODE_ENV!=="test")throw Error("isolated_postgres_required");
    process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID=tenant;
    process.env.FM_COMMAND_VENDE_C06_DELIVERY_ENABLED="true";
    productId=(await pool.query(
      "INSERT INTO fmcc_product_definition(tenant_id,slug,name) VALUES ($1,'vendeatendeia','Delivery CI') RETURNING id",[tenant])).rows[0].id;
    customerId=(await pool.query(
      "INSERT INTO fmcc_billing_customer(tenant_id,external_customer_id) VALUES ($1,$2) RETURNING id",
      [tenant,"ci-"+randomUUID()])).rows[0].id;
    gatewayId=(await pool.query(
      "INSERT INTO fmcc_billing_gateway_account(tenant_id,provider,environment,label,secret_ref,status) VALUES ($1,'asaas','sandbox','delivery','secret://synthetic','enabled') RETURNING id",
      [tenant])).rows[0].id;
    await pool.query(
      "INSERT INTO fmcc_billing_customer_binding(tenant_id,product_id,customer_id,external_tenant_id) VALUES ($1,$2,$3,$4)",
      [tenant,productId,customerId,"assistant-delivery-"+randomUUID()],
    );
    await pool.query(
      "INSERT INTO fmcc_vende_business_calendar(tenant_id,product_id,region,revision,valid_from,valid_through,holidays,source_ref,actor_id) VALUES ($1,$2,'BR-SP',1,'2026-09-01','2026-12-31','[]','fm-official-calendar','fm-owner')",
      [tenant,productId],
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
    }finally{
      delete process.env.FM_COMMAND_VENDE_C06_DELIVERY_ENABLED;
      await pool.end();
    }
  });
  it("delivers at most once and marks suspended only after a signed ACK and fresh finance check",async()=>{
    const cmd=await makePending();
    const calls:string[]=[];
    let remoteApplied=false;
    const http=(async(url:RequestInfo|URL)=>{
      const path=new URL(String(url)).pathname;
      calls.push(path);
      if(path.endsWith("/commercial-status"))return json({
        tenant_id:(await pool.query(
          "SELECT external_tenant_id FROM fmcc_billing_customer_binding WHERE tenant_id=$1",[tenant],
        )).rows[0].external_tenant_id,
        operation_status:remoteApplied?"applied":"not_applied",
        applied_action:remoteApplied?"SUSPEND_DELINQUENCY":null,
        license_status:remoteApplied?"suspended":"active",
        plan_code:"BASE",plan_revision:1,
        valid_until:Math.floor(Date.now()/1000)+86400*5,
      });
      if(path.endsWith("/commercial-transition")){
        remoteApplied=true;
        return json({status:"suspended"});
      }
      throw Error("untrusted route");
    }) as typeof fetch;
    expect(await dispatchVendeDelinquencyOnce(cmd.id,config,http)).toBe("delivered");
    expect(calls).toHaveLength(3);
    const state=(await pool.query(
      "SELECT lifecycle_state FROM fmcc_vende_contract_terms WHERE tenant_id=$1 AND subscription_id=$2",
      [tenant,cmd.subscriptionId])).rows[0];
    expect(state.lifecycle_state).toBe("suspended");
    const delivery=(await pool.query(
      "SELECT state,delivered_at FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0];
    expect(delivery.state).toBe("delivered");
    expect(delivery.delivered_at).not.toBeNull();
    await expect(dispatchVendeDelinquencyOnce(cmd.id,config,http)).rejects.toThrow();
    expect(calls).toHaveLength(3);
  });
  it("payment reversal during network I/O remains UNKNOWN; recovery cannot falsely confirm",async()=>{
    const cmd=await makePending();
    let calls=0;
    const http=(async(url:RequestInfo|URL)=>{
      const path=new URL(String(url)).pathname;
      calls++;
      if(path.endsWith("/commercial-status"))return json({
        tenant_id:(await pool.query(
          "SELECT external_tenant_id FROM fmcc_billing_customer_binding WHERE tenant_id=$1",[tenant],
        )).rows[0].external_tenant_id,
        operation_status:calls===1?"not_applied":"applied",
        applied_action:calls===1?null:"SUSPEND_DELINQUENCY",
        license_status:calls===1?"active":"suspended",
        plan_code:"BASE",plan_revision:1,
        valid_until:Math.floor(Date.now()/1000)+86400*5,
      });
      if(path.endsWith("/commercial-transition")){
        await pool.query("UPDATE fmcc_billing_invoice SET status='paid' WHERE id=$1",[cmd.invoiceId]);
        return json({status:"suspended"});
      }
      throw Error("untrusted route");
    }) as typeof fetch;
    expect(await dispatchVendeDelinquencyOnce(cmd.id,config,http)).toBe("unknown");
    const state=(await pool.query(
      "SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0];
    expect(state.state).toBe("unknown");
    const term=(await pool.query(
      "SELECT lifecycle_state FROM fmcc_vende_contract_terms WHERE subscription_id=$1",
      [cmd.subscriptionId])).rows[0];
    expect(term.lifecycle_state).toBe("suspension_pending");
    expect(await reconcileUnknownVendeDelinquency(cmd.id,config,http)).toBe("unknown");
    expect(calls).toBe(4); // signed readback after mutation + recovery; no second mutation
  });
  it("payment confirmed during status read blocks mutation before it reaches Assistant",async()=>{
    const cmd=await makePending();
    let readCount=0,mutationCount=0;
    const external=(await pool.query(
      "SELECT external_tenant_id FROM fmcc_billing_customer_binding WHERE tenant_id=$1",
      [tenant],
    )).rows[0].external_tenant_id as string;
    const http=(async(url:RequestInfo|URL)=>{
      const path=new URL(String(url)).pathname;
      if(path.endsWith("/commercial-status")){
        readCount++;
        // Concurrent provider reconciliation wins during remote status I/O.
        await pool.query("UPDATE fmcc_billing_invoice SET status='paid' WHERE id=$1",
          [cmd.invoiceId]);
        return json({
          tenant_id:external,operation_status:"not_applied",applied_action:null,
          license_status:"active",plan_code:"BASE",plan_revision:1,
          valid_until:Math.floor(Date.now()/1000)+86400*5,
        });
      }
      if(path.endsWith("/commercial-transition")){
        mutationCount++;
        throw Error("a paid tenant must never receive this POST");
      }
      throw Error("unknown path");
    }) as typeof fetch;
    expect(await dispatchVendeDelinquencyOnce(cmd.id,config,http)).toBe("unknown");
    expect([readCount,mutationCount]).toEqual([1,0]);
    const row=(await pool.query(
      "SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id],
    )).rows[0];
    expect(row.state).toBe("unknown");
    const term=(await pool.query(
      "SELECT lifecycle_state FROM fmcc_vende_contract_terms WHERE subscription_id=$1",
      [cmd.subscriptionId],
    )).rows[0];
    expect(term.lifecycle_state).toBe("suspension_pending");
  });
  it("forged HTTP 200 without correlated Assistant status proof never suspends",async()=>{
    const cmd=await makePending();
    let postCount=0,statusCount=0;
    const external=(await pool.query(
      "SELECT external_tenant_id FROM fmcc_billing_customer_binding WHERE tenant_id=$1",
      [tenant],
    )).rows[0].external_tenant_id as string;
    const http=(async(url:RequestInfo|URL)=>{
      const path=new URL(String(url)).pathname;
      if(path.endsWith("/commercial-status")){
        statusCount++;
        return json({
          tenant_id:external,operation_status:"not_applied",applied_action:null,
          license_status:"active",plan_code:"BASE",plan_revision:1,
          valid_until:Math.floor(Date.now()/1000)+86400*5,
        });
      }
      if(path.endsWith("/commercial-transition")){
        postCount++;
        return json({status:"suspended"}); // Untrusted optimistic ACK!
      }
      throw Error("wrong-path");
    }) as typeof fetch;
    expect(await dispatchVendeDelinquencyOnce(cmd.id,config,http)).toBe("unknown");
    expect([postCount,statusCount]).toEqual([1,2]);
    const state=(await pool.query(
      "SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id],
    )).rows[0];
    expect(state.state).toBe("unknown");
    const term=(await pool.query(
      "SELECT lifecycle_state FROM fmcc_vende_contract_terms WHERE subscription_id=$1",
      [cmd.subscriptionId],
    )).rows[0];
    expect(term.lifecycle_state).toBe("suspension_pending");
  });
  it("forged cross-tenant readback never confirms an HTTP 200 ACK",async()=>{
    const cmd=await makePending();
    let statusCount=0;
    const http=(async(url:RequestInfo|URL)=>{
      const path=new URL(String(url)).pathname;
      if(path.endsWith("/commercial-status")){
        statusCount++;
        return json({
          tenant_id:statusCount===1
            ? (await pool.query(
              "SELECT external_tenant_id FROM fmcc_billing_customer_binding WHERE tenant_id=$1",
              [tenant],
            )).rows[0].external_tenant_id : "attacker-tenant",
          operation_status:statusCount===1?"not_applied":"applied",
          applied_action:statusCount===1?null:"SUSPEND_DELINQUENCY",
          license_status:statusCount===1?"active":"suspended",
          plan_code:"BASE",plan_revision:1,
          valid_until:Math.floor(Date.now()/1000)+86400*5,
        });
      }
      if(path.endsWith("/commercial-transition"))return json({status:"suspended"});
      throw Error("wrong-path");
    }) as typeof fetch;
    expect(await dispatchVendeDelinquencyOnce(cmd.id,config,http)).toBe("unknown");
    expect(statusCount).toBe(2);
  });
  it("upgrades existing evidence without losing rows in an isolated rollback transaction",async()=>{
    const client=await pool.connect();
    const schema="evidence_migration_"+randomUUID().replaceAll("-","");
    try{
      await client.query("BEGIN");
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET LOCAL search_path TO ${schema},public`);
      await client.query("CREATE TABLE fmcc_vende_payment_attestation (LIKE public.fmcc_vende_payment_attestation INCLUDING DEFAULTS)");
      await client.query("ALTER TABLE fmcc_vende_payment_attestation DROP COLUMN observation_sequence");
      await client.query("CREATE UNIQUE INDEX fmcc_vende_payment_attestation_ref_uq ON fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref)");
      const invoice=randomUUID();
      const args=[tenant,invoice,"same-provider-payment",new Date()];
      await client.query("INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'unpaid_verified',$4,'before-migration')",args);
      await client.query(readFileSync(new URL("../drizzle/0016_vende_payment_observation_history.sql",import.meta.url),"utf8"));
      await client.query("INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'settled_verified',$4,'after-migration')",args);
      const result=await client.query("SELECT outcome,observation_sequence FROM fmcc_vende_payment_attestation ORDER BY observation_sequence");
      expect(result.rows.map(row=>row.outcome)).toEqual(["unpaid_verified","settled_verified"]);
      expect(result.rows.every(row=>BigInt(row.observation_sequence)>0n)).toBe(true);
    }finally{
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("preserves repeated observations of one payment and blocks suspension after settlement",async()=>{
    const cmd=await makePending();
    const original=(await pool.query(
      "SELECT external_payment_ref FROM fmcc_vende_payment_attestation WHERE tenant_id=$1 AND invoice_id=$2",
      [tenant,cmd.invoiceId],
    )).rows[0].external_payment_ref;
    const at=new Date();
    const insert="INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref,created_at) VALUES ($1,$2,$3,$4,$5,$6,$5) RETURNING observation_sequence::text";
    const unpaid=await pool.query(insert,[tenant,cmd.invoiceId,original,"unpaid_verified",at,"observation-unpaid"]);
    const settled=await pool.query(insert,[tenant,cmd.invoiceId,original,"settled_verified",at,"observation-settled"]);
    expect(BigInt(settled.rows[0].observation_sequence)).toBeGreaterThan(BigInt(unpaid.rows[0].observation_sequence));
    // Idempotency is per observation, not per payment. Conflicting replay also fails.
    await expect(pool.query(insert,[tenant,cmd.invoiceId,original,"unpaid_verified",at,"observation-settled"]))
      .rejects.toMatchObject({code:"23505"});
    // A late-arriving older readback must not replace the newest evidence.
    await pool.query(insert,[tenant,cmd.invoiceId,original,"unpaid_verified",new Date(at.getTime()-1000),"late-old-observation"]);
    let networkCalls=0;
    await expect(dispatchVendeDelinquencyOnce(cmd.id,config,(async()=>{
      networkCalls++;return json({});
    }) as typeof fetch,at)).rejects.toThrow();
    expect(networkCalls).toBe(0);
    const rows=(await pool.query(
      "SELECT outcome FROM fmcc_vende_payment_attestation WHERE tenant_id=$1 AND invoice_id=$2 ORDER BY verified_at DESC,created_at DESC,observation_sequence DESC",
      [tenant,cmd.invoiceId],
    )).rows;
    expect(rows).toHaveLength(4);
    expect(rows[0].outcome).toBe("settled_verified");
    const pending=(await pool.query("SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0];
    expect(pending.state).toBe("pending");
  });

  it("quarantines orphaned in-flight claims without re-sending a message",async()=>{
    const cmd=await makePending();
    await pool.query(
      "UPDATE fmcc_vende_lifecycle_command SET state='processing',claimed_at=$1 WHERE id=$2",
      [new Date(Date.now()-20*60_000),cmd.id],
    );
    expect(await quarantineAbandonedVendeClaims(config,new Date(),5)).toBe(1);
    const latest=(await pool.query(
      "SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0];
    expect(latest.state).toBe("unknown");
    expect(await quarantineAbandonedVendeClaims(config,new Date(),5)).toBe(0);
  });

});
