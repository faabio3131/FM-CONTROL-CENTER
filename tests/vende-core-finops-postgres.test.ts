/** F9: real disposable FM Command PostgreSQL product/client binding and signed
 * Core FinOps read. No external service, provider, customer charge or migrations.
 */
import {randomUUID} from "node:crypto";
import {beforeAll,afterAll,describe,it,expect} from "vitest";
import pg from "pg";
import {
  CORE_FINOPS_REPORT_SCHEMA,CORE_FINOPS_REPORT_PATH,
  listVendeFinopsBoundTenants,readVendeCoreFinops,
  signCommandCoreFinops,
} from "../src/application/billing/vende-core-finops-reader";

const database=process.env.DATABASE_URL??"";
const tenant="fm-finops-"+randomUUID();
const externalTenantId="assistant-"+randomUUID();
const pool=new pg.Pool({connectionString:database,max:2,allowExitOnIdle:true});
const context={
  tenantId:tenant,userId:"fm-owner",role:"owner" as const,correlationId:"finops-pg",
};
const config={
  origin:"https://core.example.test",
  secret:"synthetic-fm-to-core-finops-secret-123456789",
};
const savedOrg=process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID;
let productId:string,otherProductId:string,customerId:string;
const now=new Date();
const date=now.toISOString().slice(0,10);

describe("F9 FM→Core cost report tenant/product binding PostgreSQL",()=>{
  beforeAll(async()=>{
    const url=new URL(database);
    if(!["localhost","127.0.0.1"].includes(url.hostname)||
       !["/fmcc","/fmcc_billing_ci"].includes(url.pathname)||
       process.env.NODE_ENV!=="test")throw Error("isolated_postgres_required");
    process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID=tenant;
    productId=(await pool.query(
      "INSERT INTO fmcc_product_definition(tenant_id,slug,name) VALUES ($1,'vendeatendeia','FinOps CI') RETURNING id",
      [tenant])).rows[0].id as string;
    otherProductId=(await pool.query(
      "INSERT INTO fmcc_product_definition(tenant_id,slug,name) VALUES ($1,'kordena','Not Vende') RETURNING id",
      [tenant])).rows[0].id as string;
    customerId=(await pool.query(
      "INSERT INTO fmcc_billing_customer(tenant_id,external_customer_id) VALUES ($1,$2) RETURNING id",
      [tenant,"ci-"+randomUUID()])).rows[0].id as string;
    await pool.query(
      "INSERT INTO fmcc_billing_customer_binding(tenant_id,product_id,customer_id,external_tenant_id) VALUES ($1,$2,$3,$4)",
      [tenant,productId,customerId,externalTenantId]);
  });
  afterAll(async()=>{
    try{
      if(productId){
        await pool.query("DELETE FROM fmcc_billing_customer_binding WHERE tenant_id=$1",[tenant]);
        await pool.query("DELETE FROM fmcc_billing_customer WHERE tenant_id=$1",[tenant]);
        await pool.query("DELETE FROM fmcc_product_definition WHERE tenant_id=$1",[tenant]);
      }
    }finally{
      if(savedOrg===undefined)delete process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID;
      else process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID=savedOrg;
      await pool.end();
    }
  });
  it("selects only corporate FM bindings for the intended product",async()=>{
    const tenants=await listVendeFinopsBoundTenants(context,productId);
    expect(tenants).toEqual({items:[externalTenantId],truncated:false});
    await expect(listVendeFinopsBoundTenants(context,otherProductId)).rejects.toThrow();
    await expect(listVendeFinopsBoundTenants({...context,tenantId:"foreign-org"},productId))
      .rejects.toThrow();
  });
  it("enforces customer binding before signing the Core financial report",async()=>{
    let calls=0;
    const http=(async(url:RequestInfo|URL,options?:RequestInit)=>{
      calls++;
      expect(String(url)).toBe(config.origin+CORE_FINOPS_REPORT_PATH);
      const body=options?.body as string;
      const payload=JSON.parse(body) as Record<string,unknown>;
      expect(payload.tenant_id).toBe(externalTenantId);
      expect(payload.unit_id).toBe("unit-a");
      expect((options?.headers as Record<string,string>)["X-FM-Command-FinOps-Signature"])
        .toBe(signCommandCoreFinops(config.secret,body));
      return Response.json({
        schema:CORE_FINOPS_REPORT_SCHEMA,
        tenant_id:externalTenantId,unit_id:"unit-a",
        start_date:date,end_date:date,buckets:[],
        known_attempts:0,unknown_attempts:0,coverage:"no_observations",
        internal_fm_cost_only:true,actual_provider_spend_verified:false,
        commercial_revenue_included:false,
      });
    }) as typeof fetch;
    const input={productId,externalTenantId,unitId:"unit-a",
      startDate:date,endDate:date};
    expect((await readVendeCoreFinops(context,input,config,http,now)).coverage)
      .toBe("no_observations");
    expect(calls).toBe(1);
    for(const altered of [
      {...input,externalTenantId:"foreign-"+randomUUID()},
      {...input,productId:otherProductId},
      {...input,productId:randomUUID()},
    ]){
      await expect(readVendeCoreFinops(context,altered,config,http,now)).rejects.toThrow();
    }
    expect(calls).toBe(1);
  });
});
