import type { Pool } from "pg";
import type { Invoice, PlanChange } from "@/application/billing/iron-plan-change";

// Reserve a differential invoice on the existing Command customer and ledger.
// The request UUID uniquely identifies this obligation across retries.
export async function differenceInvoice(db: Pool, scope: {tenantId:string;productId:string},
  change: PlanChange, allowCreate: boolean, now: Date): Promise<Invoice | null> {
  const args = [scope.tenantId,scope.productId,change.gymId,change.changeId];
  const tx = await db.connect();
  try {
    await tx.query("BEGIN");
    const request = (await tx.query(`SELECT quote,source_subscription_id,target_subscription_id,renewal_at
      FROM fmcc_iron_plan_change_request WHERE tenant_id=$1 AND product_id=$2 AND gym_id=$3 AND id=$4
      FOR UPDATE`,args)).rows[0];
    if (!request || request.source_subscription_id !== change.sourceSubscriptionId ||
        request.target_subscription_id !== change.targetSubscriptionId || request.quote.effectiveOn !== 'DIFFERENCE_PAYMENT_CONFIRMED')
      throw Error("iron.change_invoice_scope");
    const read = async () => (await tx.query(`SELECT i.id,i.amount_minor,i.currency
      FROM fmcc_billing_invoice i JOIN fmcc_billing_customer_binding b ON b.tenant_id=i.tenant_id
        AND b.product_id=i.product_id AND b.customer_id=i.customer_id
      WHERE i.tenant_id=$1 AND i.product_id=$2 AND b.external_tenant_id=$3 AND i.id=$4`,args)).rows[0];
    let row=await read();
    if (!row && allowCreate) {
      const q=request.quote;
      const bound = await tx.query(`SELECT DISTINCT s.id,s.customer_id,i.gateway_account_id
        FROM fmcc_billing_subscription s
        JOIN fmcc_billing_customer_binding b ON b.tenant_id=s.tenant_id AND b.product_id=s.product_id AND b.customer_id=s.customer_id
        JOIN fmcc_billing_invoice i ON i.tenant_id=s.tenant_id AND i.product_id=s.product_id AND i.customer_id=s.customer_id AND i.subscription_id=s.id
        JOIN fmcc_billing_gateway_account g ON g.tenant_id=i.tenant_id AND g.id=i.gateway_account_id
        JOIN fmcc_billing_provider_payment p ON p.tenant_id=i.tenant_id AND p.invoice_id=i.id AND p.gateway_account_id=g.id
        WHERE s.tenant_id=$1 AND s.product_id=$2 AND b.external_tenant_id=$3 AND s.plan_code=$4 AND s.status='active'
          AND i.amount_minor=$5 AND i.currency='BRL' AND i.status='paid' AND p.status='received'
          AND g.provider='cakto' AND g.environment='production' AND g.status='enabled' AND i.id=$6
          AND NOT EXISTS (SELECT 1 FROM fmcc_iron_plan_change_request prior WHERE prior.id=i.id)
        LIMIT 2`,[...args.slice(0,3),q.currentPlanCode,q.targetRecurrence.amountMinor-q.amountDueNowMinor,q.binding?.sourceInvoiceId]);
      if (bound.rowCount !== 1) throw Error("iron.change_origin_ambiguous");
      const origin=bound.rows[0];
      await tx.query(`INSERT INTO fmcc_billing_invoice
        (tenant_id,product_id,customer_id,subscription_id,gateway_account_id,id,currency,amount_minor,status)
        SELECT $1,$2,$3,$4,$5,$6,'BRL',$7,'pending' WHERE $9::timestamptz < $8::timestamptz`,
        [scope.tenantId,scope.productId,origin.customer_id,origin.id,origin.gateway_account_id,change.changeId,q.amountDueNowMinor,request.renewal_at,now]);
      row=await read();
    }
    if (row && (Number(row.amount_minor)!==request.quote.amountDueNowMinor || row.currency!=='BRL'))
      throw Error("iron.change_invoice_mismatch");
    await tx.query("COMMIT");
    return row ? {id:row.id,gymId:change.gymId,changeId:change.changeId,amountMinor:Number(row.amount_minor),currency:row.currency} : null;
  } catch (error) { await tx.query("ROLLBACK"); throw error; }
  finally { tx.release(); }
}
