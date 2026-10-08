import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const url = process.env.BILLING_TEST_DATABASE_URL;
if (!url || !/\b(fmcc_billing_test)\b/.test(url)) throw new Error("Refusing non-test database");
const pool = new Pool({connectionString:url, max:2});
const a="018f51b2-78c4-7b32-8a11-000000000001";
const b="018f51b2-78c4-7b32-8a11-000000000002";
const g="018f51b2-78c4-7b32-8a11-000000000003";
const s="018f51b2-78c4-7b32-8a11-000000000004";
const inv="018f51b2-78c4-7b32-8a11-000000000005";
const p="018f51b2-78c4-7b32-8a11-000000000006";
async function scoped(client, tenant, fn) {
 await client.query("BEGIN");
 try {
  await client.query("SET LOCAL ROLE billing_app_test");
  if(tenant) await client.query("SELECT set_config('app.billing_tenant_id',$1,true)",[tenant]);
  const result=await fn(client);
  await client.query("ROLLBACK");
  return result;
 } catch(e) {await client.query("ROLLBACK");throw e;}
}
const client=await pool.connect();
try {
 const script=readFileSync("drizzle/0004_billing_central_phase1.sql","utf8").replace(/^\uFEFF/, "");
 for(const statement of script.split("--> statement-breakpoint")) {
  if(statement.trim()) await client.query(statement);
 }
 await client.query("CREATE ROLE billing_app_test NOLOGIN NOSUPERUSER NOBYPASSRLS");
 await client.query("GRANT USAGE ON SCHEMA public TO billing_app_test");
 for(const table of ["customer","subscription","license","gateway_account","invoice","payment","provider_event"]) {
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON fmcc_billing_${table} TO billing_app_test`);
 }
 await client.query("INSERT INTO fmcc_billing_customer (id,tenant_id,display_name) VALUES ($1,'fm','FM Customer'),($2,'abc','ABC Customer')",[a,b]);
 await client.query("INSERT INTO fmcc_billing_gateway_account (id,tenant_id,provider_code,environment,credential_ref,public_label) VALUES ($1,'fm','cakto','sandbox','vault://fm/account','FM Account')",[g]);
 await client.query("INSERT INTO fmcc_billing_subscription (id,tenant_id,customer_id,product_code,plan_code) VALUES ($1,'fm',$2,'KORDENA','basic')",[s,a]);
 await client.query("INSERT INTO fmcc_billing_invoice (id,tenant_id,subscription_id,customer_id,product_code,gateway_account_id,period_start,period_end,amount_minor,currency) VALUES ($1,'fm',$2,$3,'KORDENA',$4,now(),now()+interval '1 month',19900,'BRL')",[inv,s,a,g]);
 await client.query("INSERT INTO fmcc_billing_payment (id,tenant_id,invoice_id,gateway_account_id,external_payment_id,currency,amount_minor) VALUES ($1,'fm',$2,$3,'pay-1','BRL',19900)",[p,inv,g]);
 let count=await scoped(client,"fm",async c=>(await c.query("SELECT count(*)::int AS n FROM fmcc_billing_customer")).rows[0].n);
 assert.equal(count,1,"FM tenant should see only its customer");
 count=await scoped(client,"abc",async c=>(await c.query("SELECT count(*)::int AS n FROM fmcc_billing_customer")).rows[0].n);
 assert.equal(count,1,"ABC tenant should see only its customer");
 count=await scoped(client,null,async c=>(await c.query("SELECT count(*)::int AS n FROM fmcc_billing_customer")).rows[0].n);
 assert.equal(count,0,"Unscoped role must not see customers");
 const denied=await scoped(client,"abc",async c=>{
  try{await c.query("INSERT INTO fmcc_billing_subscription (id,tenant_id,customer_id,product_code,plan_code) VALUES ($1,'fm',$2,'KORDENA','basic')",["018f51b2-78c4-7b32-8a11-000000000008",a]);return false;}catch(e){return e.code==="42501";}
 });
 assert.equal(denied,true,"RLS must reject cross-tenant insert");
 let fkDenied=false;
 try{await client.query("INSERT INTO fmcc_billing_subscription (id,tenant_id,customer_id,product_code,plan_code) VALUES ($1,'abc',$2,'KORDENA','basic')",["018f51b2-78c4-7b32-8a11-000000000009",a]);}catch(e){fkDenied=e.code==="23503";}
 assert.equal(fkDenied,true,"Composite FK must reject cross-tenant customer reference");
 let payDenied=false;
 try{await client.query("INSERT INTO fmcc_billing_payment (id,tenant_id,invoice_id,gateway_account_id,external_payment_id,currency,amount_minor) VALUES ($1,'abc',$2,$3,'cross','BRL',19900)",["018f51b2-78c4-7b32-8a11-000000000010",inv,g]);}catch(e){payDenied=e.code==="23503";}
 assert.equal(payDenied,true,"Composite FK must reject cross-tenant payment");
 let duplicateDenied=false;
 try{await client.query("INSERT INTO fmcc_billing_payment (id,tenant_id,invoice_id,gateway_account_id,external_payment_id,currency,amount_minor) VALUES ($1,'fm',$2,$3,'pay-1','BRL',19900)",["018f51b2-78c4-7b32-8a11-000000000011",inv,g]);}catch(e){duplicateDenied=e.code==="23505";}
 assert.equal(duplicateDenied,true,"Duplicate external payment must be rejected");
 console.log("PASS: migration, tenant RLS, default deny, cross-tenant FKs and provider dedupe");
} finally {client.release();await pool.end();}

