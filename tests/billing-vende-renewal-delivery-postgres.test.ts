/** B1.15 isolated PostgreSQL, synthetic Assistant only. No real calls. */
import {randomUUID} from "node:crypto";
import {beforeAll,afterAll,describe,it,expect} from "vitest";
import pg from "pg";
import {fmLocalCivilDate,fmPaidThroughExclusiveInstant} from "../src/domain/billing/vende-commercial-policy-v1";
import {nextVendePaidThrough} from "../src/domain/billing/vende-renewal-period";
import {dispatchVendeRenewalOnce,reconcileUnknownVendeRenewal,reapproveVendeRenewal}
  from "../src/application/billing/vende-renewal-delivery";
import {quarantineAbandonedVendeClaims} from "../src/application/billing/vende-c06-delivery";

const database=process.env.DATABASE_URL??"";
const tenant="fm-renew-delivery-"+randomUUID();
const pool=new pg.Pool({connectionString:database,max:4,allowExitOnIdle:true});
const context={tenantId:tenant,userId:"fm-owner",role:"owner" as const,correlationId:"renewal-delivery"};
const config={organizationId:tenant,assistantOrigin:"https://assistant.example.test",
  keyId:"fm-test-key",signingKey:"synthetic-commercial-33-character-signing-key"};
let productId:string,customerId:string,gatewayId:string,external:string;
const json=(v:object)=>new Response(JSON.stringify(v),{status:200,headers:{"Content-Type":"application/json"}});

async function makeRenewal(){
  const oldPaid=fmLocalCivilDate(new Date(Date.now()+15*86400_000));
  const oldDue=fmLocalCivilDate(new Date(Date.now()+16*86400_000));
  const next=nextVendePaidThrough(oldPaid,"monthly");
  const nextDue=nextVendePaidThrough(oldDue,"monthly").paidThrough;
  const oldValid=fmPaidThroughExclusiveInstant(oldPaid).getTime()/1000;
  const subscriptionId=(await pool.query(
    "INSERT INTO fmcc_billing_subscription(tenant_id,product_id,customer_id,plan_code,status) VALUES ($1,$2,$3,'BASE','active') RETURNING id",
    [tenant,productId,customerId])).rows[0].id as string;
  await pool.query(
    "INSERT INTO fmcc_vende_contract_terms(tenant_id,product_id,subscription_id,customer_id,revision,effective_from,paid_through,due_date,auto_renew,lifecycle_state,source_ref,actor_id,created_at) VALUES ($1,$2,$3,$4,1,'2026-09-01',$5,$6,true,'active','fm-original','fm-owner',now() - interval '2 days')",
    [tenant,productId,subscriptionId,customerId,oldPaid,oldDue]);
  const invoiceId=(await pool.query(
    "INSERT INTO fmcc_billing_invoice(tenant_id,product_id,customer_id,subscription_id,gateway_account_id,amount_minor,status) VALUES ($1,$2,$3,$4,$5,15900,'paid') RETURNING id",
    [tenant,productId,customerId,subscriptionId,gatewayId])).rows[0].id as string;
  const paymentRef="provider-renew-"+randomUUID();
  await pool.query(
    "INSERT INTO fmcc_billing_provider_payment(tenant_id,invoice_id,gateway_account_id,external_payment_id,status) VALUES ($1,$2,$3,$4,'received')",
    [tenant,invoiceId,gatewayId,paymentRef]);
  await pool.query(
    "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'settled_verified',now(),'verified-renewal-provider')",
    [tenant,invoiceId,paymentRef]);
  const operationId="renew-"+randomUUID();
  const target={schema:"fm.vende.renewal-target.v1",planCode:"BASE",planRevision:1,
    validUntil:next.validUntil,paymentRef,termsRevision:2,previousValidUntil:oldValid,
    paidThrough:next.paidThrough,nextDueDate:nextDue,amountMinor:15900,billingInterval:"monthly"};
  const prior=new Date(Date.now()-301000);
  const id=(await pool.query(
    "INSERT INTO fmcc_vende_lifecycle_command(tenant_id,product_id,subscription_id,customer_id,source_invoice_id,operation_id,expected_revision,revision,action,state,external_tenant_id,effective_date,source_ref,actor_id,approved_at,delivery_target) VALUES ($1,$2,$3,$4,$5,$6,1,2,'RENEW_VERIFIED','pending',$7,$8,'fm-reviewed-renewal','fm-previous-reviewer',$9,$10::jsonb) RETURNING id",
    [tenant,productId,subscriptionId,customerId,invoiceId,operationId,external,next.paidThrough,prior,JSON.stringify(target)])).rows[0].id as string;
  return {id,subscriptionId,invoiceId,operationId,prior,oldPaid,oldDue,oldValid,target,paymentRef};
}
async function approved(command:Awaited<ReturnType<typeof makeRenewal>>){
  return reapproveVendeRenewal(context,{userId:context.userId,verifiedAt:new Date()},
    {productId,commandId:command.id,expectedApprovedAt:command.prior.toISOString()});
}
function remote(command:Awaited<ReturnType<typeof makeRenewal>>,mutated:boolean,override:Record<string,unknown>={}){
  return {tenant_id:external,operation_status:mutated?"applied":"not_applied",
    applied_action:mutated?"RENEW_VERIFIED":null,license_status:"active",
    plan_code:"BASE",plan_revision:1,valid_until:mutated?command.target.validUntil:command.oldValid,
    ...override};
}
async function term(subscriptionId:string){
  return (await pool.query(
    "SELECT revision,paid_through::text AS paid_through,due_date::text AS due_date FROM fmcc_vende_contract_terms WHERE subscription_id=$1",
    [subscriptionId])).rows[0] as {revision:number;paid_through:string;due_date:string};
}
describe("B1.15 renewal one-shot + read-only reconciliation",()=>{
  beforeAll(async()=>{
    const u=new URL(database);
    if(!["localhost","127.0.0.1"].includes(u.hostname)||
      !["/fmcc","/fmcc_billing_ci"].includes(u.pathname)||process.env.NODE_ENV!=="test")
      throw Error("isolated_postgres_required");
    process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID=tenant;
    process.env.FM_COMMAND_VENDE_C06_DELIVERY_ENABLED="true";
    productId=(await pool.query("INSERT INTO fmcc_product_definition(tenant_id,slug,name) VALUES ($1,'vendeatendeia','Renewal CI') RETURNING id",[tenant])).rows[0].id;
    customerId=(await pool.query("INSERT INTO fmcc_billing_customer(tenant_id,external_customer_id) VALUES ($1,$2) RETURNING id",
      [tenant,"renew-"+randomUUID()])).rows[0].id;
    gatewayId=(await pool.query("INSERT INTO fmcc_billing_gateway_account(tenant_id,provider,environment,label,secret_ref,status) VALUES ($1,'asaas','sandbox','renewal','secret://synthetic','enabled') RETURNING id",[tenant])).rows[0].id;
    external="assistant-renew-"+randomUUID();
    await pool.query("INSERT INTO fmcc_billing_customer_binding(tenant_id,product_id,customer_id,external_tenant_id) VALUES ($1,$2,$3,$4)",
      [tenant,productId,customerId,external]);
    await pool.query("INSERT INTO fmcc_billing_product_plan(tenant_id,product_id,plan_code,name,interval,amount_minor,status) VALUES ($1,$2,'BASE','FM Monthly','monthly',15900,'active')",[tenant,productId]);
    await pool.query("INSERT INTO fmcc_assistant_plan_revision(tenant_id,product_id,plan_code,revision,label,billing_interval,amount_minor,allowances,status,actor_id) VALUES ($1,$2,'BASE',1,'FM Monthly','monthly',15900,$3::jsonb,'published','fm-owner')",
      [tenant,productId,JSON.stringify([{resource:"ai.requests",scope:"tenant",limitUnits:100,windowSeconds:86400},
        {resource:"ai.total_tokens",scope:"tenant",limitUnits:10000,windowSeconds:86400}])]);
  });
  afterAll(async()=>{
    try{
      for(const table of ["fmcc_audit_event","fmcc_vende_lifecycle_command","fmcc_vende_contract_term_audit",
        "fmcc_vende_payment_attestation","fmcc_vende_contract_terms","fmcc_assistant_plan_revision",
        "fmcc_billing_product_plan","fmcc_billing_provider_payment","fmcc_billing_invoice",
        "fmcc_billing_subscription","fmcc_billing_customer_binding","fmcc_billing_gateway_account",
        "fmcc_billing_customer","fmcc_product_definition"])
        await pool.query(`DELETE FROM ${table} WHERE tenant_id=$1`,[tenant]);
    }finally{
      delete process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID;
      delete process.env.FM_COMMAND_VENDE_C06_DELIVERY_ENABLED;
      await pool.end();
    }
  });
  it("requires a new human step-up; first ACK exact extends one month once and writes a historical snapshot",async()=>{
    const cmd=await makeRenewal();
    const before=await term(cmd.subscriptionId);
    await expect(dispatchVendeRenewalOnce(cmd.id,config,(async()=>{throw Error("network forbidden");}) as typeof fetch)).rejects.toThrow();
    expect(await term(cmd.subscriptionId)).toEqual(before);
    const pair=await Promise.allSettled([approved(cmd),approved(cmd)]);
    expect(pair.filter(x=>x.status==="fulfilled")).toHaveLength(1);
    let posts=0,applied=false;
    const http=(async(url:RequestInfo|URL,init?:RequestInit)=>{
      if(new URL(String(url)).pathname.endsWith("/commercial-transition")){
        posts++;const body=JSON.parse(String(init?.body));
        expect(body).toMatchObject({action:"RENEW_VERIFIED",tenant_id:external,
          command_request_id:cmd.operationId,expected_plan_revision:1,
          target_plan_revision:1,expected_valid_until:cmd.oldValid,
          target_valid_until:cmd.target.validUntil,verified_payment_ref:cmd.paymentRef});
        applied=true;return json({ok:true});
      }
      return json(remote(cmd,applied));
    }) as typeof fetch;
    expect(await dispatchVendeRenewalOnce(cmd.id,config,http)).toBe("delivered");
    expect(posts).toBe(1);
    expect(await term(cmd.subscriptionId)).toEqual({
      revision:2,paid_through:cmd.target.paidThrough,due_date:cmd.target.nextDueDate});
    const history=(await pool.query(
      "SELECT terms_snapshot FROM fmcc_vende_contract_term_audit WHERE tenant_id=$1 AND subscription_id=$2 AND revision=2",
      [tenant,cmd.subscriptionId])).rows;
    expect(history).toHaveLength(1);
    expect(history[0].terms_snapshot).toMatchObject({schema:"fm.vende.contract-terms.v1",
      before:{paidThrough:cmd.oldPaid,revision:1},
      after:{paidThrough:cmd.target.paidThrough,revision:2}});
    await expect(dispatchVendeRenewalOnce(cmd.id,config,http)).rejects.toThrow();
    expect(posts).toBe(1);
  });
  it("on remote timeout, preserve original contract and recover only by signed status (no replay)",async()=>{
    const cmd=await makeRenewal();await approved(cmd);
    let applied=false,posts=0,reads=0;
    const http=(async(url:RequestInfo|URL)=>{
      if(new URL(String(url)).pathname.endsWith("/commercial-transition")){
        posts++;applied=true;throw Error("lost HTTP response AFTER remote apply");
      }
      reads++;return json(remote(cmd,applied));
    }) as typeof fetch;
    expect(await dispatchVendeRenewalOnce(cmd.id,config,http)).toBe("unknown");
    expect((await term(cmd.subscriptionId)).revision).toBe(1);
    expect(await reconcileUnknownVendeRenewal(cmd.id,config,http)).toBe("delivered");
    expect(posts).toBe(1);expect(reads).toBe(2);
    expect((await term(cmd.subscriptionId)).revision).toBe(2);
  });
  it("denies invalid remote ACK, reversed payment, tenant mismatch and does not invent entitlement",async()=>{
    const mismatch=await makeRenewal();await approved(mismatch);
    let applied=false,posts=0;
    const bad=(async(url:RequestInfo|URL)=>{
      if(new URL(String(url)).pathname.endsWith("/commercial-transition")){
        posts++;applied=true;return json({ok:true});
      }
      return json(remote(mismatch,applied,applied?{plan_revision:2}:{}));
    }) as typeof fetch;
    expect(await dispatchVendeRenewalOnce(mismatch.id,config,bad)).toBe("unknown");
    expect(await reconcileUnknownVendeRenewal(mismatch.id,config,bad)).toBe("unknown");
    expect(posts).toBe(1);
    expect((await term(mismatch.subscriptionId)).revision).toBe(1);
    const reversed=await makeRenewal();await approved(reversed);
    await pool.query("UPDATE fmcc_billing_provider_payment SET status='refunded' WHERE invoice_id=$1",[reversed.invoiceId]);
    await expect(dispatchVendeRenewalOnce(reversed.id,config,(async()=>{throw Error("no network");}) as typeof fetch)).rejects.toThrow();
    expect((await term(reversed.subscriptionId)).revision).toBe(1);
    await expect(reapproveVendeRenewal({...context,tenantId:"other"},{userId:context.userId,verifiedAt:new Date()},
      {productId,commandId:reversed.id,expectedApprovedAt:null})).rejects.toThrow();
  });
  it("quarantines abandoned renewal claim without automatic resend",async()=>{
    const cmd=await makeRenewal();
    await pool.query("UPDATE fmcc_vende_lifecycle_command SET state='processing',claimed_at=now()-interval '20 minutes' WHERE id=$1",[cmd.id]);
    expect(await quarantineAbandonedVendeClaims(config)).toBeGreaterThanOrEqual(1);
    expect((await pool.query("SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",
      [cmd.id])).rows[0].state).toBe("unknown");
    const status=await reconcileUnknownVendeRenewal(cmd.id,config,
      (async()=>json(remote(cmd,false))) as typeof fetch);
    expect(status).toBe("unknown");
  });
});
