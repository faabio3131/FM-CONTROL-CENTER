import type { Pool } from "pg";
import { CaktoPaymentProvider } from "@/infrastructure/subscription/cakto-payment-provider";

type Provider = Pick<CaktoPaymentProvider, "cancelRecurringByAnchor">;
export type SupersededCancelResult = "idle" | "cancelled" | "retry" | "failed" | "not_configured";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ATTEMPTS = 8;

/**
 * After an IRON upgrade at renewal is paid, the replaced plan is already
 * cancelled in the Command ledger (no license effect). This worker stops its
 * Cakto recurrence so the old plan cannot charge again. It retries with
 * backoff; a terminal failure stays visible as provider_cancel_status=failed.
 */
export class IronSupersededCancelWorker {
  constructor(
    private readonly pool: Pick<Pool, "query">,
    private readonly env: Record<string, string | undefined>,
    private readonly provider: () => Provider = () => new CaktoPaymentProvider(env),
  ) {}

  async processOne(now = new Date()): Promise<SupersededCancelResult> {
    const tenantId = this.env.FMCC_IRON_BILLING_TENANT_ID ?? "";
    const productId = this.env.FMCC_IRON_PRODUCT_ID ?? "";
    if (!/^[A-Za-z0-9._:-]{3,128}$/.test(tenantId) || !UUID.test(productId)) return "idle";
    const claim = await this.pool.query(`
      UPDATE fmcc_billing_subscription s SET provider_cancel_next_at = $3::timestamptz + interval '10 minutes'
      WHERE s.id = (
        SELECT c.id FROM fmcc_billing_subscription c
        WHERE c.tenant_id=$1 AND c.product_id=$2 AND c.status='cancelled'
          AND c.provider_cancel_status='pending' AND c.provider_cancel_next_at <= $3
        ORDER BY c.provider_cancel_next_at, c.id LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING s.id, s.customer_id, s.plan_code, s.provider_cancel_attempts`, [tenantId, productId, now]);
    const row = claim.rows?.[0];
    if (!row) return "idle";
    const settle = (status: string, error: string | null, attempts: number, nextMinutes: number | null) =>
      this.pool.query(`UPDATE fmcc_billing_subscription SET provider_cancel_status=$3, provider_cancel_error=$4,
        provider_cancel_attempts=$5, provider_cancel_next_at=CASE WHEN $6::integer IS NULL THEN NULL
          ELSE $7::timestamptz + $6::integer * interval '1 minute' END
        WHERE tenant_id=$1 AND id=$2 AND provider_cancel_status='pending'`,
        [tenantId, row.id, status, error, attempts, nextMinutes, now]);
    try {
      // Only the original signed purchase of this subscription identifies its Cakto recurrence.
      const anchors = await this.pool.query(`
        SELECT i.id AS invoice_id, p.external_payment_id, i.amount_minor, pl.interval
        FROM fmcc_billing_invoice i
        JOIN fmcc_billing_provider_payment p ON p.tenant_id=i.tenant_id AND p.invoice_id=i.id
          AND p.gateway_account_id=i.gateway_account_id
        JOIN fmcc_billing_gateway_account g ON g.tenant_id=i.tenant_id AND g.id=i.gateway_account_id
          AND g.provider='cakto' AND g.environment='production'
        JOIN fmcc_billing_gateway_event e ON e.tenant_id=i.tenant_id AND e.gateway_account_id=i.gateway_account_id
          AND e.external_payment_id=p.external_payment_id AND e.external_reference=i.id::text
          AND e.event_type='payment_confirmed' AND e.status='processed'
        JOIN fmcc_billing_product_plan pl ON pl.tenant_id=i.tenant_id AND pl.product_id=i.product_id
          AND pl.plan_code=$5
        WHERE i.tenant_id=$1 AND i.product_id=$2 AND i.customer_id=$3 AND i.subscription_id=$4
        LIMIT 2`, [tenantId, productId, row.customer_id, row.id, row.plan_code]);
      if (anchors.rows?.length !== 1) throw new Error("cakto.cancel_binding_invalid");
      const a = anchors.rows[0];
      const interval = a.interval === "monthly" ? "month" : a.interval === "yearly" ? "year" : null;
      if (!interval) throw new Error("cakto.cancel_binding_invalid");
      await this.provider().cancelRecurringByAnchor({ invoiceId: a.invoice_id, paymentId: a.external_payment_id,
        planCode: row.plan_code, amountMinor: Number(a.amount_minor), interval });
      await settle("done", null, row.provider_cancel_attempts + 1, null);
      return "cancelled";
    } catch (error) {
      const code = error instanceof Error && /^cakto\.[a-z_]{1,48}$/.test(error.message) ? error.message : "cakto.cancel_unavailable";
      if (code === "cakto.manage_not_configured") {
        // Waiting for the FM credential is not a provider failure: keep it pending.
        await settle("pending", code, row.provider_cancel_attempts, 60);
        return "not_configured";
      }
      const attempts = row.provider_cancel_attempts + 1;
      const terminal = code === "cakto.cancel_binding_invalid" || attempts >= MAX_ATTEMPTS;
      await settle(terminal ? "failed" : "pending", code, attempts, terminal ? null : Math.min(240, 5 * 2 ** attempts));
      return terminal ? "failed" : "retry";
    }
  }
}
