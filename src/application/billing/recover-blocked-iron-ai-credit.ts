import { eq, sql } from "drizzle-orm";
import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";
import { db } from "@/infrastructure/db/client";
import { auditEvents } from "@/infrastructure/db/foundation-schema";
import { productDefinitions } from "@/infrastructure/db/platform-schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Blocked = { id:string; attempts:number; event_type:string; order_status:string;
  subscription_status:string; paid_through:Date|null; gym_id:string };

/** Requeue one canonical blocked item, not a delivery or a new credit grant.
 * All audit and queue changes are committed together. The worker independently
 * rechecks the paid/refunded state before every external effect.
 */
export async function recoverBlockedIronAiCredit(context:TenantContext, productId:string, outboxId:string) {
  requirePermission(context,"billing:write");
  if (context.role !== "owner" || !UUID.test(productId) || !UUID.test(outboxId))
    throw new Error("iron.credits_recovery_scope_denied");
  return db.transaction(async tx=>{
    const [product]=await tx.select({id:productDefinitions.id,tenantId:productDefinitions.tenantId,
      status:productDefinitions.status,slug:productDefinitions.slug}).from(productDefinitions)
      .where(eq(productDefinitions.id,productId)).limit(1);
    if (!product || product.tenantId!==context.tenantId || product.status!=="active" || product.slug!=="iron")
      throw new Error("iron.credits_recovery_scope_denied");
    const result=await tx.execute<Blocked>(sql`
      SELECT q.id,q.attempts,q.event_type,o.status AS order_status,
        s.status AS subscription_status,s.paid_through,o.gym_id
      FROM fmcc_iron_ai_credit_outbox q
      JOIN fmcc_iron_ai_credit_order o ON o.id=q.order_id
      JOIN fmcc_billing_subscription s ON s.tenant_id=o.tenant_id AND s.id=o.subscription_id
        AND s.product_id=o.product_id AND s.customer_id=o.customer_id
      JOIN fmcc_billing_customer_binding b ON b.tenant_id=o.tenant_id AND b.product_id=o.product_id
        AND b.customer_id=o.customer_id AND b.external_tenant_id=o.gym_id::text
      WHERE q.id=${outboxId} AND q.status='blocked' AND q.claim_token IS NULL
        AND q.lease_until IS NULL AND o.tenant_id=${context.tenantId} AND o.product_id=${productId}
      FOR UPDATE OF q,o,s
    `);
    if(result.rows.length!==1) throw new Error("iron.credits_recovery_not_ready");
    const row=result.rows[0];
    const valid = row.event_type==="REVOKE" ? row.order_status==="refunded" :
      row.event_type==="GRANT" && (row.order_status==="refunded" ||
        (row.order_status==="paid" && row.subscription_status==="active" &&
         row.paid_through!==null && new Date(row.paid_through).getTime()>Date.now()));
    if(!UUID.test(row.gym_id)||!valid) throw new Error("iron.credits_recovery_not_ready");
    const reset=await tx.execute(sql`
      UPDATE fmcc_iron_ai_credit_outbox SET status='retry',attempts=0,
        available_at=now(),last_error_code=NULL,updated_at=now()
      WHERE id=${outboxId} AND status='blocked' AND claim_token IS NULL
    `);
    if(reset.rowCount!==1) throw new Error("iron.credits_recovery_not_ready");
    await tx.insert(auditEvents).values({tenantId:context.tenantId,actorId:context.userId,actorType:"user",
      action:"billing.iron_credits_outbox.requeue",resourceType:"billing_product",resourceId:productId,
      result:"success",correlationId:context.correlationId,
      metadata:{outboxId,eventType:row.event_type,previousAttempts:row.attempts}});
    return {status:"retry" as const,outboxId,previousAttempts:row.attempts,deliveryExecuted:false as const};
  });
}
