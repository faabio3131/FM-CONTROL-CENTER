import { differenceInvoice } from "@/infrastructure/billing/iron-plan-change-invoice";
import { postPlanChange, type ConfirmedRenewal } from "@/infrastructure/billing/iron-plan-change-ledger";
import type { Pool } from "pg";
import { advanceIronPlanChange, type IronPlanChangePorts, type PlanChange } from "./iron-plan-change";

// All effects use the persistent change id. Losing the process after one effect
// allows another worker to reconcile it with the same provider idempotency key.
export async function processDueIronPlanChange(db: Pool, scope: {tenantId:string;productId:string},
  ports: Omit<IronPlanChangePorts,"differenceInvoice"> & Partial<Pick<IronPlanChangePorts,"differenceInvoice">>, now: Date = new Date()) {
  const args = [scope.tenantId,scope.productId,now];
  const claim = await db.query(`
    WITH candidate AS (
      SELECT id FROM fmcc_iron_plan_change_request WHERE tenant_id=$1 AND product_id=$2
        AND status NOT IN ('completed','expired') AND next_attempt_at <= $3
        AND (lease_until IS NULL OR lease_until <= $3)
      ORDER BY next_attempt_at,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    UPDATE fmcc_iron_plan_change_request r SET lease_token=gen_random_uuid(),
      lease_until=$3::timestamptz + interval '2 minutes'
    FROM candidate WHERE r.id=candidate.id RETURNING r.*`,args);
  if (!claim.rowCount) return "idle";
  const row = claim.rows[0];
  const change: PlanChange = { gymId:row.gym_id,changeId:row.id,sourceSubscriptionId:row.source_subscription_id,
    targetSubscriptionId:row.target_subscription_id,quote:row.quote };
  let status: string;
  let renewal: ConfirmedRenewal | null = null;
  try {
    status = await advanceIronPlanChange(change, {
      bindChange: c => ports.bindChange(c),
      readAuthorization: c => ports.readAuthorization(c),
      readPayment: i => ports.readPayment(i),
      applyLicense: (c,id) => ports.applyLicense(c,id),
      replaceRenewal: (c,auth,allow) => ports.replaceRenewal(c,auth,allow),
      readTargetRenewal: async c => { renewal = await ports.readTargetRenewal(c); return renewal; },
      differenceInvoice: ports.differenceInvoice?.bind(ports) ?? ((c, allowCreate) => differenceInvoice(db, scope, c, allowCreate)),
    }, now);
    if (status === "awaiting_authorization" && row.renewal_at <= now) status = "expired";
    const tx = await db.connect();
    try {
      await tx.query("BEGIN");
      const next = status === "renewal_scheduled" ? row.renewal_at : new Date(now.getTime()+60000);
      const saved = await tx.query(`UPDATE fmcc_iron_plan_change_request SET status=$3,next_attempt_at=$4,
        lease_until=NULL,lease_token=NULL,last_error=NULL WHERE id=$1 AND lease_token=$2`,
        [row.id,row.lease_token,status,next]);
      if (saved.rowCount && ["completed","renewal_scheduled","awaiting_renewal"].includes(status))
        await postPlanChange(tx,scope,change,renewal);
      await tx.query("COMMIT");
      return saved.rowCount ? status : "lease_lost";
    } catch (error) {
      await tx.query("ROLLBACK");
      throw error;
    } finally { tx.release(); }
  } catch {
    await db.query(`UPDATE fmcc_iron_plan_change_request SET lease_token=NULL,lease_until=NULL,
      last_error='RECONCILIATION_REQUIRED',next_attempt_at=$3::timestamptz + interval '5 minutes'
      WHERE id=$1 AND lease_token=$2`,[row.id,row.lease_token,now]);
    return "reconciliation_required";
  }
}
