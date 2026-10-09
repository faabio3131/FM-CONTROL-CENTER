import pg from "pg";

/** PostgreSQL is the canonical authority; never use an ephemeral database for live issuance. */
export class ProductionPilotLedger {
 constructor(private readonly pool: pg.Pool) {}
 async reserve(input:{tenantId:string;invoiceId:string;gatewayAccountId:string}):Promise<boolean>{
  const r=await this.pool.query(
   `UPDATE fmcc_billing_invoice i SET status='creating'
      WHERE i.tenant_id=$1 AND i.id=$2 AND i.gateway_account_id=$3
        AND i.status='pending' AND i.amount_minor=100 AND i.currency='BRL'
        AND NOT EXISTS(SELECT 1 FROM fmcc_billing_provider_payment p WHERE p.tenant_id=i.tenant_id AND p.invoice_id=i.id)
        AND EXISTS(SELECT 1 FROM fmcc_billing_gateway_account g
            WHERE g.tenant_id=i.tenant_id AND g.id=i.gateway_account_id
              AND g.provider='asaas' AND g.environment='production' AND g.status='enabled')
      RETURNING i.id`,[input.tenantId,input.invoiceId,input.gatewayAccountId]);
  return r.rowCount===1;
 }
 async persistProviderPayment(input:{tenantId:string;invoiceId:string;gatewayAccountId:string;externalPaymentId:string;status:string}):Promise<void>{
  const client=await this.pool.connect();
  try {
   await client.query("BEGIN");
   const invoice=await client.query(
    "SELECT id FROM fmcc_billing_invoice WHERE tenant_id=$1 AND id=$2 AND gateway_account_id=$3 AND status='creating' AND amount_minor=100 FOR UPDATE",
    [input.tenantId,input.invoiceId,input.gatewayAccountId]);
   if(invoice.rowCount!==1)throw new Error("billing.production_claim_missing");
   await client.query("INSERT INTO fmcc_billing_provider_payment (tenant_id,invoice_id,gateway_account_id,external_payment_id,status) VALUES ($1,$2,$3,$4,$5)",
    [input.tenantId,input.invoiceId,input.gatewayAccountId,input.externalPaymentId,input.status]);
   await client.query("UPDATE fmcc_billing_invoice SET status='payment_pending' WHERE tenant_id=$1 AND id=$2",
    [input.tenantId,input.invoiceId]);
   await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}
  finally{client.release();}
 }
}
