/** B1.16: PostgreSQL isolated, mock signed Assistant responses; zero live integrations. */
import {randomUUID} from "node:crypto";
import {beforeAll,afterAll,describe,it,expect} from "vitest";
import pg from "pg";
import {fmLocalCivilDate,fmPaidThroughExclusiveInstant} from "../src/domain/billing/vende-commercial-policy-v1";
import {nextVendePaidThrough} from "../src/domain/billing/vende-renewal-period";
import {requestVerifiedVendePlanChange} from "../src/application/billing/vende-plan-change-admission";
import {reapproveVendePlanChange,dispatchVendePlanChangeOnce,reconcileUnknownVendePlanChange}
  from "../src/application/billing/vende-plan-change-delivery";
import {quarantineAbandonedVendeClaims} from "../src/application/billing/vende-c06-delivery";

const database=process.env.DATABASE_URL??"";
const tenant="fm-plan-change-"+randomUUID();
const pool=new pg.Pool({connectionString:database,max:4,allowExitOnIdle:true});
const ctx={tenantId:tenant,userId:"fm-owner",role:"owner" as const,correlationId:"plan-change-pg"};
const config={organizationId:tenant,assistantOrigin:"https://assistant.example.test",
  keyId:"fm-test-key",signingKey:"synthetic-commercial-33-character-signing-key"};
let productId:string,customerId:string,gatewayId:string,externalTenant:string;
const json=(v:object)=>new Response(JSON.stringify(v),{status:200,headers:{"Content-Type":"application/json"}});
const addDays=(days:number)=>fmLocalCivilDate(new Date(Date.now()+days*86400_000));

async function create(kind:"upgrade"|"downgrade",days=10,admissionNow:Date=new Date()){
  const oldCode=kind==="upgrade"?"BASE":"PLUS";
  const newCode=kind==="upgrade"?"PLUS":"BASE";
  const oldPaid=addDays(days),oldDue=addDays(days+1);
  const previousValidUntil=fmPaidThroughExclusiveInstant(oldPaid).getTime()/1000;
  const targetPaid=kind==="upgrade"?oldPaid:nextVendePaidThrough(oldPaid,"monthly").paidThrough;
  const targetDue=kind==="upgrade"?oldDue:nextVendePaidThrough(oldDue,"monthly").paidThrough;
  const targetValidUntil=fmPaidThroughExclusiveInstant(targetPaid).getTime()/1000;
  const targetPrice=kind==="upgrade"?20000:10000;
  const subscriptionId=(await pool.query(
    "INSERT INTO fmcc_billing_subscription(tenant_id,product_id,customer_id,plan_code,status) VALUES ($1,$2,$3,$4,'active') RETURNING id",
    [tenant,productId,customerId,oldCode])).rows[0].id as string;
  await pool.query(
    "INSERT INTO fmcc_vende_contract_terms(tenant_id,product_id,subscription_id,customer_id,revision,effective_from,paid_through,due_date,auto_renew,lifecycle_state,source_ref,actor_id,created_at) VALUES ($1,$2,$3,$4,1,'2026-09-01',$5,$6,true,'active','fm-enrolled','fm-owner',now() - interval '4 days')",
    [tenant,productId,subscriptionId,customerId,oldPaid,oldDue]);
  const invoiceId=(await pool.query(
    "INSERT INTO fmcc_billing_invoice(tenant_id,product_id,customer_id,subscription_id,gateway_account_id,amount_minor,status) VALUES ($1,$2,$3,$4,$5,$6,'paid') RETURNING id",
    [tenant,productId,customerId,subscriptionId,gatewayId,targetPrice])).rows[0].id as string;
  const paymentRef="provider-plan-change-"+randomUUID();
  await pool.query(
    "INSERT INTO fmcc_billing_provider_payment(tenant_id,invoice_id,gateway_account_id,external_payment_id,status) VALUES ($1,$2,$3,$4,'received')",
    [tenant,invoiceId,gatewayId,paymentRef]);
  await pool.query(
    "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'settled_verified',$4,$5)",
    [tenant,invoiceId,paymentRef,admissionNow,"fm-authenticated-"+randomUUID()]);
  const operationId="plan-change-"+randomUUID();
  const action=kind==="upgrade"?"APPLY_UPGRADE":"APPLY_DOWNGRADE";
  const input={productId,subscriptionId,paidInvoiceId:invoiceId,expectedRevision:1,
    oldPlanRevision:1,targetPlanRevision:1,targetPlanCode:newCode,
    operationId,sourceRef:"fm-consented-plan-change",customerConsentRef:"fm-signed-customer-consent"};
  const result=await requestVerifiedVendePlanChange(ctx,
    {userId:ctx.userId,verifiedAt:admissionNow},action,input,admissionNow);
  const [command]=(await pool.query(
    "SELECT id,approved_at,delivery_target FROM fmcc_vende_lifecycle_command WHERE tenant_id=$1 AND operation_id=$2",
    [tenant,operationId])).rows;
  return {id:command.id as string,approvedAt:command.approved_at as Date,
    target:command.delivery_target as Record<string,unknown>,subscriptionId,invoiceId,
    previousValidUntil,targetValidUntil,oldPaid,oldDue,targetPaid,targetDue,
    kind,oldCode,newCode,operationId,paymentRef,result,action};
}
async function snapshot(subId:string){
  const c=(await pool.query(
    "SELECT revision,paid_through::text AS paid_through,due_date::text AS due_date FROM fmcc_vende_contract_terms WHERE subscription_id=$1",
    [subId])).rows[0];
  const p=(await pool.query("SELECT plan_code FROM fmcc_billing_subscription WHERE id=$1",[subId])).rows[0];
  return {...c,planCode:p.plan_code};
}
function status(c:Awaited<ReturnType<typeof create>>,applied:boolean,over:Record<string,unknown>={}){
  return {tenant_id:externalTenant,operation_status:applied?"applied":"not_applied",
    applied_action:applied?c.action:null,license_status:"active",
    plan_code:applied?c.newCode:c.oldCode,plan_revision:1,
    valid_until:applied?c.targetValidUntil:c.previousValidUntil,...over};
}
async function freshReceipt(c:Awaited<ReturnType<typeof create>>){
  await pool.query(
    "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'settled_verified',now(),$4)",
    [tenant,c.invoiceId,c.paymentRef,"fm-refreshed-"+randomUUID()]);
}
describe("B1.16 plan changes with a signed Assistant and isolated PostgreSQL",()=>{
  beforeAll(async()=>{
    const u=new URL(database);
    if(!["localhost","127.0.0.1"].includes(u.hostname)||
       !["/fmcc","/fmcc_billing_ci"].includes(u.pathname)||
       process.env.NODE_ENV!=="test")throw Error("isolated_postgres_required");
    process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID=tenant;
    process.env.FM_COMMAND_VENDE_C06_DELIVERY_ENABLED="true";
    productId=(await pool.query(
      "INSERT INTO fmcc_product_definition(tenant_id,slug,name) VALUES ($1,'vendeatendeia','Change CI') RETURNING id",[tenant])).rows[0].id;
    customerId=(await pool.query(
      "INSERT INTO fmcc_billing_customer(tenant_id,external_customer_id) VALUES ($1,$2) RETURNING id",
      [tenant,"fm-"+randomUUID()])).rows[0].id;
    gatewayId=(await pool.query(
      "INSERT INTO fmcc_billing_gateway_account(tenant_id,provider,environment,label,secret_ref,status) VALUES ($1,'asaas','sandbox','change','secret://synthetic','enabled') RETURNING id",[tenant])).rows[0].id;
    externalTenant="assistant-plan-"+randomUUID();
    await pool.query(
      "INSERT INTO fmcc_billing_customer_binding(tenant_id,product_id,customer_id,external_tenant_id) VALUES ($1,$2,$3,$4)",
      [tenant,productId,customerId,externalTenant]);
    for(const [code,price,req,tokens] of [["BASE",10000,100,10000],["PLUS",20000,200,20000]] as const){
      await pool.query(
        "INSERT INTO fmcc_billing_product_plan(tenant_id,product_id,plan_code,name,interval,amount_minor,status) VALUES ($1,$2,$3,$3,'monthly',$4,'active')",
        [tenant,productId,code,price]);
      await pool.query(
        "INSERT INTO fmcc_assistant_plan_revision(tenant_id,product_id,plan_code,revision,label,billing_interval,amount_minor,allowances,status,actor_id) VALUES ($1,$2,$3,1,$3,'monthly',$4,$5::jsonb,'published','fm-owner')",
        [tenant,productId,code,price,JSON.stringify([
          {resource:"ai.requests",scope:"tenant",limitUnits:req,windowSeconds:86400},
          {resource:"ai.total_tokens",scope:"tenant",limitUnits:tokens,windowSeconds:86400},
        ])]);
    }
  });
  afterAll(async()=>{
    try{
      for(const table of ["fmcc_audit_event","fmcc_vende_lifecycle_command","fmcc_vende_contract_term_audit",
        "fmcc_vende_payment_attestation","fmcc_vende_contract_terms","fmcc_assistant_plan_revision",
        "fmcc_billing_product_plan","fmcc_billing_provider_payment","fmcc_billing_invoice",
        "fmcc_billing_subscription","fmcc_billing_customer_binding","fmcc_billing_gateway_account",
        "fmcc_billing_customer","fmcc_product_definition"])
        await pool.query(`DELETE FROM ${table} WHERE tenant_id=$1`,[tenant]);
    }finally{delete process.env.FM_COMMAND_VENDE_C06_DELIVERY_ENABLED;await pool.end();}
  });
  it("paid upgrade changes only plan after one signed ACK, preserving every paid day",async()=>{
    const c=await create("upgrade");const before=await snapshot(c.subscriptionId);
    expect(c.result).toMatchObject({state:"pending",remoteEntitlementConfirmed:false,
      targetPlanCode:"PLUS"});
    expect(await snapshot(c.subscriptionId)).toEqual(before);
    let posts=0,applied=false;
    const http=(async(url:RequestInfo|URL,init?:RequestInit)=>{
      if(new URL(String(url)).pathname.endsWith("/commercial-transition")){
        posts++;const body=JSON.parse(String(init?.body));
        expect(body).toMatchObject({action:"APPLY_UPGRADE",tenant_id:externalTenant,
          expected_plan_code:"BASE",target_plan_code:"PLUS",
          expected_valid_until:c.previousValidUntil,target_valid_until:c.previousValidUntil,
          verified_payment_ref:c.paymentRef});
        applied=true;return json({accepted:true});
      }
      return json(status(c,applied));
    }) as typeof fetch;
    expect(await dispatchVendePlanChangeOnce(c.id,config,http)).toBe("delivered");
    expect(posts).toBe(1);
    expect(await snapshot(c.subscriptionId)).toEqual({...before,revision:2,planCode:"PLUS"});
    expect((await pool.query(
      "SELECT terms_snapshot->'after'->>'revision' AS revision FROM fmcc_vende_contract_term_audit WHERE subscription_id=$1 AND revision=2",
      [c.subscriptionId])).rows[0].revision).toBe("2");
    await expect(dispatchVendePlanChangeOnce(c.id,config,http)).rejects.toThrow();
    expect(posts).toBe(1);
  });
  it("downgrade preserves old quotas until paid cutoff, then needs fresh FM approval",async()=>{
    const c=await create("downgrade",10);
    const before=await snapshot(c.subscriptionId);
    expect(before.planCode).toBe("PLUS");
    expect(c.target.paidThrough).toBe(c.targetPaid);
    expect(c.target.validUntil).toBe(c.targetValidUntil);
    const never=(async()=>{throw Error("forbidden before paid period");}) as typeof fetch;
    await expect(dispatchVendePlanChangeOnce(c.id,config,never)).rejects.toThrow();
    expect(await snapshot(c.subscriptionId)).toEqual(before);
    // A later human approval must not advance the date or skip the deadline.
    await pool.query("UPDATE fmcc_vende_lifecycle_command SET approved_at=now()-interval '6 minutes' WHERE id=$1",[c.id]);
    await expect(reapproveVendePlanChange(ctx,
      {userId:ctx.userId,verifiedAt:new Date()},"APPLY_DOWNGRADE",
      {productId,commandId:c.id,expectedApprovedAt:new Date(Date.now()-360000).toISOString()}
    )).rejects.toThrow();
    expect((await pool.query("SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",[c.id])).rows[0].state).toBe("pending");
  });
  it("delayed downgrade after paid boundary can apply with exact ACK and new cycle",async()=>{
    const earlier=new Date(Date.now()-2*86400_000);
    const c=await create("downgrade",-1,earlier);
    await freshReceipt(c);
    const input={productId,commandId:c.id,expectedApprovedAt:c.approvedAt.toISOString()};
    const proof={userId:ctx.userId,verifiedAt:new Date()};
    const approvals=await Promise.allSettled([
      reapproveVendePlanChange(ctx,proof,"APPLY_DOWNGRADE",input),
      reapproveVendePlanChange(ctx,proof,"APPLY_DOWNGRADE",input),
    ]);
    expect(approvals.filter(x=>x.status==="fulfilled")).toHaveLength(1);
    let applied=false,posts=0;
    const http=(async(url:RequestInfo|URL,init?:RequestInit)=>{
      if(new URL(String(url)).pathname.endsWith("/commercial-transition")){
        posts++;const body=JSON.parse(String(init?.body));
        expect(body).toMatchObject({action:"APPLY_DOWNGRADE",expected_plan_code:"PLUS",
          target_plan_code:"BASE",expected_valid_until:c.previousValidUntil,
          target_valid_until:c.targetValidUntil});
        applied=true;return json({ok:true});
      }
      return json(status(c,applied));
    }) as typeof fetch;
    expect(await dispatchVendePlanChangeOnce(c.id,config,http)).toBe("delivered");
    expect(posts).toBe(1);
    expect(await snapshot(c.subscriptionId)).toEqual({
      revision:2,paid_through:c.targetPaid,due_date:c.targetDue,planCode:"BASE"});
  });
  it("unknown remote POST is reconciled read-only; incorrect ACK never grants a plan",async()=>{
    const c=await create("upgrade");let sent=false,posts=0;
    const http=(async(url:RequestInfo|URL)=>{
      if(new URL(String(url)).pathname.endsWith("/commercial-transition")){
        sent=true;posts++;throw Error("lost reply after remote commit");
      }
      return json(status(c,sent));
    }) as typeof fetch;
    expect(await dispatchVendePlanChangeOnce(c.id,config,http)).toBe("unknown");
    expect((await snapshot(c.subscriptionId)).planCode).toBe("BASE");
    expect(await reconcileUnknownVendePlanChange(c.id,config,http)).toBe("delivered");
    expect(posts).toBe(1);expect((await snapshot(c.subscriptionId)).planCode).toBe("PLUS");
    const mismatch=await create("upgrade");let applied=false,post=0;
    const bad=(async(url:RequestInfo|URL)=>{
      if(new URL(String(url)).pathname.endsWith("/commercial-transition")){
        applied=true;post++;return json({ok:true});
      }
      return json(status(mismatch,applied,applied?{plan_revision:999}:{}));
    }) as typeof fetch;
    expect(await dispatchVendePlanChangeOnce(mismatch.id,config,bad)).toBe("unknown");
    expect(await reconcileUnknownVendePlanChange(mismatch.id,config,bad)).toBe("unknown");
    expect(post).toBe(1);
    expect((await snapshot(mismatch.subscriptionId)).planCode).toBe("BASE");
  });
  it("financial reversal, wrong tenant, replay and orphan quarantine all fail closed",async()=>{
    const c=await create("upgrade");
    await pool.query("UPDATE fmcc_billing_provider_payment SET status='refunded' WHERE invoice_id=$1",[c.invoiceId]);
    await expect(dispatchVendePlanChangeOnce(c.id,config,(async()=>json({})) as typeof fetch)).rejects.toThrow();
    await expect(requestVerifiedVendePlanChange({...ctx,tenantId:"wrong"},
      {userId:ctx.userId,verifiedAt:new Date()},"APPLY_UPGRADE",
      {productId,subscriptionId:c.subscriptionId,paidInvoiceId:c.invoiceId,
        expectedRevision:1,oldPlanRevision:1,targetPlanRevision:1,
        targetPlanCode:"PLUS",operationId:"fm-change-second-"+randomUUID(),
        sourceRef:"fm-source-again",customerConsentRef:"fm-consent-again"})).rejects.toThrow();
    const orphan=await create("upgrade");
    await pool.query("UPDATE fmcc_vende_lifecycle_command SET state='processing',claimed_at=now()-interval '20 minutes' WHERE id=$1",[orphan.id]);
    expect(await quarantineAbandonedVendeClaims(config)).toBeGreaterThanOrEqual(1);
    expect((await pool.query("SELECT state FROM fmcc_vende_lifecycle_command WHERE id=$1",[orphan.id])).rows[0].state).toBe("unknown");
    expect(await reconcileUnknownVendePlanChange(orphan.id,config,
      (async()=>json(status(orphan,false))) as typeof fetch)).toBe("unknown");
  });
});
