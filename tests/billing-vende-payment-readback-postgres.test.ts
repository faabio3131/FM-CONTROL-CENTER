import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,describe,it,expect } from "vitest";
import pg from "pg";
import { db } from "../src/infrastructure/db/client";
import { VendePaymentReadbackService } from "../src/application/billing/vende-payment-readback-service";
import { AsaasVendePaymentReadOnlyClient } from "../src/infrastructure/billing/asaas-vende-payment-readonly-client";
import { currentBoundVendePaymentEvidence } from "../src/application/billing/vende-payment-evidence";

const url=process.env.DATABASE_URL??"";
const pool=new pg.Pool({connectionString:url,max:5,allowExitOnIdle:true});
const tenant="vende-readback-"+randomUUID();
const context={tenantId:tenant,userId:"fm-owner",role:"owner" as const,correlationId:"readback-ci"};
const at=new Date("2026-10-21T13:00:00Z");
const proof={userId:context.userId,verifiedAt:at};
let productId:string,customerId:string,gatewayId:string;
let calls=0;
function service(http:typeof fetch,clock:()=>Date=()=>at){
  return new VendePaymentReadbackService(new AsaasVendePaymentReadOnlyClient(async scope=>{
    expect(scope).toMatchObject({tenantId:tenant,gatewayAccountId:gatewayId,secretRef:"vault://synthetic/account"});
    return "synthetic-never-real-api-key";
  },http),clock);
}
async function fixture(){
  const sub=(await pool.query("INSERT INTO fmcc_billing_subscription(tenant_id,product_id,customer_id,plan_code,status) VALUES ($1,$2,$3,'BASE','active') RETURNING id",[tenant,productId,customerId])).rows[0].id;
  const invoiceId=(await pool.query("INSERT INTO fmcc_billing_invoice(tenant_id,product_id,customer_id,subscription_id,gateway_account_id,amount_minor,status) VALUES ($1,$2,$3,$4,$5,14990,'pending') RETURNING id",[tenant,productId,customerId,sub,gatewayId])).rows[0].id as string;
  const paymentId="pay_"+randomUUID();
  await pool.query("INSERT INTO fmcc_billing_provider_payment(tenant_id,invoice_id,gateway_account_id,external_payment_id,status) VALUES ($1,$2,$3,$4,'pending')",[tenant,invoiceId,gatewayId,paymentId]);
  return {invoiceId,paymentId,productId,observationId:randomUUID()};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
const payer="cus_synthetic";
function payload(f:Fixture,status="PENDING"){
  return {id:f.paymentId,customer:payer,externalReference:f.invoiceId,value:149.90,billingType:"PIX",deleted:false,status};
}
const json=(value:unknown)=>new Response(JSON.stringify(value),{status:200});
async function bind(svc:VendePaymentReadbackService,f:Fixture){
  return svc.bindPayer(context,proof,{...f,providerCustomerRef:payer,sourceRef:"fm-approved-payer-map"});
}
async function evidence(f:Fixture){
  return db.transaction(tx=>currentBoundVendePaymentEvidence(tx,{tenantId:tenant,id:f.invoiceId,gatewayAccountId:gatewayId},at));
}
async function seedOldProof(f:Fixture){
  await pool.query("INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'unpaid_verified',$4,'old-future-skew-proof')",
    [tenant,f.invoiceId,f.paymentId,new Date(at.getTime()+10_000)]);
  expect(await evidence(f)).not.toBeNull();
}

describe("Vende PSP producer — real disposable SQL, synthetic HTTP only",()=>{
  beforeAll(async()=>{
    const parsed=new URL(url);
    if(!["localhost","127.0.0.1"].includes(parsed.hostname) || !["/fmcc","/fmcc_billing_ci"].includes(parsed.pathname) || process.env.NODE_ENV!=="test")throw Error("isolated_postgres_required");
    process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID=tenant;
    process.env.FM_COMMAND_VENDE_PAYMENT_READBACK_ENABLED="true";
    productId=(await pool.query("INSERT INTO fmcc_product_definition(tenant_id,slug,name) VALUES ($1,'vendeatendeia','Vende readback') RETURNING id",[tenant])).rows[0].id;
    customerId=(await pool.query("INSERT INTO fmcc_billing_customer(tenant_id,external_customer_id) VALUES ($1,$2) RETURNING id",[tenant,"saas-customer-"+randomUUID()])).rows[0].id;
    gatewayId=(await pool.query("INSERT INTO fmcc_billing_gateway_account(tenant_id,provider,environment,label,secret_ref,status) VALUES ($1,'asaas','sandbox','synthetic-readback','vault://synthetic/account','enabled') RETURNING id",[tenant])).rows[0].id;
  });
  afterAll(async()=>{
    delete process.env.FM_COMMAND_VENDE_PAYMENT_READBACK_ENABLED;
    try{
      for(const table of ["fmcc_vende_payment_readback_attempt","fmcc_vende_payment_readback_binding","fmcc_vende_payment_attestation","fmcc_billing_audit_event","fmcc_billing_provider_payment","fmcc_billing_invoice","fmcc_billing_subscription","fmcc_billing_gateway_account","fmcc_billing_customer","fmcc_product_definition"])
        await pool.query(`DELETE FROM ${table} WHERE tenant_id=$1`,[tenant]);
    }finally{await pool.end();}
  });
  it("enforces FM actor, step-up, product scope, explicit flag and immutable payer mapping",async()=>{
    const f=await fixture();const svc=service((async()=>{calls++;throw Error("must not call");}) as typeof fetch);
    const draft={...f,providerCustomerRef:payer,sourceRef:"fm-approved-payer-map"};
    for(const ctx of [{...context,role:"viewer" as const},{...context,tenantId:"foreign"}])
      await expect(svc.bindPayer(ctx,proof,draft)).rejects.toThrow();
    await expect(svc.bindPayer(context,{...proof,userId:"foreign"},draft)).rejects.toThrow();
    await expect(svc.bindPayer(context,proof,{...draft,productId:randomUUID()})).rejects.toThrow();
    const first=await bind(svc,f);expect(await bind(svc,f)).toEqual(first);
    await expect(svc.bindPayer(context,proof,{...draft,providerCustomerRef:"cus_other"})).rejects.toThrow();
    delete process.env.FM_COMMAND_VENDE_PAYMENT_READBACK_ENABLED;
    await expect(svc.observe(context,proof,f)).rejects.toThrow();
    process.env.FM_COMMAND_VENDE_PAYMENT_READBACK_ENABLED="true";
    expect(calls).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM fmcc_vende_payment_readback_attempt WHERE invoice_id=$1",[f.invoiceId])).rows[0].n).toBe(0);
  });
  it("returns only bounded corporate invoice metadata without secrets or foreign state",async()=>{
    const f=await fixture();let reads=0;
    const svc=service((async()=>{reads++;return json(payload(f));}) as typeof fetch);
    expect(await svc.inspect(context,f)).toMatchObject({invoiceId:f.invoiceId,binding:null,attempts:[]});
    await bind(svc,f);
    for(let n=0;n<21;n++)await svc.observe(context,proof,{...f,observationId:randomUUID()});
    delete process.env.FM_COMMAND_VENDE_PAYMENT_READBACK_ENABLED;
    try{
      const view=await svc.inspect(context,f);
      expect(view.attempts).toHaveLength(20);expect(view.truncated).toBe(true);
      expect(view.readbackEnabled).toBe(false);expect(view.binding?.providerCustomerRef).toBe(payer);
      const serialized=JSON.stringify(view);
      for(const forbidden of ["secretRef","snapshotHash","synthetic-never-real-api-key","vault://","actorId","tenantId"])
        expect(serialized).not.toContain(forbidden);
      await expect(svc.inspect({...context,tenantId:"foreign"},f)).rejects.toThrow();
      await expect(svc.inspect({...context,role:"viewer"},f)).rejects.toThrow();
      await expect(svc.inspect(context,{...f,productId:randomUUID()})).rejects.toThrow();
      await expect(svc.inspect(context,{...f,invoiceId:randomUUID()})).rejects.toThrow();
      expect(reads).toBe(21);
    }finally{process.env.FM_COMMAND_VENDE_PAYMENT_READBACK_ENABLED="true";}
  });
  it.each(["PENDING","RECEIVED","REFUNDED","CONFIRMED"])("records %s without mutating payment, invoice or entitlement",async status=>{
    const f=await fixture();let reads=0;
    const svc=service((async()=>{reads++;return json(payload(f,status));}) as typeof fetch);
    await bind(svc,f);
    const expected=status==="CONFIRMED"?"needs_attention":"recorded";
    expect(await svc.observe(context,proof,f)).toEqual({state:expected,replayed:false});
    expect(await svc.observe(context,proof,f)).toEqual({state:expected,replayed:true});
    expect(reads).toBe(1);
    const rows=(await pool.query("SELECT outcome,source_ref FROM fmcc_vende_payment_attestation WHERE invoice_id=$1 ORDER BY observation_sequence",[f.invoiceId])).rows;
    expect(rows).toHaveLength(2);expect(rows[0].outcome).toBe("needs_attention");
    expect(rows[1].outcome).toBe(({PENDING:"unpaid_verified",RECEIVED:"settled_verified",REFUNDED:"reversed_verified",CONFIRMED:"needs_attention"})[status]);
    expect(JSON.stringify(rows)).not.toContain("synthetic-never-real-api-key");
    expect((await pool.query("SELECT status FROM fmcc_billing_invoice WHERE id=$1",[f.invoiceId])).rows[0].status).toBe("pending");
    expect((await pool.query("SELECT status FROM fmcc_billing_provider_payment WHERE invoice_id=$1",[f.invoiceId])).rows[0].status).toBe("pending");
    const other=await fixture();await bind(svc,other);
    await expect(svc.observe(context,proof,{...other,observationId:f.observationId})).rejects.toThrow();
    expect(reads).toBe(1);
  });
  it("serializes observations and invalidates old proof before HTTP completes",async()=>{
    const f=await fixture();await seedOldProof(f);
    let release!:()=>void,entered!:()=>void;
    const started=new Promise<void>(resolve=>{entered=resolve;});
    const gate=new Promise<void>(resolve=>{release=resolve;});let reads=0;
    const svc=service((async()=>{reads++;entered();await gate;return json(payload(f));}) as typeof fetch);
    await bind(svc,f);
    const first=svc.observe(context,proof,f);
    await started;
    try{
      expect(await evidence(f)).toBeNull();
      expect(await svc.observe(context,proof,f)).toEqual({state:"processing",replayed:true});
      await expect(svc.observe(context,proof,{...f,observationId:randomUUID()})).rejects.toThrow();
    }finally{release();}
    expect(await first).toEqual({state:"recorded",replayed:false});expect(reads).toBe(1);
    // Earlier future-skew proof cannot be reused; fresh verification may follow later.
    const rows=(await pool.query("SELECT count(*)::int AS n FROM fmcc_vende_payment_readback_attempt WHERE invoice_id=$1",[f.invoiceId])).rows;
    expect(rows[0].n).toBe(1);
  });
  it("uncertain responses invalidate old future-skew positive proof and never retry",async()=>{
    for(const mode of ["timeout","mismatch","unknown"]){
      const f=await fixture();await seedOldProof(f);let reads=0;
      const svc=service((async()=>{reads++;
        if(mode==="timeout")throw Error("secret-that-must-not-leak");
        return json(mode==="mismatch"?{...payload(f),customer:"cus_attacker"}:payload(f,"CONFIRMED"));
      }) as typeof fetch);
      await bind(svc,f);
      expect(await svc.observe(context,proof,f)).toEqual({state:"needs_attention",replayed:false});
      expect(await evidence(f)).toBeNull();
      await svc.observe(context,proof,f);expect(reads).toBe(1);
      const stored=(await pool.query("SELECT reason FROM fmcc_vende_payment_readback_attempt WHERE invoice_id=$1",[f.invoiceId])).rows;
      expect(JSON.stringify(stored)).not.toContain("secret-that-must-not-leak");
    }
  });
  it("revalidates canonical state after HTTP and rejects stale or revoked observations",async()=>{
    for(const mode of ["amount","revoked","deadline"]){
      const f=await fixture();let clock=at;
      const svc=service((async()=>{
        if(mode==="amount")await pool.query("UPDATE fmcc_billing_invoice SET amount_minor=19990 WHERE id=$1",[f.invoiceId]);
        if(mode==="revoked")await pool.query("UPDATE fmcc_billing_gateway_account SET status='revoked' WHERE id=$1",[gatewayId]);
        if(mode==="deadline")clock=new Date(at.getTime()+31_000);
        return json(payload(f));
      }) as typeof fetch,()=>clock);
      await bind(svc,f);
      try{expect(await svc.observe(context,proof,f)).toEqual({state:"needs_attention",replayed:false});}
      finally{await pool.query("UPDATE fmcc_billing_gateway_account SET status='enabled' WHERE id=$1",[gatewayId]);}
    }
  });
  it("quarantines an abandoned observation without HTTP and prevents a late writer",async()=>{
    const f=await fixture();let clock=at;let release!:()=>void,entered!:()=>void;let reads=0;
    const started=new Promise<void>(resolve=>{entered=resolve;});
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const svc=service((async()=>{reads++;entered();await gate;return json(payload(f));}) as typeof fetch,()=>clock);
    await bind(svc,f);const first=svc.observe(context,proof,f);await started;
    clock=new Date(at.getTime()+31_000);
    const rejection=expect(first).rejects.toThrow();
    try{
      expect(await svc.quarantine(context,{...proof,verifiedAt:clock},f)).toEqual({quarantined:1});
      expect(await svc.quarantine(context,{...proof,verifiedAt:clock},f)).toEqual({quarantined:0});
    }finally{release();}
    await rejection;expect(reads).toBe(1);expect(await evidence(f)).toBeNull();
  });
});
