import type { PoolClient } from "pg";
import { advanceIronPaidCycle } from "@/application/billing/cakto-iron-product-billing";
import type { IronPlanChangePorts, PlanChange } from "@/application/billing/iron-plan-change";

export type ConfirmedRenewal = NonNullable<Awaited<ReturnType<IronPlanChangePorts["readTargetRenewal"]>>>;

// The worker owns the request lease and commits these writes with its status.
export async function postPlanChange(tx: PoolClient, scope: {tenantId:string;productId:string},
  change: PlanChange, renewal: ConfirmedRenewal | null, differencePaymentId: string | null) {
  const { quote } = change;
  const upgrade = quote.effectiveOn === "DIFFERENCE_PAYMENT_CONFIRMED";
  if (upgrade && !differencePaymentId) throw Error("iron.change_payment_mismatch");
  if (!upgrade && !renewal) return;
  const subscriptions = await tx.query(`SELECT s.id,s.customer_id,s.plan_code,s.paid_through
    FROM fmcc_billing_subscription s JOIN fmcc_billing_customer_binding b
      ON b.tenant_id=s.tenant_id AND b.product_id=s.product_id AND b.customer_id=s.customer_id
    WHERE s.tenant_id=$1 AND s.product_id=$2 AND b.external_tenant_id=$3 AND s.status='active'
    FOR UPDATE OF s`,[scope.tenantId,scope.productId,change.gymId]);
  const sub = subscriptions.rows[0];
  if (subscriptions.rowCount !== 1 || ![quote.currentPlanCode,quote.targetPlanCode].includes(sub.plan_code))
    throw Error("iron.change_subscription_ambiguous");

  const args = [scope.tenantId,scope.productId,sub.customer_id,sub.id];
  const gateways = await tx.query(`SELECT DISTINCT g.id FROM fmcc_billing_invoice i
    JOIN fmcc_billing_gateway_account g ON g.tenant_id=i.tenant_id AND g.id=i.gateway_account_id
    JOIN fmcc_billing_provider_payment p ON p.tenant_id=i.tenant_id AND p.invoice_id=i.id AND p.gateway_account_id=g.id
    WHERE i.tenant_id=$1 AND i.product_id=$2 AND i.customer_id=$3 AND i.subscription_id=$4
      AND i.currency='BRL' AND i.status='paid' AND p.status='received' AND g.provider='cakto' AND g.status='enabled'
      AND g.environment='production' AND i.id=$5 AND ($6::text IS NULL OR (p.external_payment_id=$6 AND i.amount_minor=$7))`,[...args,upgrade ? change.changeId : quote.binding?.sourceInvoiceId, differencePaymentId,quote.amountDueNowMinor]);
  if (gateways.rowCount !== 1) throw Error("iron.change_gateway_ambiguous");

  let periodEnd: Date | null = null;
  if (renewal) {
    const interval = quote.targetRecurrence.interval;
    if (interval !== "monthly" && interval !== "yearly") throw Error("iron.change_interval");
    periodEnd = advanceIronPaidCycle(new Date(renewal.periodStart),interval);
    if (sub.paid_through && sub.paid_through > periodEnd) throw Error("iron.change_period_superseded");
    const gateway = gateways.rows[0].id;
    // Subscription lock serializes all retries for this cycle. Conflicting settlements
    // or a provider payment already used elsewhere cause the whole transaction to roll back.
    const invoices = await tx.query(`SELECT i.period_end,i.amount_minor,i.currency,i.status,i.gateway_account_id,
      p.external_payment_id,p.status AS payment_status FROM fmcc_billing_invoice i
      LEFT JOIN fmcc_billing_provider_payment p ON p.tenant_id=i.tenant_id AND p.invoice_id=i.id AND p.gateway_account_id=i.gateway_account_id
      WHERE i.tenant_id=$1 AND i.product_id=$2 AND i.customer_id=$3 AND i.subscription_id=$4 AND (i.period_end=$5 OR (p.external_payment_id=$6 AND i.gateway_account_id=$7))`,
      [...args,periodEnd,renewal.paymentId,gateway]);
    if (invoices.rowCount) {
      const invoice = invoices.rows[0];
      if (invoices.rowCount !== 1 || invoice.period_end?.getTime() !== periodEnd.getTime() || invoice.external_payment_id !== renewal.paymentId ||
          invoice.gateway_account_id !== gateway || Number(invoice.amount_minor) !== renewal.amountMinor ||
          invoice.currency !== renewal.currency || invoice.status !== "paid" || invoice.payment_status !== "received")
        throw Error("iron.change_settlement_conflict");
    } else {
      const invoice = await tx.query(`INSERT INTO fmcc_billing_invoice
        (tenant_id,product_id,customer_id,subscription_id,gateway_account_id,amount_minor,period_end,status,currency)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'paid',$8) RETURNING id`,[...args,gateway,renewal.amountMinor,periodEnd,renewal.currency]);
      await tx.query(`INSERT INTO fmcc_billing_provider_payment
        (tenant_id,invoice_id,gateway_account_id,external_payment_id,status) VALUES ($1,$2,$3,$4,'received')`,
        [scope.tenantId,invoice.rows[0].id,gateway,renewal.paymentId]);
    }
  }
  await tx.query(`UPDATE fmcc_billing_subscription SET plan_code=$5,paid_through=COALESCE($6,paid_through)
    WHERE tenant_id=$1 AND product_id=$2 AND customer_id=$3 AND id=$4`,[...args,quote.targetPlanCode,periodEnd]);
}
