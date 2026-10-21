import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url=process.env.DATABASE_URL??"";
const tenant="fm-c06-ci-"+randomUUID();
const pool=new pg.Pool({connectionString:url,max:3,allowExitOnIdle:true});
const now=new Date("2026-10-30T15:00:00.000Z");
let productId:string,customerId:string,subscriptionId:string,paidId:string,unpaidId:string,gatewayId:string;
let service:typeof import("../src/application/billing/vende-c06-governed-execution");
const context={tenantId:tenant,userId:"fm-owner",role:"owner" as const,correlationId:"c06-ci"};
const unpaidPaymentRef="pending-provider-"+randomUUID();
const proof={userId:"fm-owner",verifiedAt:now};

describe("C06 governed Vende dates, calendar, PostgreSQL transaction / no remote effects",()=>{
  beforeAll(async()=>{
    const parsed=new URL(url);
    if(!["localhost","127.0.0.1"].includes(parsed.hostname)||
       !["/fmcc","/fmcc_billing_ci"].includes(parsed.pathname)||
       process.env.NODE_ENV!=="test")throw Error("isolated_postgres_required");
    process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID=tenant;
    service=await import("../src/application/billing/vende-c06-governed-execution");
    const prod=await pool.query(
      "INSERT INTO fmcc_product_definition(tenant_id,slug,name) VALUES ($1,'vendeatendeia','Vende C06') RETURNING id",[tenant]);
    productId=prod.rows[0].id;
    const customer=await pool.query(
      "INSERT INTO fmcc_billing_customer(tenant_id,external_customer_id) VALUES ($1,$2) RETURNING id",
      [tenant,"ci-old-customer-"+randomUUID()]);
    customerId=customer.rows[0].id;
    const gw=await pool.query(
      "INSERT INTO fmcc_billing_gateway_account(tenant_id,provider,environment,label,secret_ref,status) VALUES ($1,'asaas','sandbox','ci','secret://synthetic','enabled') RETURNING id",[tenant]);
    gatewayId=gw.rows[0].id;
    const s=await pool.query(
      "INSERT INTO fmcc_billing_subscription(tenant_id,product_id,customer_id,plan_code,status) VALUES ($1,$2,$3,'PLUS','active') RETURNING id",
      [tenant,productId,customerId]);
    subscriptionId=s.rows[0].id;
    await pool.query(
      "INSERT INTO fmcc_billing_customer_binding(tenant_id,product_id,customer_id,external_tenant_id) VALUES ($1,$2,$3,$4)",
      [tenant,productId,customerId,"assistant-ci-"+randomUUID()]);
    const paid=await pool.query(
      "INSERT INTO fmcc_billing_invoice(tenant_id,product_id,customer_id,subscription_id,gateway_account_id,amount_minor,status) VALUES ($1,$2,$3,$4,$5,950,'paid') RETURNING id",
      [tenant,productId,customerId,subscriptionId,gatewayId]);
    paidId=paid.rows[0].id;
    await pool.query(
      "INSERT INTO fmcc_billing_provider_payment(tenant_id,invoice_id,gateway_account_id,external_payment_id,status) VALUES ($1,$2,$3,$4,'received')",
      [tenant,paidId,gatewayId,"provider-settlement-"+randomUUID()]);
    const unpaid=await pool.query(
      "INSERT INTO fmcc_billing_invoice(tenant_id,product_id,customer_id,subscription_id,gateway_account_id,amount_minor,status) VALUES ($1,$2,$3,$4,$5,950,'pending') RETURNING id",
      [tenant,productId,customerId,subscriptionId,gatewayId]);
    unpaidId=unpaid.rows[0].id;
    await pool.query(
      "INSERT INTO fmcc_billing_provider_payment(tenant_id,invoice_id,gateway_account_id,external_payment_id,status) VALUES ($1,$2,$3,$4,'pending')",
      [tenant,unpaidId,gatewayId,unpaidPaymentRef],
    );
  });
  afterAll(async()=>{
    try {
      for(const tab of [
        "fmcc_vende_lifecycle_command","fmcc_vende_contract_term_audit",
        "fmcc_vende_payment_attestation","fmcc_vende_business_calendar",
        "fmcc_vende_contract_terms","fmcc_billing_provider_payment",
        "fmcc_billing_invoice","fmcc_billing_subscription",
        "fmcc_billing_customer_binding","fmcc_billing_gateway_account",
        "fmcc_billing_customer","fmcc_product_definition",
      ]) await pool.query(`DELETE FROM ${tab} WHERE tenant_id=$1`,[tenant]);
    }finally{await pool.end();}
  });
  it("rejects unapproved role, foreign actor and invalid holiday data",async()=>{
    const svc=new service.GovernedVendeC06Service();
    const data={productId,region:"BR-SP",revision:1,validFrom:"2026-10-01",
      validThrough:"2026-12-31",holidays:["2026-10-26"],
      sourceRef:"fm-calendar-reviewed-2026"};
    await expect(svc.publishCalendar({...context,role:"viewer" as const},proof,data,now))
      .rejects.toThrow();
    await expect(svc.publishCalendar(context,{...proof,userId:"other"},data,now))
      .rejects.toThrow("step_up");
    await expect(svc.publishCalendar(context,proof,{...data,holidays:["2026-02-30"]},now))
      .rejects.toThrow();
    expect(await pool.query("SELECT count(*)::int AS n FROM fmcc_vende_business_calendar WHERE tenant_id=$1",[tenant]))
      .toMatchObject({rows:[{n:0}]});
  });
  it("publishes versioned FM holiday calendar exactly once, with evidence",async()=>{
    const svc=new service.GovernedVendeC06Service();
    const args={productId,region:"BR-SP",revision:1,validFrom:"2026-10-01",
      validThrough:"2026-12-31",holidays:["2026-10-26"],
      sourceRef:"fm-calendar-reviewed-2026"};
    expect((await svc.publishCalendar(context,proof,args,now)).revision).toBe(1);
    await expect(svc.publishCalendar(context,proof,args,now)).rejects.toThrow("revision_conflict");
    await expect(svc.publishCalendar(context,proof,{...args,revision:3},now))
      .rejects.toThrow("revision_conflict");
  });
  it("enrolls one verified paid term; not from invoice creation date",async()=>{
    const svc=new service.GovernedVendeC06Service();
    const args={productId,subscriptionId,invoiceId:paidId,
      effectiveFrom:"2026-10-01",paidThrough:"2026-10-22",dueDate:"2026-10-23",
      calendarRegion:"BR-SP",sourceRef:"fm-contract-approved-v1",
      operationId:"c06-enroll-paid-v1",autoRenew:true};
    await expect(svc.enrollPaidTerm(context,proof,{...args,invoiceId:unpaidId},now))
      .rejects.toThrow("payment_unverified");
    expect((await svc.enrollPaidTerm(context,proof,args,now)).revision).toBe(1);
    await expect(svc.enrollPaidTerm(context,proof,args,now)).rejects.toThrow("already_exists");
    const row=await pool.query(
      "SELECT due_date::text,paid_through::text,revision FROM fmcc_vende_contract_terms WHERE tenant_id=$1 AND subscription_id=$2",
      [tenant,subscriptionId]);
    expect(row.rows).toMatchObject([{due_date:"2026-10-23",paid_through:"2026-10-22",revision:1}]);
    expect((await svc.contractHistory(context,{productId,subscriptionId})).items[0]).toMatchObject({
      snapshotStatus:"captured",termsSnapshot:{schema:"fm.vende.contract-terms.v1",before:null,
        after:{revision:1,productId,subscriptionId,effectiveFrom:"2026-10-01",paidThrough:"2026-10-22",
          dueDate:"2026-10-23",autoRenew:true,sourceRef:"fm-contract-approved-v1"}},
    });
  });
  it("requires fresh trusted unpaid observation and 3 full working days, never D5 early",async()=>{
    const svc=new service.GovernedVendeC06Service();
    const args={productId,subscriptionId,invoiceId:unpaidId,expectedRevision:1,
      operationId:"c06-delinquency-hold-v1",sourceRef:"fm-psp-reconciled-2026"};
    await expect(svc.requestSuspension(context,proof,args,now))
      .rejects.toThrow("evidence_missing_or_stale");
    await pool.query(
      "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'unpaid_verified',$4,$5)",
      [tenant,unpaidId,unpaidPaymentRef,now,"authenticated-provider-readback"]);
    await expect(svc.requestSuspension(context,{...proof,verifiedAt:new Date("2026-10-28T15:00:00Z")},args,now))
      .rejects.toThrow("step_up");
    const early=new Date("2026-10-29T15:00:00Z");
    await expect(svc.requestSuspension(context,{...proof,verifiedAt:early},args,early))
      .rejects.toThrow("evidence_missing_or_stale"); // 1-day-old provider proof is not sufficient
    const rows=await pool.query("SELECT count(*)::int AS n FROM fmcc_vende_lifecycle_command WHERE tenant_id=$1",[tenant]);
    expect(rows.rows[0].n).toBe(0);
  });
  it("atomically queues delinquency and fences replay/revision after verified PSP readback",async()=>{
    const svc=new service.GovernedVendeC06Service();
    const args={productId,subscriptionId,invoiceId:unpaidId,expectedRevision:1,
      operationId:"c06-hold-verified-final",sourceRef:"fm-psp-proof-final"};
    await pool.query(
      "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'unpaid_verified',$4,'unrelated-fresh-proof')",
      [tenant,unpaidId,"unrelated-"+randomUUID(),now],
    );
    await expect(svc.requestSuspension(context,proof,args,now)).rejects.toThrow("evidence_missing_or_stale");
    await pool.query(
      "INSERT INTO fmcc_vende_payment_attestation(tenant_id,invoice_id,external_payment_ref,outcome,verified_at,source_ref) VALUES ($1,$2,$3,'unpaid_verified',$4,$5)",
      [tenant,unpaidId,unpaidPaymentRef,now,"verified-gateway-response"]);
    const [x,y]=await Promise.allSettled([
      svc.requestSuspension(context,proof,args,now),
      svc.requestSuspension(context,proof,args,now),
    ]);
    const fulfilled=[x,y].filter(v=>v.status==="fulfilled");
    const rejected=[x,y].filter(v=>v.status==="rejected");
    expect(fulfilled).toHaveLength(1);expect(rejected).toHaveLength(1);
    if(fulfilled[0]?.status!=="fulfilled")throw Error("missing committed intent");
    expect(fulfilled[0].value).toMatchObject({
      operationId:args.operationId,revision:2,state:"pending",
      remoteEntitlementConfirmed:false,scheduledFrom:"2026-10-30",
    });
    const state=await pool.query(
      "SELECT lifecycle_state,revision FROM fmcc_vende_contract_terms WHERE tenant_id=$1",
      [tenant]);
    expect(state.rows).toMatchObject([{lifecycle_state:"suspension_pending",revision:2}]);
    expect((await svc.contractHistory(context,{productId,subscriptionId})).items[0]).toMatchObject({termsSnapshot:{
      before:{revision:1,lifecycleState:"active",paidThrough:"2026-10-22"},
      after:{revision:2,lifecycleState:"suspension_pending",paidThrough:"2026-10-22"},
    }});
    const pending=await pool.query(
      "SELECT action,state FROM fmcc_vende_lifecycle_command WHERE tenant_id=$1",
      [tenant]);
    expect(pending.rows).toEqual([{action:"SUSPEND_DELINQUENCY",state:"pending"}]);
    const audit=await pool.query(
      "SELECT action,previous_state,new_state FROM fmcc_vende_contract_term_audit WHERE tenant_id=$1 ORDER BY revision",[tenant]);
    expect(audit.rows[1]).toEqual({
      action:"SUSPEND_DELINQUENCY",previous_state:"active",
      new_state:"suspension_pending",
    });
  });
});
