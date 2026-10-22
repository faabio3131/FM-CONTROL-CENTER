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
  reapproveVendeDelinquency,
} from "../src/application/billing/vende-c06-delivery";

import {dispatchVendeReactivationOnce,reconcileUnknownVendeReactivation,reapproveVendeReactivation} from "../src/application/billing/vende-reactivation-delivery";
import {dispatchVendeFinalCancellationOnce,reconcileUnknownVendeFinalCancellation,reapproveVendeFinalCancellation} from "../src/application/billing/vende-final-cancellation-delivery";
import {fmLocalCivilDate,fmPaidThroughExclusiveInstant} from "../src/domain/billing/vende-commercial-policy-v1";
import {readVendeClaimsMonitor} from "../src/application/billing/vende-commercial-claims-supervisor";
import {readVendeCompensationReviews,triageVendeCompensationRisk} from "../src/application/billing/vende-compensation-review";
import {observeVendeCompensationEvidence} from "../src/application/billing/vende-compensation-evidence-review";
import {prepareVendeCorrectionIntent,secondReviewVendeCorrectionIntent,queueReviewedVendeCorrection} from "../src/application/billing/vende-compensation-correction-intent";
import {readVendeCorrectionOutcome} from "../src/application/billing/vende-compensation-outcome";

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

async function makePending(verifiedAt:Date=new Date()){
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
  const paymentRef="provider-"+randomUUID();
  await pool.query(
    "INSERT INTO fmcc_billing_provider_payment(tenant_id,invoice_id,gateway_account_id,external_payment_id,status) VALUES ($1,$2,$3,$4,'pending')",
    [tenant,invoiceId,gatewayId,paymentRef],
  );
  await pool.query(
    "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'unpaid_verified',$4,'signed-provider-readback')",
    [tenant,invoiceId,paymentRef,new Date()],
  );
  const operationId="hold-"+randomUUID();
  const out=await new GovernedVendeC06Service().requestSuspension(
    context,{userId:"fm-owner",verifiedAt},
    {productId,subscriptionId,invoiceId,expectedRevision:1,
      operationId,sourceRef:"fm-reviewed-delivery"},
    new Date(),
  );
  expect(out.state).toBe("pending");
  const cmd=await pool.query(
    "SELECT id,source_invoice_id,approved_at FROM fmcc_vende_lifecycle_command WHERE tenant_id=$1 AND operation_id=$2",
    [tenant,operationId],
  );
  expect(cmd.rows[0].source_invoice_id).toBe(invoiceId);
  expect(cmd.rows[0].approved_at.getTime()).toBe(verifiedAt.getTime());
  return {id:cmd.rows[0].id as string,invoiceId,subscriptionId,operationId};
}

async function makeReactivation(){
  const original=await makePending();
  await pool.query("UPDATE fmcc_vende_lifecycle_command SET state='delivered' WHERE id=$1",[original.id]);
  const paidThrough=fmLocalCivilDate(new Date(Date.now()+30*86400_000));
  await pool.query("UPDATE fmcc_vende_contract_terms SET lifecycle_state='suspended',paid_through=$1 WHERE subscription_id=$2",[paidThrough,original.subscriptionId]);
  await pool.query("UPDATE fmcc_billing_invoice SET status='paid' WHERE id=$1",[original.invoiceId]);
  await pool.query("UPDATE fmcc_billing_provider_payment SET status='received' WHERE invoice_id=$1",[original.invoiceId]);
  const paymentRef=(await pool.query("SELECT external_payment_id FROM fmcc_billing_provider_payment WHERE invoice_id=$1",[original.invoiceId])).rows[0].external_payment_id as string;
  await pool.query("INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'settled_verified',$4,'synthetic-reactivation-settled')",[tenant,original.invoiceId,paymentRef,new Date()]);
  const operationId="reactivate-"+randomUUID();const approvedAt=new Date();
  await new GovernedVendeC06Service().requestRegularization(context,{userId:context.userId,verifiedAt:approvedAt},
    {productId,subscriptionId:original.subscriptionId,paidInvoiceId:original.invoiceId,expectedRevision:2,operationId,sourceRef:"fm-reviewed-regularization"});
  const id=(await pool.query("SELECT id FROM fmcc_vende_lifecycle_command WHERE tenant_id=$1 AND operation_id=$2",[tenant,operationId])).rows[0].id as string;
  const external=(await pool.query("SELECT external_tenant_id FROM fmcc_billing_customer_binding WHERE tenant_id=$1",[tenant])).rows[0].external_tenant_id as string;
  return {...original,id,operationId,approvedAt,paymentRef,external,validUntil:fmPaidThroughExclusiveInstant(paidThrough).getTime()/1000};
}


async function makeCancellation(paidThrough=fmLocalCivilDate(new Date(Date.now()-86400_000))){
  const scheduleAt=new Date(Date.now()-2*86400_000);
  const sub=(await pool.query(
    "INSERT INTO fmcc_billing_subscription(tenant_id,product_id,customer_id,plan_code,status) VALUES ($1,$2,$3,'BASE','active') RETURNING id",
    [tenant,productId,customerId])).rows[0].id as string;
  await pool.query(
    "INSERT INTO fmcc_vende_contract_terms(tenant_id,product_id,subscription_id,customer_id,revision,effective_from,paid_through,due_date,auto_renew,lifecycle_state,source_ref,actor_id) VALUES ($1,$2,$3,$4,1,'2026-09-01',$5,$5,true,'active','fm-accepted-contract','fm-owner')",
    [tenant,productId,sub,customerId,paidThrough]);
  const operationId="cancel-"+randomUUID();
  await new GovernedVendeC06Service().scheduleCancellation(context,{userId:context.userId,verifiedAt:scheduleAt},
    {productId,subscriptionId:sub,expectedRevision:1,operationId,customerConsentRef:"fm-recorded-customer-consent"},scheduleAt);
  const row=(await pool.query(
    "SELECT id,approved_at FROM fmcc_vende_lifecycle_command WHERE tenant_id=$1 AND operation_id=$2",
    [tenant,operationId])).rows[0];
  const external=(await pool.query("SELECT external_tenant_id FROM fmcc_billing_customer_binding WHERE tenant_id=$1",
    [tenant])).rows[0].external_tenant_id as string;
  return {id:row.id as string,approvedAt:row.approved_at as Date,
    subscriptionId:sub,operationId,external,validUntil:fmPaidThroughExclusiveInstant(paidThrough).getTime()/1000};
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
        "fmcc_audit_event",
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
    const originalApproval=new Date(Date.now()-240_000);
    const cmd=await makePending(originalApproval);
    const calls:string[]=[];
    let remoteApplied=false;
    const http=(async(url:RequestInfo|URL,init?:RequestInit)=>{
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
        expect(JSON.parse(String(init?.body)).approved_at).toBe(Math.floor(originalApproval.getTime()/1000));
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
  it("blocks absent, expired and future approval before claim or network, without fabricating a new date",async()=>{
    let calls=0;
    const http=(async()=>{calls++;throw Error("must not call");}) as typeof fetch;
    for(const approved of [null,new Date(Date.now()-301_000),new Date(Date.now()+60_000)]){
      const cmd=await makePending();
      await pool.query("UPDATE fmcc_vende_lifecycle_command SET approved_at=$1 WHERE id=$2",[approved,cmd.id]);
      await expect(dispatchVendeDelinquencyOnce(cmd.id,config,http)).rejects.toThrow();
      const row=(await pool.query("SELECT state,claimed_at,approved_at FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0];
      expect(row.state).toBe("pending");expect(row.claimed_at).toBeNull();
      expect(row.approved_at?.getTime()??null).toBe(approved?.getTime()??null);
    }
    expect(calls).toBe(0);
  });
  it("rechecks approval after status I/O and does not mutate if the original proof changed",async()=>{
    for(const drift of ["expiry","actor"]){
      const cmd=await makePending();let calls=0;
      const http=(async(url:RequestInfo|URL)=>{
        calls++;expect(new URL(String(url)).pathname).toMatch(/commercial-status$/);
        if(drift==="expiry")await pool.query("UPDATE fmcc_vende_lifecycle_command SET approved_at=$1 WHERE id=$2",[new Date(Date.now()-301_000),cmd.id]);
        else await pool.query("UPDATE fmcc_vende_lifecycle_command SET actor_id='changed-actor' WHERE id=$1",[cmd.id]);
        return json({tenant_id:(await pool.query("SELECT external_tenant_id FROM fmcc_billing_customer_binding WHERE tenant_id=$1",[tenant])).rows[0].external_tenant_id,
          operation_status:"not_applied",applied_action:null,license_status:"active",
          plan_code:"BASE",plan_revision:1,valid_until:Math.floor(Date.now()/1000)+86400});
      }) as typeof fetch;
      expect(await dispatchVendeDelinquencyOnce(cmd.id,config,http)).toBe("unknown");
      expect(calls).toBe(1);
      expect((await pool.query("SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0].state).toBe("unknown");
    }
  });
  it("allows read-only recovery of an unknown delivery after approval expires",async()=>{
    const cmd=await makePending();let calls=0;
    await pool.query("UPDATE fmcc_vende_lifecycle_command SET state='unknown',approved_at=$1 WHERE id=$2",[new Date(Date.now()-301_000),cmd.id]);
    const http=(async(url:RequestInfo|URL)=>{
      calls++;expect(new URL(String(url)).pathname).toMatch(/commercial-status$/);
      return json({tenant_id:(await pool.query("SELECT external_tenant_id FROM fmcc_billing_customer_binding WHERE tenant_id=$1",[tenant])).rows[0].external_tenant_id,
        operation_status:"applied",applied_action:"SUSPEND_DELINQUENCY",license_status:"suspended",
        plan_code:"BASE",plan_revision:1,valid_until:Math.floor(Date.now()/1000)+86400});
    }) as typeof fetch;
    expect(await reconcileUnknownVendeDelinquency(cmd.id,config,http)).toBe("delivered");
    expect(calls).toBe(1);
  });
  it("reapproves only a never-attempted intent, with one atomic audit under concurrency",async()=>{
    for(const prior of [null,new Date(Date.now()-301_000)]){
      const cmd=await makePending();
      await pool.query("UPDATE fmcc_vende_lifecycle_command SET approved_at=$1,actor_id='original-reviewer' WHERE id=$2",[prior,cmd.id]);
      const verifiedAt=new Date();const proof={userId:context.userId,verifiedAt};
      const input={productId,commandId:cmd.id,expectedApprovedAt:prior?.toISOString()??null};
      const results=await Promise.allSettled([reapproveVendeDelinquency(context,proof,input),reapproveVendeDelinquency(context,proof,input)]);
      expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
      const row=(await pool.query("SELECT state,claimed_at,approved_at,actor_id FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0];
      expect(row.state).toBe("pending");expect(row.claimed_at).toBeNull();
      expect(row.approved_at.getTime()).toBe(verifiedAt.getTime());expect(row.actor_id).toBe(context.userId);
      const logs=(await pool.query("SELECT metadata FROM fmcc_audit_event WHERE tenant_id=$1 AND resource_id=$2",[tenant,cmd.id])).rows;
      expect(logs).toHaveLength(1);expect(logs[0].metadata).toMatchObject({previousActorId:"original-reviewer",previousApprovedAt:prior?.toISOString()??null,approvedAt:verifiedAt.toISOString()});
      await expect(reapproveVendeDelinquency(context,proof,{...input,expectedApprovedAt:verifiedAt.toISOString()})).rejects.toThrow();
    }
  });
  it("denies reapproval for attempted, unknown, delivered, foreign, stale-proof or paid intents",async()=>{
    for(const mode of ["processing","unknown","delivered","blocked","claimed","paid","product","tenant","actor","stepup","cas","revision"]){
      const cmd=await makePending();const prior=new Date(Date.now()-301_000);
      await pool.query("UPDATE fmcc_vende_lifecycle_command SET approved_at=$1 WHERE id=$2",[prior,cmd.id]);
      if(["processing","unknown","delivered","blocked"].includes(mode))await pool.query("UPDATE fmcc_vende_lifecycle_command SET state=$1 WHERE id=$2",[mode,cmd.id]);
      if(mode==="claimed")await pool.query("UPDATE fmcc_vende_lifecycle_command SET claimed_at=now() WHERE id=$1",[cmd.id]);
      if(mode==="paid")await pool.query("UPDATE fmcc_billing_invoice SET status='paid' WHERE id=$1",[cmd.invoiceId]);
      if(mode==="revision")await pool.query("UPDATE fmcc_vende_contract_terms SET revision=revision+1 WHERE subscription_id=$1",[cmd.subscriptionId]);
      await expect(reapproveVendeDelinquency(mode==="tenant"?{...context,tenantId:"foreign"}:context,
        {userId:mode==="actor"?"foreign":context.userId,verifiedAt:mode==="stepup"?prior:new Date()},
        {commandId:cmd.id,productId:mode==="product"?randomUUID():productId,expectedApprovedAt:mode==="cas"?null:prior.toISOString()},
      )).rejects.toThrow();
      expect((await pool.query("SELECT approved_at FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0].approved_at.getTime()).toBe(prior.getTime());
      expect((await pool.query("SELECT count(*)::int AS n FROM fmcc_audit_event WHERE resource_id=$1",[cmd.id])).rows[0].n).toBe(0);
    }
  });
  it("rolls back approval when its audit cannot persist",async()=>{
    const cmd=await makePending();const prior=new Date(Date.now()-301_000);
    await pool.query("UPDATE fmcc_vende_lifecycle_command SET approved_at=$1 WHERE id=$2",[prior,cmd.id]);
    await expect(reapproveVendeDelinquency({...context,correlationId:null as unknown as string},
      {userId:context.userId,verifiedAt:new Date()},
      {productId,commandId:cmd.id,expectedApprovedAt:prior.toISOString()},
    )).rejects.toThrow();
    expect((await pool.query("SELECT approved_at FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0].approved_at.getTime()).toBe(prior.getTime());
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

  it("rejects missing, foreign-payment and foreign-gateway evidence before remote I/O",async()=>{
    const otherGateway=(await pool.query(
      "INSERT INTO fmcc_billing_gateway_account(tenant_id,provider,environment,label,secret_ref,status) VALUES ($1,'asaas','sandbox','other-evidence-account','secret://synthetic','enabled') RETURNING id",[tenant],
    )).rows[0].id;
    let calls=0;
    for(const mismatch of ["missing","payment","gateway","latest","paidstatus"]){
      const cmd=await makePending();
      if(mismatch==="missing")await pool.query("DELETE FROM fmcc_billing_provider_payment WHERE invoice_id=$1",[cmd.invoiceId]);
      if(mismatch==="payment")await pool.query("UPDATE fmcc_billing_provider_payment SET external_payment_id=$1 WHERE invoice_id=$2",["unrelated-"+randomUUID(),cmd.invoiceId]);
      if(mismatch==="gateway")await pool.query("UPDATE fmcc_billing_provider_payment SET gateway_account_id=$1 WHERE invoice_id=$2",[otherGateway,cmd.invoiceId]);
      if(mismatch==="latest")await pool.query(
        "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'unpaid_verified',$4,'latest-unrelated-proof')",
        [tenant,cmd.invoiceId,"unrelated-"+randomUUID(),new Date()],
      );
      if(mismatch==="paidstatus")await pool.query("UPDATE fmcc_billing_provider_payment SET status='received' WHERE invoice_id=$1",[cmd.invoiceId]);
      await expect(dispatchVendeDelinquencyOnce(cmd.id,config,(async()=>{calls++;return json({});}) as typeof fetch)).rejects.toThrow();
      const row=(await pool.query("SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0];
      expect(row.state).toBe("pending");
    }
    expect(calls).toBe(0);
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

  it("reactivates once with exact paid target, original approval and preserved identities",async()=>{
    const cmd=await makeReactivation();let applied=false,mutations=0,reads=0;
    const http=(async(url:RequestInfo|URL,init?:RequestInit)=>{
      if(new URL(String(url)).pathname.endsWith("/commercial-status")){
        reads++;return json({tenant_id:cmd.external,operation_status:applied?"applied":"not_applied",
          applied_action:applied?"REACTIVATE_VERIFIED":null,license_status:applied?"active":"suspended",
          plan_code:"BASE",plan_revision:1,valid_until:applied?cmd.validUntil:cmd.validUntil-86400});
      }
      mutations++;const body=JSON.parse(String(init?.body));
      expect(body).toMatchObject({action:"REACTIVATE_VERIFIED",tenant_id:cmd.external,
        command_request_id:cmd.operationId,target_valid_until:cmd.validUntil,verified_payment_ref:cmd.paymentRef,
        approved_at:Math.floor(cmd.approvedAt.getTime()/1000)});
      const fixed=(await pool.query("SELECT delivery_target FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0].delivery_target;
      expect(fixed).toMatchObject({validUntil:cmd.validUntil,paymentRef:cmd.paymentRef,termsRevision:3});
      applied=true;return json({status:"active"});
    }) as typeof fetch;
    const outcomes=await Promise.allSettled([dispatchVendeReactivationOnce(cmd.id,config,http),dispatchVendeReactivationOnce(cmd.id,config,http)]);
    expect(outcomes.filter(r=>r.status==="fulfilled"&&r.value==="delivered")).toHaveLength(1);
    expect(outcomes.filter(r=>r.status==="rejected")).toHaveLength(1);expect([reads,mutations]).toEqual([2,1]);
    expect((await pool.query("SELECT customer_id,lifecycle_state,revision FROM fmcc_vende_contract_terms WHERE subscription_id=$1",[cmd.subscriptionId])).rows[0]).toEqual({customer_id:customerId,lifecycle_state:"active",revision:3});
    await expect(dispatchVendeReactivationOnce(cmd.id,config,http)).rejects.toThrow();
  });
  it("blocks reactivation before network when finance, approval, binding or contract is ineligible",async()=>{
    let calls=0;const http=(async()=>{calls++;throw Error("forbidden network");}) as typeof fetch;
    for(const mode of ["expired","approval","payment","invoice","revision","cancelled","binding","tenant","disabled"]){
      const cmd=await makeReactivation();
      if(mode==="expired")await pool.query("UPDATE fmcc_vende_contract_terms SET paid_through='2026-10-01' WHERE subscription_id=$1",[cmd.subscriptionId]);
      if(mode==="approval")await pool.query("UPDATE fmcc_vende_lifecycle_command SET approved_at=NULL WHERE id=$1",[cmd.id]);
      if(mode==="payment")await pool.query("UPDATE fmcc_billing_provider_payment SET status='refunded' WHERE invoice_id=$1",[cmd.invoiceId]);
      if(mode==="invoice")await pool.query("UPDATE fmcc_billing_invoice SET status='pending' WHERE id=$1",[cmd.invoiceId]);
      if(mode==="revision")await pool.query("UPDATE fmcc_vende_contract_terms SET revision=revision+1 WHERE subscription_id=$1",[cmd.subscriptionId]);
      if(mode==="cancelled")await pool.query("UPDATE fmcc_billing_subscription SET status='cancelled' WHERE id=$1",[cmd.subscriptionId]);
      if(mode==="binding")await pool.query("UPDATE fmcc_vende_lifecycle_command SET external_tenant_id='foreign-target' WHERE id=$1",[cmd.id]);
      if(mode==="disabled")delete process.env.FM_COMMAND_VENDE_C06_DELIVERY_ENABLED;
      await expect(dispatchVendeReactivationOnce(cmd.id,mode==="tenant"?{...config,organizationId:"foreign"}:config,http)).rejects.toThrow();
      process.env.FM_COMMAND_VENDE_C06_DELIVERY_ENABLED="true";
      expect((await pool.query("SELECT state,claimed_at,delivery_target FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0]).toEqual({state:"pending",claimed_at:null,delivery_target:null});
    }
    expect(calls).toBe(0);
  });
  it("rejects remote plan/validity mismatch and approval drift before reactivation mutation",async()=>{
    for(const mode of ["plan","validity","status","approval"]){
      const cmd=await makeReactivation();let reads=0;
      const http=(async(url:RequestInfo|URL)=>{
        expect(new URL(String(url)).pathname).toMatch(/commercial-status$/);reads++;
        if(mode==="approval")await pool.query("UPDATE fmcc_vende_lifecycle_command SET approved_at=$1 WHERE id=$2",[new Date(Date.now()-301_000),cmd.id]);
        return json({tenant_id:cmd.external,operation_status:"not_applied",applied_action:null,
          license_status:mode==="status"?"cancelled":"suspended",plan_code:mode==="plan"?"OTHER":"BASE",
          plan_revision:1,valid_until:cmd.validUntil+(mode==="validity"?1:0)});
      }) as typeof fetch;
      expect(await dispatchVendeReactivationOnce(cmd.id,config,http)).toBe("unknown");expect(reads).toBe(1);
      expect((await pool.query("SELECT delivery_target FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0].delivery_target).toBeNull();
    }
  });
  it("never treats optimistic or mismatched ACKs as reactivated",async()=>{
    for(const mode of ["optimistic","tenant","plan","revision","validity","action","refund"]){
      const cmd=await makeReactivation();let sent=false;
      const http=(async(url:RequestInfo|URL)=>{
        if(new URL(String(url)).pathname.endsWith("/commercial-transition")){
          sent=true;if(mode==="refund")await pool.query("UPDATE fmcc_billing_provider_payment SET status='refunded' WHERE invoice_id=$1",[cmd.invoiceId]);
          return json({status:"active"});
        }
        return json({tenant_id:sent&&mode==="tenant"?"foreign":cmd.external,
          operation_status:sent&&mode!=="optimistic"?"applied":"not_applied",
          applied_action:sent?(mode==="action"?"RENEW_VERIFIED":"REACTIVATE_VERIFIED"):null,
          license_status:sent?"active":"suspended",plan_code:sent&&mode==="plan"?"OTHER":"BASE",
          plan_revision:sent&&mode==="revision"?2:1,valid_until:cmd.validUntil+(sent&&mode==="validity"?1:0)});
      }) as typeof fetch;
      expect(await dispatchVendeReactivationOnce(cmd.id,config,http)).toBe("unknown");
      expect((await pool.query("SELECT lifecycle_state FROM fmcc_vende_contract_terms WHERE subscription_id=$1",[cmd.subscriptionId])).rows[0].lifecycle_state).toBe("reactivation_pending");
    }
  });
  it("rechecks payment after status I/O and does not re-send a timed out mutation",async()=>{
    const race=await makeReactivation();let calls=0;
    const raceHttp=(async(url:RequestInfo|URL)=>{
      calls++;expect(new URL(String(url)).pathname).toMatch(/commercial-status$/);
      await pool.query("UPDATE fmcc_billing_provider_payment SET status='refunded' WHERE invoice_id=$1",[race.invoiceId]);
      return json({tenant_id:race.external,operation_status:"not_applied",applied_action:null,license_status:"suspended",plan_code:"BASE",plan_revision:1,valid_until:race.validUntil});
    }) as typeof fetch;
    expect(await dispatchVendeReactivationOnce(race.id,config,raceHttp)).toBe("unknown");expect(calls).toBe(1);
    const cmd=await makeReactivation();let sent=false,mutations=0;
    const http=(async(url:RequestInfo|URL)=>{
      if(new URL(String(url)).pathname.endsWith("/commercial-transition")){mutations++;sent=true;throw Error("timeout after apply");}
      return json({tenant_id:cmd.external,operation_status:sent?"applied":"not_applied",applied_action:sent?"REACTIVATE_VERIFIED":null,
        license_status:sent?"active":"suspended",plan_code:"BASE",plan_revision:1,valid_until:cmd.validUntil});
    }) as typeof fetch;
    expect(await dispatchVendeReactivationOnce(cmd.id,config,http)).toBe("unknown");
    await pool.query("UPDATE fmcc_vende_lifecycle_command SET approved_at=$1 WHERE id=$2",[new Date(Date.now()-301_000),cmd.id]);
    expect(await reconcileUnknownVendeReactivation(cmd.id,config,http)).toBe("delivered");expect(mutations).toBe(1);
    const orphan=await makeReactivation();
    await pool.query("UPDATE fmcc_vende_lifecycle_command SET state='processing',claimed_at=$1 WHERE id=$2",[new Date(Date.now()-20*60_000),orphan.id]);
    expect(await quarantineAbandonedVendeClaims(config)).toBe(1);
    const noNetwork=(async()=>{throw Error("missing target must not read or mutate");}) as typeof fetch;
    expect(await reconcileUnknownVendeReactivation(orphan.id,config,noNetwork)).toBe("unknown");
  });

  it("reapproves an expired, never-attempted REACTIVATE_VERIFIED intent once with atomic audit",async()=>{
    for(const prior of [null,new Date(Date.now()-301_000)]){
      const cmd=await makeReactivation();
      await pool.query("UPDATE fmcc_vende_lifecycle_command SET approved_at=$1,actor_id='original-approver' WHERE id=$2",[prior,cmd.id]);
      const proof={userId:context.userId,verifiedAt:new Date()};
      const input={productId,commandId:cmd.id,expectedApprovedAt:prior?.toISOString()??null};
      const outcomes=await Promise.allSettled([
        reapproveVendeReactivation(context,proof,input),
        reapproveVendeReactivation(context,proof,input),
      ]);
      expect(outcomes.filter(r=>r.status==="fulfilled")).toHaveLength(1);
      expect(outcomes.filter(r=>r.status==="rejected")).toHaveLength(1);
      const row=(await pool.query(
        "SELECT state,claimed_at,delivered_at,delivery_target,actor_id,approved_at FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id],
      )).rows[0];
      expect(row.state).toBe("pending");expect(row.claimed_at).toBeNull();
      expect(row.delivered_at).toBeNull();expect(row.delivery_target).toBeNull();
      expect(row.actor_id).toBe(context.userId);
      expect(row.approved_at.getTime()).toBe(proof.verifiedAt.getTime());
      const logs=(await pool.query(
        "SELECT metadata FROM fmcc_audit_event WHERE tenant_id=$1 AND resource_id=$2 AND action='vende.reactivation_intent.reapproved'",
        [tenant,cmd.id],
      )).rows;
      expect(logs).toHaveLength(1);
      expect(logs[0].metadata).toMatchObject({
        previousActorId:"original-approver",previousApprovedAt:prior?.toISOString()??null,
        approvedAt:proof.verifiedAt.toISOString(),paymentRef:cmd.paymentRef,
      });
    }
  });
  it("blocks reactivation reapproval on stale finance, changed revision, attempts, foreign scope and invalid proof",async()=>{
    const cases=["processing","unknown","delivered","blocked","claimed","target","invoice","payment",
      "revision","cancelled","binding","valid","cas","actor","proof","foreign"];
    for(const mode of cases){
      const cmd=await makeReactivation();
      const prior=new Date(Date.now()-301_000);
      await pool.query("UPDATE fmcc_vende_lifecycle_command SET approved_at=$1 WHERE id=$2",[prior,cmd.id]);
      if(["processing","unknown","delivered","blocked"].includes(mode))
        await pool.query("UPDATE fmcc_vende_lifecycle_command SET state=$1 WHERE id=$2",[mode,cmd.id]);
      if(mode==="claimed")await pool.query("UPDATE fmcc_vende_lifecycle_command SET claimed_at=now() WHERE id=$1",[cmd.id]);
      if(mode==="target")await pool.query(
        "UPDATE fmcc_vende_lifecycle_command SET delivery_target=$1::jsonb WHERE id=$2",
        [JSON.stringify({schema:"fm.vende.reactivation-target.v1",planCode:"BASE",planRevision:1,
          validUntil:cmd.validUntil,paymentRef:cmd.paymentRef,termsRevision:3}),cmd.id],
      );
      if(mode==="invoice")await pool.query("UPDATE fmcc_billing_invoice SET status='pending' WHERE id=$1",[cmd.invoiceId]);
      if(mode==="payment")await pool.query("UPDATE fmcc_billing_provider_payment SET status='refunded' WHERE invoice_id=$1",[cmd.invoiceId]);
      if(mode==="revision")await pool.query("UPDATE fmcc_vende_contract_terms SET revision=revision+1 WHERE subscription_id=$1",[cmd.subscriptionId]);
      if(mode==="cancelled")await pool.query("UPDATE fmcc_billing_subscription SET status='cancelled' WHERE id=$1",[cmd.subscriptionId]);
      if(mode==="binding")await pool.query("UPDATE fmcc_vende_lifecycle_command SET external_tenant_id='foreign-tenant' WHERE id=$1",[cmd.id]);
      if(mode==="valid")await pool.query("UPDATE fmcc_vende_lifecycle_command SET approved_at=now() WHERE id=$1",[cmd.id]);
      const input={productId,commandId:cmd.id,expectedApprovedAt:mode==="cas"?null:prior.toISOString()};
      const proof={userId:mode==="actor"?"not-owner":context.userId,
        verifiedAt:mode==="proof"?new Date(Date.now()-301_000):new Date()};
      const actualContext=mode==="foreign"?{...context,tenantId:"foreign-fm"}:context;
      await expect(reapproveVendeReactivation(actualContext,proof,input)).rejects.toThrow();
      const audit=(await pool.query(
        "SELECT count(*)::int AS n FROM fmcc_audit_event WHERE tenant_id=$1 AND resource_id=$2 AND action='vende.reactivation_intent.reapproved'",
        [tenant,cmd.id],
      )).rows[0];
      expect(audit.n).toBe(0);
    }
  });

  it("supervises ALL C06 claims with immutable read-only FM scope and bounded recent rows",async()=>{
    const before=await readVendeClaimsMonitor(context,productId);
    const uncertain=await makePending();
    await pool.query("UPDATE fmcc_vende_lifecycle_command SET state='unknown',claimed_at=now() WHERE id=$1",[uncertain.id]);
    const expired=await makePending();
    await pool.query("UPDATE fmcc_vende_lifecycle_command SET approved_at=NULL WHERE id=$1",[expired.id]);
    const processing=await makePending();
    await pool.query("UPDATE fmcc_vende_lifecycle_command SET state='processing',claimed_at=$1 WHERE id=$2",
      [new Date(Date.now()-20*60_000),processing.id]);
    const after=await readVendeClaimsMonitor(context,productId);
    expect(after.totals.unknown).toBe(before.totals.unknown+1);
    expect(after.totals.pending).toBe(before.totals.pending+1);
    expect(after.totals.processing).toBe(before.totals.processing+1);
    expect(after.staleProcessing).toBeGreaterThanOrEqual(before.staleProcessing+1);
    expect(after.expiredApprovals).toBeGreaterThanOrEqual(before.expiredApprovals+1);
    expect(after.items.length).toBeLessThanOrEqual(50);
    expect(after.runtimeEntitlementVerified).toBe(false);
    expect(after.alert).toBe("critical");
    expect((await pool.query("SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",[uncertain.id])).rows[0].state).toBe("unknown");
    await expect(readVendeClaimsMonitor({...context,tenantId:"foreign-corporate"},productId)).rejects.toThrow();
    await expect(readVendeClaimsMonitor(context,"invalid")).rejects.toThrow();
  });

  it("B1.11 records ONE compensation-risk audit if reactivation is applied remotely but payment reverses",async()=>{
    const cmd=await makeReactivation();
    let applied=false,mutations=0;
    const http=(async(url:RequestInfo|URL)=>{
      const pathname=new URL(String(url)).pathname;
      if(pathname.endsWith("/commercial-transition")){
        mutations++;applied=true;
        await pool.query("UPDATE fmcc_billing_provider_payment SET status='refunded' WHERE invoice_id=$1",[cmd.invoiceId]);
        return json({status:"active"});
      }
      if(pathname.endsWith("/commercial-status"))
        return json({tenant_id:cmd.external,operation_status:applied?"applied":"not_applied",
          applied_action:applied?"REACTIVATE_VERIFIED":null,
          license_status:applied?"active":"suspended",plan_code:"BASE",plan_revision:1,
          valid_until:cmd.validUntil});
      throw Error("unexpected route");
    }) as typeof fetch;
    expect(await dispatchVendeReactivationOnce(cmd.id,config,http)).toBe("unknown");
    expect(await reconcileUnknownVendeReactivation(cmd.id,config,http)).toBe("unknown");
    expect(mutations).toBe(1);
    const logs=(await pool.query(
      "SELECT actor_type,result,metadata FROM fmcc_audit_event WHERE tenant_id=$1 AND resource_id=$2 AND action='vende.compensation_review.required'",
      [tenant,cmd.id])).rows;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({actor_type:"service",result:"needs_human_review",
      metadata:{reason:"reactivation_unconfirmed",action:"REACTIVATE_VERIFIED",
        observedRemoteAction:"REACTIVATE_VERIFIED",automaticCompensationAuthorized:false}});
    expect((await pool.query("SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0].state)
      .toBe("unknown");
    expect((await pool.query("SELECT lifecycle_state FROM fmcc_vende_contract_terms WHERE subscription_id=$1",
      [cmd.subscriptionId])).rows[0].lifecycle_state).toBe("reactivation_pending");
    const monitor=await readVendeClaimsMonitor(context,productId);
    expect(monitor.compensationReviewEvents).toBeGreaterThanOrEqual(1);
  });

  it("B1.11 retains one compensation alert when remote suspension succeeded but invoice settled during I/O",async()=>{
    const cmd=await makePending();let applied=false,mutations=0;
    const external=(await pool.query(
      "SELECT external_tenant_id FROM fmcc_billing_customer_binding WHERE tenant_id=$1",[tenant])).rows[0].external_tenant_id as string;
    const http=(async(url:RequestInfo|URL)=>{
      const pathname=new URL(String(url)).pathname;
      if(pathname.endsWith("/commercial-transition")){
        mutations++;applied=true;
        await pool.query("UPDATE fmcc_billing_invoice SET status='paid' WHERE id=$1",[cmd.invoiceId]);
        return json({status:"suspended"});
      }
      if(pathname.endsWith("/commercial-status"))
        return json({tenant_id:external,operation_status:applied?"applied":"not_applied",
          applied_action:applied?"SUSPEND_DELINQUENCY":null,
          license_status:applied?"suspended":"active",plan_code:"BASE",plan_revision:1,
          valid_until:Math.floor(Date.now()/1000)+86400});
      throw Error("unexpected route");
    }) as typeof fetch;
    expect(await dispatchVendeDelinquencyOnce(cmd.id,config,http)).toBe("unknown");
    expect(await reconcileUnknownVendeDelinquency(cmd.id,config,http)).toBe("unknown");
    expect(mutations).toBe(1);
    const logs=(await pool.query(
      "SELECT metadata FROM fmcc_audit_event WHERE tenant_id=$1 AND resource_id=$2 AND action='vende.compensation_review.required'",
      [tenant,cmd.id])).rows;
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata).toMatchObject({reason:"suspension_unconfirmed",
      observedRemoteAction:"SUSPEND_DELINQUENCY",automaticCompensationAuthorized:false});
    expect((await pool.query("SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",
      [cmd.id])).rows[0].state).toBe("unknown");
    expect((await pool.query("SELECT lifecycle_state FROM fmcc_vende_contract_terms WHERE subscription_id=$1",
      [cmd.subscriptionId])).rows[0].lifecycle_state).toBe("suspension_pending");
  });

  it("B1.13 requires fresh human approval at deadline, then cancels one time only with signed proof",async()=>{
    const cmd=await makeCancellation();
    let calls=0,applied=false;
    const http=(async(url:RequestInfo|URL,init?:RequestInit)=>{
      const body=JSON.parse(String(init?.body));
      if(new URL(String(url)).pathname.endsWith("/commercial-transition")){
        calls++;expect(body).toMatchObject({tenant_id:cmd.external,command_request_id:cmd.operationId,
          action:"CANCEL_AT_PERIOD_END",expected_plan_code:"BASE",verified_payment_ref:"none",
          expected_valid_until:cmd.validUntil,target_valid_until:cmd.validUntil});
        applied=true;return json({ok:true});
      }
      return json({tenant_id:cmd.external,operation_status:applied?"applied":"not_applied",
        applied_action:applied?"CANCEL_AT_PERIOD_END":null,
        license_status:applied?"cancelled":"active",
        plan_code:"BASE",plan_revision:1,valid_until:cmd.validUntil});
    }) as typeof fetch;
    await expect(dispatchVendeFinalCancellationOnce(cmd.id,config,http)).rejects.toThrow();
    const proof={userId:context.userId,verifiedAt:new Date()};
    const input={productId,commandId:cmd.id,expectedApprovedAt:cmd.approvedAt.toISOString()};
    const two=await Promise.allSettled([
      reapproveVendeFinalCancellation(context,proof,input),
      reapproveVendeFinalCancellation(context,proof,input),
    ]);
    expect(two.filter(x=>x.status==="fulfilled")).toHaveLength(1);
    expect(two.filter(x=>x.status==="rejected")).toHaveLength(1);
    expect(await dispatchVendeFinalCancellationOnce(cmd.id,config,http)).toBe("delivered");
    expect(calls).toBe(1);
    const result=(await pool.query(
      "SELECT state,claimed_at,delivered_at FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0];
    expect(result.state).toBe("delivered");expect(result.claimed_at).not.toBeNull();
    expect(result.delivered_at).not.toBeNull();
    expect((await pool.query("SELECT lifecycle_state,auto_renew FROM fmcc_vende_contract_terms WHERE subscription_id=$1",
      [cmd.subscriptionId])).rows[0]).toMatchObject({lifecycle_state:"cancelled",auto_renew:false});
    expect((await pool.query("SELECT status FROM fmcc_billing_subscription WHERE id=$1",
      [cmd.subscriptionId])).rows[0].status).toBe("cancelled");
    await expect(dispatchVendeFinalCancellationOnce(cmd.id,config,http)).rejects.toThrow();
    expect(calls).toBe(1);
    const audit=(await pool.query("SELECT count(*)::int AS n FROM fmcc_audit_event WHERE tenant_id=$1 AND resource_id=$2 AND action='vende.cancellation_intent.reapproved'",
      [tenant,cmd.id])).rows[0].n;
    expect(audit).toBe(1);
  });
  it("B1.13 never approves or delivers cancellation before complete paid local date",async()=>{
    const later=fmLocalCivilDate(new Date(Date.now()+2*86400_000));
    const cmd=await makeCancellation(later);
    await expect(reapproveVendeFinalCancellation(context,{userId:context.userId,verifiedAt:new Date()},
      {productId,commandId:cmd.id,expectedApprovedAt:cmd.approvedAt.toISOString()})).rejects.toThrow();
    const before=(async()=>{throw Error("must_not_touch_network");}) as typeof fetch;
    await expect(dispatchVendeFinalCancellationOnce(cmd.id,config,before)).rejects.toThrow();
    const rows=(await pool.query("SELECT state,claimed_at FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id])).rows[0];
    expect(rows).toEqual({state:"pending",claimed_at:null});
    expect((await pool.query("SELECT status FROM fmcc_billing_subscription WHERE id=$1",
      [cmd.subscriptionId])).rows[0].status).toBe("active");
  });
  it("B1.13 recovers timeout after applied cancellation strictly by read-only status, without POST replay",async()=>{
    const cmd=await makeCancellation();
    const proof={userId:context.userId,verifiedAt:new Date()};
    await reapproveVendeFinalCancellation(context,proof,
      {productId,commandId:cmd.id,expectedApprovedAt:cmd.approvedAt.toISOString()});
    let sent=false,mutations=0,reads=0;
    const http=(async(url:RequestInfo|URL)=>{
      if(new URL(String(url)).pathname.endsWith("/commercial-transition")){
        sent=true;mutations++;throw Error("simulated timeout after apply");
      }
      reads++;return json({tenant_id:cmd.external,
        operation_status:sent?"applied":"not_applied",
        applied_action:sent?"CANCEL_AT_PERIOD_END":null,
        license_status:sent?"cancelled":"active",plan_code:"BASE",plan_revision:1,valid_until:cmd.validUntil});
    }) as typeof fetch;
    expect(await dispatchVendeFinalCancellationOnce(cmd.id,config,http)).toBe("unknown");
    expect(await reconcileUnknownVendeFinalCancellation(cmd.id,config,http)).toBe("delivered");
    expect(mutations).toBe(1);expect(reads).toBe(2);
    expect((await pool.query("SELECT status FROM fmcc_billing_subscription WHERE id=$1",
      [cmd.subscriptionId])).rows[0].status).toBe("cancelled");
  });
  it("B1.13 rejects mismatched readback and quarantines old processing without retries",async()=>{
    const cmd=await makeCancellation();
    await reapproveVendeFinalCancellation(context,{userId:context.userId,verifiedAt:new Date()},
      {productId,commandId:cmd.id,expectedApprovedAt:cmd.approvedAt.toISOString()});
    let sent=false,posts=0;
    const http=(async(url:RequestInfo|URL)=>{
      if(new URL(String(url)).pathname.endsWith("/commercial-transition")){
        sent=true;posts++;return json({ok:true});
      }
      return json({tenant_id:cmd.external,operation_status:sent?"applied":"not_applied",
        applied_action:sent?"CANCEL_AT_PERIOD_END":null,
        license_status:"active",plan_code:"BASE",plan_revision:1,valid_until:cmd.validUntil});
    }) as typeof fetch;
    expect(await dispatchVendeFinalCancellationOnce(cmd.id,config,http)).toBe("unknown");
    expect(await reconcileUnknownVendeFinalCancellation(cmd.id,config,http)).toBe("unknown");
    expect(posts).toBe(1);
    expect((await pool.query("SELECT lifecycle_state FROM fmcc_vende_contract_terms WHERE subscription_id=$1",
      [cmd.subscriptionId])).rows[0].lifecycle_state).toBe("cancel_at_period_end");
    const orphan=await makeCancellation();
    await pool.query("UPDATE fmcc_vende_lifecycle_command SET state='processing',claimed_at=$1 WHERE id=$2",
      [new Date(Date.now()-20*60_000),orphan.id]);
    expect(await quarantineAbandonedVendeClaims(config)).toBeGreaterThanOrEqual(1);
    expect((await pool.query("SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",
      [orphan.id])).rows[0].state).toBe("unknown");
  });

  it("P01 locks review decisions by version and audits one human reviewer per CAS without remote mutation",async()=>{
    const cmd=await makePending();
    await pool.query(
      "INSERT INTO fmcc_audit_event(tenant_id,actor_id,actor_type,action,resource_type,resource_id,result,correlation_id,metadata) VALUES ($1,'fm-test-finance','service','vende.compensation_review.required','vende_lifecycle_command',$2,'needs_human_review',$3,$4::jsonb)",
      [tenant,cmd.id,cmd.operationId,JSON.stringify({
        schema:"fm.vende.compensation-risk.v1",productId,subscriptionId:cmd.subscriptionId,
        operationId:cmd.operationId,reason:"suspension_unconfirmed",
        automaticCompensationAuthorized:false,
      })],
    );
    const before=await readVendeCompensationReviews(context,productId);
    const item=before.items.find(x=>x.commandId===cmd.id);
    expect(item).toMatchObject({reviewVersion:0,reviewStep:"unreviewed",
      state:"pending"});
    expect(before.entitlementVerified).toBe(false);
    expect(before.remoteRemediationCompleted).toBe(false);
    const proof={userId:context.userId,verifiedAt:new Date()};
    const input={productId,commandId:cmd.id,expectedVersion:0,
      decision:"investigating" as const,reasonCode:"investigation_open"};
    const results=await Promise.allSettled([
      triageVendeCompensationRisk(context,proof,input),
      triageVendeCompensationRisk(context,proof,input),
    ]);
    expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);
    expect(results.filter(x=>x.status==="rejected")).toHaveLength(1);
    const current=await readVendeCompensationReviews(context,productId);
    const reviewed=current.items.find(x=>x.commandId===cmd.id);
    expect(reviewed).toMatchObject({reviewVersion:1,
      reviewStep:"investigating",reviewer:context.userId});
    const next=await triageVendeCompensationRisk(context,proof,{
      ...input,expectedVersion:1,decision:"escalated",
      reasonCode:"remote_finance_mismatch",
    });
    expect(next).toMatchObject({reviewVersion:2,reviewStep:"escalated",
      remediationDispatched:false,currentAssistantLicenseVerified:false});
    const record=(await pool.query("SELECT metadata FROM fmcc_audit_event WHERE tenant_id=$1 AND resource_id=$2 AND action='vende.compensation_review.triaged' ORDER BY occurred_at",
      [tenant,cmd.id])).rows;
    expect(record).toHaveLength(2);
    expect(record.map(x=>x.metadata.reviewVersion).sort()).toEqual([1,2]);
    expect(record.every(x=>x.metadata.automaticCompensationAuthorized===false)).toBe(true);
    expect((await pool.query("SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",
      [cmd.id])).rows[0].state).toBe("pending");
    expect((await pool.query("SELECT status FROM fmcc_billing_invoice WHERE id=$1",
      [cmd.invoiceId])).rows[0].status).toBe("pending");
  });

  it("P01 prevents cross-tenant, no-risk and expiry review and never invents resolution",async()=>{
    const cmd=await makePending();
    const input={productId,commandId:cmd.id,expectedVersion:0,
      decision:"investigating" as const,reasonCode:"investigation_open"};
    const proof={userId:context.userId,verifiedAt:new Date()};
    await expect(triageVendeCompensationRisk(context,proof,input)).rejects.toThrow();
    await pool.query(
      "INSERT INTO fmcc_audit_event(tenant_id,actor_id,actor_type,action,resource_type,resource_id,result,correlation_id,metadata) VALUES ($1,'fm-test','service','vende.compensation_review.required','vende_lifecycle_command',$2,'needs_human_review',$3,$4::jsonb)",
      [tenant,cmd.id,cmd.operationId,JSON.stringify({productId,reason:"suspension_unconfirmed"})],
    );
    await expect(triageVendeCompensationRisk(
      {...context,tenantId:"other-tenant"},proof,input)).rejects.toThrow();
    await expect(triageVendeCompensationRisk(context,{
      userId:context.userId,verifiedAt:new Date(Date.now()-301000),
    },input)).rejects.toThrow();
    await expect(triageVendeCompensationRisk(context,{...proof,userId:"intruder"},input)).rejects.toThrow();
    await expect(readVendeCompensationReviews({...context,tenantId:"other-tenant"},productId)).rejects.toThrow();
    const r=await readVendeCompensationReviews(context,productId);
    expect(r.items.find(x=>x.commandId===cmd.id)?.reviewStep).toBe("unreviewed");
  });

  it("P01 monitors expired approvals only when cancellation/downgrade become due",async()=>{
    const before=await readVendeClaimsMonitor(context,productId);
    const future=await makeCancellation(fmLocalCivilDate(new Date(Date.now()+4*86400_000)));
    const afterFuture=await readVendeClaimsMonitor(context,productId);
    expect(afterFuture.expiredApprovals).toBe(before.expiredApprovals);
    const due=await makeCancellation();
    const afterDue=await readVendeClaimsMonitor(context,productId);
    expect(afterDue.expiredApprovals).toBeGreaterThanOrEqual(before.expiredApprovals+1);
    // The bounded 50-row presentation can omit these commands; the full
    // SQL counts and source rows, not card presence, define this gate.
    const rows=(await pool.query(
      "SELECT state,claimed_at FROM fmcc_vende_lifecycle_command WHERE id IN ($1,$2) ORDER BY id",
      [due.id,future.id])).rows;
    expect(rows.every(x=>x.state==="pending"&&x.claimed_at===null)).toBe(true);
  });

  it("P01 reads Assistant evidence under FM authority without executing compensation",async()=>{
    const cmd=await makePending();
    await pool.query(
      "INSERT INTO fmcc_audit_event(tenant_id,actor_id,actor_type,action,resource_type,resource_id,result,correlation_id,metadata) VALUES ($1,'fm-check','service','vende.compensation_review.required','vende_lifecycle_command',$2,'needs_human_review',$3,$4::jsonb)",
      [tenant,cmd.id,cmd.operationId,JSON.stringify({productId,reason:"suspension_unconfirmed"})],
    );
    const proof={userId:context.userId,verifiedAt:new Date()};
    await triageVendeCompensationRisk(context,proof,{
      productId,commandId:cmd.id,expectedVersion:0,
      decision:"investigating",reasonCode:"investigation_open",
    });
    const external=(await pool.query(
      "SELECT external_tenant_id FROM fmcc_billing_customer_binding WHERE tenant_id=$1",
      [tenant])).rows[0].external_tenant_id as string;
    let reads=0;
    const http=(async(url:RequestInfo|URL,opts?:RequestInit)=>{
      reads++;expect(new URL(String(url)).pathname).toMatch(/commercial-status$/);
      expect(opts?.method).toBe("POST");
      return json({tenant_id:external,operation_status:"applied",
        applied_action:"SUSPEND_DELINQUENCY",license_status:"suspended",
        plan_code:"BASE",plan_revision:1,
        valid_until:Math.floor(Date.now()/1000)+86400});
    }) as typeof fetch;
    const result=await observeVendeCompensationEvidence(context,proof,{
      productId,commandId:cmd.id,expectedReviewVersion:1,
    },config,http);
    expect(reads).toBe(1);
    expect(result).toMatchObject({state:"human_reconciliation_required",
      financeState:"unpaid_verified",invoiceState:"pending",
      remoteObserved:true,remediationDispatched:false,caseResolved:false});
    const [record]=(await pool.query(
      "SELECT metadata FROM fmcc_audit_event WHERE tenant_id=$1 AND resource_id=$2 AND action='vende.compensation_review.remote_observed'",
      [tenant,cmd.id])).rows;
    expect(record.metadata).toMatchObject({
      reviewVersion:1,remoteOperationStatus:"applied",
      remoteLicenseStatus:"suspended",verifiedFinanceOutcome:"unpaid_verified",
      remediated:false,refundExecuted:false,entitlementMutated:false,
    });
    expect((await pool.query("SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",
      [cmd.id])).rows[0].state).toBe("pending");
    expect((await pool.query("SELECT status FROM fmcc_billing_invoice WHERE id=$1",
      [cmd.invoiceId])).rows[0].status).toBe("pending");
    await expect(observeVendeCompensationEvidence(
      {...context,tenantId:"foreign"},proof,
      {productId,commandId:cmd.id,expectedReviewVersion:1},
      config,http)).rejects.toThrow();
    expect(reads).toBe(1);
    await expect(observeVendeCompensationEvidence(context,proof,{
      productId,commandId:cmd.id,expectedReviewVersion:9,
    },config,http)).rejects.toThrow();
    expect(reads).toBe(1);
  });

  it("P01 classifies a settled payment after Assistant suspension as divergence",async()=>{
    const cmd=await makePending();
    await pool.query("UPDATE fmcc_vende_lifecycle_command SET state='delivered' WHERE id=$1",[cmd.id]);
    await pool.query(
      "INSERT INTO fmcc_audit_event(tenant_id,actor_id,actor_type,action,resource_type,resource_id,result,correlation_id,metadata) VALUES ($1,'fm-check','service','vende.compensation_review.required','vende_lifecycle_command',$2,'needs_human_review',$3,$4::jsonb)",
      [tenant,cmd.id,cmd.operationId,JSON.stringify({productId,reason:"delinquency_paid_after_delivery"})],
    );
    const paymentRef=(await pool.query(
      "SELECT external_payment_id FROM fmcc_billing_provider_payment WHERE invoice_id=$1",
      [cmd.invoiceId])).rows[0].external_payment_id as string;
    await pool.query(
      "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'settled_verified',$4,'synthetic-post-suspension-settled')",
      [tenant,cmd.invoiceId,paymentRef,new Date()],
    );
    const proof={userId:context.userId,verifiedAt:new Date()};
    await triageVendeCompensationRisk(context,proof,{
      productId,commandId:cmd.id,expectedVersion:0,
      decision:"investigating",reasonCode:"payment_received_late",
    });
    const external=(await pool.query(
      "SELECT external_tenant_id FROM fmcc_billing_customer_binding WHERE tenant_id=$1",
      [tenant])).rows[0].external_tenant_id as string;
    const http=(async()=>json({tenant_id:external,operation_status:"applied",
      applied_action:"SUSPEND_DELINQUENCY",license_status:"suspended",
      plan_code:"BASE",plan_revision:1,valid_until:1893456000})) as typeof fetch;
    const result=await observeVendeCompensationEvidence(context,proof,{
      productId,commandId:cmd.id,expectedReviewVersion:1,
    },config,http);
    expect(result).toMatchObject({
      state:"remote_suspended_after_finance_settled",
      financeState:"settled_verified",
      remediationDispatched:false,caseResolved:false,
    });
    const records=(await pool.query(
      "SELECT result,metadata FROM fmcc_audit_event WHERE tenant_id=$1 AND resource_id=$2 AND action='vende.compensation_review.remote_observed'",
      [tenant,cmd.id])).rows;
    expect(records).toHaveLength(1);
    expect(records[0].result).toBe("remote_suspended_after_finance_settled");
    expect(records[0].metadata).toMatchObject({
      remediated:false,refundExecuted:false,entitlementMutated:false,
    });
  });

  it("P01 does not claim remote suspension when the status is active",async()=>{
    const cmd=await makePending();
    await pool.query(
      "INSERT INTO fmcc_audit_event(tenant_id,actor_id,actor_type,action,resource_type,resource_id,result,correlation_id,metadata) VALUES ($1,'fm-check','service','vende.compensation_review.required','vende_lifecycle_command',$2,'needs_human_review',$3,$4::jsonb)",
      [tenant,cmd.id,cmd.operationId,JSON.stringify({productId,reason:"delinquency_paid_after_delivery"})],
    );
    const paymentRef=(await pool.query(
      "SELECT external_payment_id FROM fmcc_billing_provider_payment WHERE invoice_id=$1",
      [cmd.invoiceId])).rows[0].external_payment_id as string;
    await pool.query(
      "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'settled_verified',$4,'synthetic-active-settled')",
      [tenant,cmd.invoiceId,paymentRef,new Date()],
    );
    const proof={userId:context.userId,verifiedAt:new Date()};
    await triageVendeCompensationRisk(context,proof,{
      productId,commandId:cmd.id,expectedVersion:0,
      decision:"investigating",reasonCode:"investigation_open",
    });
    const external=(await pool.query(
      "SELECT external_tenant_id FROM fmcc_billing_customer_binding WHERE tenant_id=$1",
      [tenant])).rows[0].external_tenant_id as string;
    const http=(async()=>json({tenant_id:external,operation_status:"applied",
      applied_action:"SUSPEND_DELINQUENCY",license_status:"active",
      plan_code:"BASE",plan_revision:1,valid_until:1893456000})) as typeof fetch;
    const result=await observeVendeCompensationEvidence(context,proof,{
      productId,commandId:cmd.id,expectedReviewVersion:1,
    },config,http);
    expect(result.state).not.toBe("remote_suspended_after_finance_settled");
    expect(result.caseResolved).toBe(false);
  });

  it("P01 refuses to audit stale Assistant readback after claim is changed",async()=>{
    const cmd=await makePending();
    await pool.query(
      "INSERT INTO fmcc_audit_event(tenant_id,actor_id,actor_type,action,resource_type,resource_id,result,correlation_id,metadata) VALUES ($1,'fm-check','service','vende.compensation_review.required','vende_lifecycle_command',$2,'needs_human_review',$3,$4::jsonb)",
      [tenant,cmd.id,cmd.operationId,JSON.stringify({productId,reason:"suspension_unconfirmed"})],
    );
    const proof={userId:context.userId,verifiedAt:new Date()};
    await triageVendeCompensationRisk(context,proof,{
      productId,commandId:cmd.id,expectedVersion:0,
      decision:"investigating",reasonCode:"investigation_open",
    });
    const remoteTenant=(await pool.query(
      "SELECT external_tenant_id FROM fmcc_billing_customer_binding WHERE tenant_id=$1",
      [tenant])).rows[0].external_tenant_id as string;
    const http=(async()=>{
      await pool.query("UPDATE fmcc_vende_lifecycle_command SET state='unknown' WHERE id=$1",[cmd.id]);
      return json({tenant_id:remoteTenant,operation_status:"applied",
        applied_action:"SUSPEND_DELINQUENCY",license_status:"suspended",
        plan_code:"BASE",plan_revision:1,valid_until:1893456000});
    }) as typeof fetch;
    await expect(observeVendeCompensationEvidence(context,proof,{
      productId,commandId:cmd.id,expectedReviewVersion:1,
    },config,http)).rejects.toThrow();
    const rows=(await pool.query(
      "SELECT count(*)::int n FROM fmcc_audit_event WHERE tenant_id=$1 AND resource_id=$2 AND action='vende.compensation_review.remote_observed'",
      [tenant,cmd.id])).rows;
    expect(rows[0].n).toBe(0);
  });

  it("P01 requires two independent humans for a paid-after-suspension correction intent, without dispatch",async()=>{
    const cmd=await makePending();
    const paidThrough=fmLocalCivilDate(new Date(Date.now()+30*86400_000));
    await pool.query("UPDATE fmcc_vende_lifecycle_command SET state='delivered',delivered_at=now() WHERE id=$1",[cmd.id]);
    await pool.query("UPDATE fmcc_vende_contract_terms SET lifecycle_state='suspended',paid_through=$1 WHERE subscription_id=$2",[paidThrough,cmd.subscriptionId]);
    await pool.query("UPDATE fmcc_billing_invoice SET status='paid' WHERE id=$1",[cmd.invoiceId]);
    await pool.query("UPDATE fmcc_billing_provider_payment SET status='received' WHERE invoice_id=$1",[cmd.invoiceId]);
    const paymentRef=(await pool.query(
      "SELECT external_payment_id FROM fmcc_billing_provider_payment WHERE invoice_id=$1",
      [cmd.invoiceId])).rows[0].external_payment_id as string;
    await pool.query(
      "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'settled_verified',now(),$4)",
      [tenant,cmd.invoiceId,paymentRef,"synthetic-post-suspension-settlement"],
    );
    await pool.query(
      "INSERT INTO fmcc_audit_event(tenant_id,actor_id,actor_type,action,resource_type,resource_id,result,correlation_id,metadata) VALUES ($1,'fm-detection','service','vende.compensation_review.required','vende_lifecycle_command',$2,'needs_human_review',$3,$4::jsonb)",
      [tenant,cmd.id,cmd.operationId,JSON.stringify({
        schema:"fm.vende.compensation-risk.v1",productId,
        operationId:cmd.operationId,reason:"delinquency_paid_after_delivery",
      })],
    );
    const proof={userId:context.userId,verifiedAt:new Date()};
    await triageVendeCompensationRisk(context,proof,{
      productId,commandId:cmd.id,expectedVersion:0,
      decision:"investigating",reasonCode:"investigation_open",
    });
    await triageVendeCompensationRisk(context,proof,{
      productId,commandId:cmd.id,expectedVersion:1,
      decision:"escalated",reasonCode:"payment_suspension_mismatch",
    });
    const external=(await pool.query(
      "SELECT external_tenant_id FROM fmcc_billing_customer_binding WHERE tenant_id=$1",
      [tenant])).rows[0].external_tenant_id as string;
    const signedExpiry=Math.floor(Date.now()/1000)+86400;
    const http=(async()=>json({
      tenant_id:external,operation_status:"applied",
      applied_action:"SUSPEND_DELINQUENCY",license_status:"suspended",
      plan_code:"BASE",plan_revision:1,valid_until:signedExpiry,
    })) as typeof fetch;
    const observation=await observeVendeCompensationEvidence(context,proof,{
      productId,commandId:cmd.id,expectedReviewVersion:2,
    },config,http);
    expect(observation).toMatchObject({
      remoteObserved:true,financeState:"settled_verified",
      remediationDispatched:false,caseResolved:false,
    });
    const common={productId,commandId:cmd.id,expectedReviewVersion:2};
    const first=await prepareVendeCorrectionIntent(context,proof,common);
    expect(first).toMatchObject({
      review:"awaiting_independent_human_review",
      proposedAction:"REACTIVATE_VIA_EXISTING_REGULARIZATION",
      approvedForDispatch:false,remediationDispatched:false,
      caseResolved:false,
    });
    await expect(prepareVendeCorrectionIntent(context,proof,common)).rejects.toThrow();
    await expect(secondReviewVendeCorrectionIntent(context,proof,{
      ...common,intentId:first.intentId,
    })).rejects.toThrow();
    const secondContext={...context,userId:"independent-fm-reviewer",role:"admin" as const};
    const secondProof={userId:secondContext.userId,verifiedAt:new Date()};
    const concurrent=await Promise.allSettled([
      secondReviewVendeCorrectionIntent(secondContext,secondProof,{...common,intentId:first.intentId}),
      secondReviewVendeCorrectionIntent(secondContext,secondProof,{...common,intentId:first.intentId}),
    ]);
    expect(concurrent.filter(x=>x.status==="fulfilled")).toHaveLength(1);
    expect(concurrent.filter(x=>x.status==="rejected")).toHaveLength(1);
    expect((concurrent.find(x=>x.status==="fulfilled") as PromiseFulfilledResult<{
      approvedForDispatch:false;remediationDispatched:false;
    }>).value).toMatchObject({
      review:"reviewed_no_dispatch",
      approvedForDispatch:false,remediationDispatched:false,
    });
    const audit=(await pool.query(
      "SELECT action,metadata FROM fmcc_audit_event WHERE tenant_id=$1 AND resource_id=$2 AND action LIKE 'vende.compensation_correction.%' ORDER BY occurred_at",
      [tenant,cmd.id])).rows;
    expect(audit).toHaveLength(2);
    expect(audit.every(x=>x.metadata.approvedForDispatch===false &&
      x.metadata.remediationDispatched===false)).toBe(true);
    expect((await pool.query("SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",[cmd.id]))
      .rows[0].state).toBe("delivered");
    expect((await pool.query(
      "SELECT lifecycle_state FROM fmcc_vende_contract_terms WHERE subscription_id=$1",
      [cmd.subscriptionId])).rows[0].lifecycle_state).toBe("suspended");
    expect((await pool.query("SELECT status FROM fmcc_billing_invoice WHERE id=$1",
      [cmd.invoiceId])).rows[0].status).toBe("paid");

    // A completed independent review does NOT itself activate reactivation.
    const queuedInput={...common,intentId:first.intentId};
    await expect(queueReviewedVendeCorrection(
      secondContext,secondProof,queuedInput,config,http,
    )).rejects.toThrow();
    process.env.FM_COMMAND_VENDE_CORRECTION_EXECUTION_ENABLED="true";
    try{
      await expect(queueReviewedVendeCorrection(
        context,proof,queuedInput,config,http,
      )).rejects.toThrow(); // original preparer may not queue
      const unsafeRemote=(async()=>json({
        tenant_id:external,operation_status:"applied",
        applied_action:"SUSPEND_DELINQUENCY",license_status:"active",
        plan_code:"BASE",plan_revision:1,valid_until:signedExpiry,
      })) as typeof fetch;
      await expect(queueReviewedVendeCorrection(
        secondContext,secondProof,queuedInput,config,unsafeRemote,
      )).rejects.toThrow();
      expect((await pool.query(
        "SELECT count(*)::int n FROM fmcc_vende_lifecycle_command WHERE tenant_id=$1 AND subscription_id=$2",
        [tenant,cmd.subscriptionId])).rows[0].n).toBe(1);
      const parallel=await Promise.allSettled([
        queueReviewedVendeCorrection(secondContext,secondProof,queuedInput,config,http),
        queueReviewedVendeCorrection(secondContext,secondProof,queuedInput,config,http),
      ]);
      expect(parallel.filter(x=>x.status==="fulfilled")).toHaveLength(1);
      expect(parallel.filter(x=>x.status==="rejected")).toHaveLength(1);
      const queued=(parallel.find(x=>x.status==="fulfilled") as PromiseFulfilledResult<{
        intentId:string;state:string;remoteEntitlementConfirmed:boolean;
      }>).value;
      expect(queued).toMatchObject({
        intentId:first.intentId,state:"reactivation_pending",
        remoteEntitlementConfirmed:false,financialRefundExecuted:false,
        caseResolved:false,automaticDispatchExecuted:false,
      });
      const operations=(await pool.query(
        "SELECT operation_id,state,action,source_invoice_id FROM fmcc_vende_lifecycle_command WHERE tenant_id=$1 AND subscription_id=$2 ORDER BY revision",
        [tenant,cmd.subscriptionId])).rows;
      expect(operations).toHaveLength(2);
      expect(operations[1]).toMatchObject({
        operation_id:"p01.correction."+first.intentId,
        state:"pending",action:"REACTIVATE_VERIFIED",
        source_invoice_id:cmd.invoiceId,
      });
      expect((await pool.query(
        "SELECT lifecycle_state,revision FROM fmcc_vende_contract_terms WHERE tenant_id=$1 AND subscription_id=$2",
        [tenant,cmd.subscriptionId])).rows[0]).toMatchObject({
          lifecycle_state:"reactivation_pending",revision:3,
        });
      // Repeated identical authorizations cannot create another queued command.
      await expect(queueReviewedVendeCorrection(
        secondContext,secondProof,queuedInput,config,http,
      )).rejects.toThrow();
      expect((await pool.query(
        "SELECT count(*)::int n FROM fmcc_vende_lifecycle_command WHERE tenant_id=$1 AND subscription_id=$2",
        [tenant,cmd.subscriptionId])).rows[0].n).toBe(2);
      const pendingStatus=await readVendeCorrectionOutcome(secondContext,{
        productId,intentId:first.intentId,
      },config,http);
      expect(pendingStatus).toMatchObject({
        state:"queued",remoteEntitlementConfirmed:false,
        financialSettlementCurrentlyVerified:false,caseResolved:false,
      });
      // Canonical C06 one-shot dispatcher proves the target and remote ACK.
      const correctionId=(await pool.query(
        "SELECT id FROM fmcc_vende_lifecycle_command WHERE tenant_id=$1 AND operation_id=$2",
        [tenant,"p01.correction."+first.intentId])).rows[0].id as string;
      const targetUntil=fmPaidThroughExclusiveInstant(paidThrough).getTime()/1000;
      let applied=false;
      const remoteLifecycle=(async(url:RequestInfo|URL)=>{
        const path=new URL(String(url)).pathname;
        if(path.endsWith("/commercial-transition")){
          applied=true;
          return json({status:"active"});
        }
        if(path.endsWith("/commercial-status"))return json({
          tenant_id:external,operation_status:applied?"applied":"not_applied",
          applied_action:applied?"REACTIVATE_VERIFIED":null,
          license_status:applied?"active":"suspended",
          plan_code:"BASE",plan_revision:1,
          valid_until:applied?targetUntil:signedExpiry,
        });
        throw Error("unexpected_provider_endpoint");
      }) as typeof fetch;
      expect(await dispatchVendeReactivationOnce(correctionId,config,remoteLifecycle))
        .toBe("delivered");
      const verified=await readVendeCorrectionOutcome(secondContext,{
        productId,intentId:first.intentId,
      },config,remoteLifecycle);
      expect(verified).toMatchObject({
        state:"assistant_active_payment_verified",
        remoteEntitlementConfirmed:true,
        financialSettlementCurrentlyVerified:true,
        coreQuotaVerified:false,caseResolved:false,
      });
      const disputed=(async()=>json({
        tenant_id:external,operation_status:"not_applied",
        applied_action:null,license_status:"suspended",
        plan_code:"BASE",plan_revision:1,valid_until:signedExpiry,
      })) as typeof fetch;
      expect((await readVendeCorrectionOutcome(secondContext,{
        productId,intentId:first.intentId,
      },config,disputed)).state).toBe("needs_reconciliation");
      // Even a previously confirmed remote ACK is not enough after the
      // payment source records a newer independent reversal.
      await pool.query(
        "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'reversed_verified',now(),$4)",
        [tenant,cmd.invoiceId,paymentRef,"synthetic-new-financial-reversal"],
      );
      const reversed=await readVendeCorrectionOutcome(secondContext,{
        productId,intentId:first.intentId,
      },config,remoteLifecycle);
      expect(reversed).toMatchObject({
        state:"needs_reconciliation",remoteEntitlementConfirmed:false,
        financialSettlementCurrentlyVerified:false,coreQuotaVerified:false,
        caseResolved:false,
      });
    }finally{delete process.env.FM_COMMAND_VENDE_CORRECTION_EXECUTION_ENABLED;}
  });

  it("P01 refuses correction intents for stale, unauthorized or unobserved cases",async()=>{
    const cmd=await makePending();
    const proof={userId:context.userId,verifiedAt:new Date()};
    const input={productId,commandId:cmd.id,expectedReviewVersion:1};
    await expect(prepareVendeCorrectionIntent(context,proof,input)).rejects.toThrow();
    await expect(prepareVendeCorrectionIntent({...context,tenantId:"other"},proof,input))
      .rejects.toThrow();
    await expect(prepareVendeCorrectionIntent(context,{
      userId:context.userId,verifiedAt:new Date(Date.now()-310_000),
    },input)).rejects.toThrow();
    const rows=await pool.query(
      "SELECT count(*)::int total FROM fmcc_audit_event WHERE tenant_id=$1 AND resource_id=$2 AND action LIKE 'vende.compensation_correction.%'",
      [tenant,cmd.id]);
    expect(rows.rows[0].total).toBe(0);
  });

});
