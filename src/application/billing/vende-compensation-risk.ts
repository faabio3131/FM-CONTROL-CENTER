/** B1.11: preserve an actionable audit trail when the remote SaaS reports an
 * applied commercial operation but Command cannot safely confirm it locally.
 * Must be invoked ONLY inside the canonical lifecycle claim row transaction.
 * It never triggers a financial change, license command or network request.
 */
import {and,eq} from "drizzle-orm";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import type {vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {db} from "@/infrastructure/db/client";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Command=typeof vendeLifecycleCommands.$inferSelect;
type RemoteObserved={
  operation_status:"applied"|"not_applied";
  applied_action:string|null;license_status:string;
  plan_code:string;plan_revision:number;valid_until:number;
};
export const VENDE_COMPENSATION_REVIEW_ACTION="vende.compensation_review.required" as const;

/** Idempotent because caller already owns FOR UPDATE on the same command row.
 * The append-only audit survives unknown/reconciliation retries without
 * creating an unbounded number of risk tickets. Failure rolls back the claim
 * transition, leaving it NOT delivered. */
export async function recordVendeCompensationRisk(
  tx:Tx,row:Command,remote:RemoteObserved,reason:"reactivation_unconfirmed"|"suspension_finance_changed",
  now:Date,
):Promise<boolean>{
  if(remote.operation_status!=="applied")return false;
  const [existing]=await tx.select({id:auditEvents.id}).from(auditEvents).where(and(
    eq(auditEvents.tenantId,row.tenantId),
    eq(auditEvents.action,VENDE_COMPENSATION_REVIEW_ACTION),
    eq(auditEvents.resourceType,"vende_lifecycle_command"),
    eq(auditEvents.resourceId,row.id),
  )).limit(1);
  if(existing)return false;
  await tx.insert(auditEvents).values({
    tenantId:row.tenantId,actorId:"fm-c06-service",actorType:"service",
    action:VENDE_COMPENSATION_REVIEW_ACTION,
    resourceType:"vende_lifecycle_command",resourceId:row.id,
    result:"needs_human_review",correlationId:row.operationId,
    metadata:{
      schema:"fm.vende.compensation-risk.v1",
      productId:row.productId,subscriptionId:row.subscriptionId,
      operationId:row.operationId,action:row.action,reason,
      observedRemoteAction:remote.applied_action,
      observedLicenseState:remote.license_status,
      observedPlanRevision:remote.plan_revision,
      observedValidUntil:remote.valid_until,
      observedAt:now.toISOString(),
      // Do not copy payment references, credentials or untrusted response bodies.
      automaticCompensationAuthorized:false,
    },
  });
  return true;
}
