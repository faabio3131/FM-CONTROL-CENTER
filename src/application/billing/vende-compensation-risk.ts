/** B1.11: preserve an actionable audit trail when the remote SaaS reports an
 * applied commercial operation but Command cannot safely confirm it locally.
 * Must be invoked ONLY inside the canonical lifecycle claim row transaction.
 * It never triggers a financial change, license command or network request.
 */
import {and,eq,inArray} from "drizzle-orm";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import {vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
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
  tx:Tx,row:Command,remote:RemoteObserved,reason:"reactivation_unconfirmed"|"suspension_unconfirmed"|"renewal_unconfirmed"|"upgrade_unconfirmed"|"downgrade_unconfirmed",
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

/** B1.12 — late payment evidence after a Command claim was already delivered.
 * Called only from the existing authenticated provider-readback transaction,
 * AFTER current binding, account and PSP response have been revalidated.
 * This is a RISK SIGNAL, not proof of current remote license state.
 *
 * No FOR UPDATE on a lifecycle row here: the caller holds the invoice
 * advisory lock; dispatch locks the lifecycle row before the invoice.
 * An inverse row lock order would create a cross-service SQL deadlock.
 */
export async function recordPostDeliveryVendePaymentRisk(
  tx:Tx,input:{
    tenantId:string;invoiceId:string;observationId:string;
    outcome:"unpaid_verified"|"settled_verified"|"reversed_verified"|"needs_attention";
    observedAt:Date;
  },
):Promise<number>{
  if(!["settled_verified","reversed_verified"].includes(input.outcome))return 0;
  const commands=await tx.select().from(vendeLifecycleCommands).where(and(
    eq(vendeLifecycleCommands.tenantId,input.tenantId),
    eq(vendeLifecycleCommands.sourceInvoiceId,input.invoiceId),
    eq(vendeLifecycleCommands.state,"delivered"),
    inArray(vendeLifecycleCommands.action,["SUSPEND_DELINQUENCY","REACTIVATE_VERIFIED","RENEW_VERIFIED","APPLY_UPGRADE","APPLY_DOWNGRADE"]),
  ));
  let flagged=0;
  for(const row of commands){
    const reason=row.action==="REACTIVATE_VERIFIED" && input.outcome==="reversed_verified"
      ?"reactivation_payment_reversed_after_delivery"
      :row.action==="SUSPEND_DELINQUENCY" && input.outcome==="settled_verified"
        ?"delinquency_paid_after_delivery"
        :row.action==="RENEW_VERIFIED" && input.outcome==="reversed_verified"
          ?"renewal_payment_reversed_after_delivery"
        :["APPLY_UPGRADE","APPLY_DOWNGRADE"].includes(row.action)&&input.outcome==="reversed_verified"
          ?"plan_change_payment_reversed_after_delivery":null;
    if(!reason)continue;
    // The PSP observation is source verified; the current Assistant license
    // has NOT been queried and cannot be inferred from Command delivered.
    const [existing]=await tx.select({id:auditEvents.id}).from(auditEvents).where(and(
      eq(auditEvents.tenantId,input.tenantId),
      eq(auditEvents.action,VENDE_COMPENSATION_REVIEW_ACTION),
      eq(auditEvents.resourceType,"vende_lifecycle_command"),
      eq(auditEvents.resourceId,row.id),
    )).limit(1);
    if(existing)continue;
    await tx.insert(auditEvents).values({
      tenantId:row.tenantId,actorId:"fm-payment-readback",actorType:"service",
      action:VENDE_COMPENSATION_REVIEW_ACTION,
      resourceType:"vende_lifecycle_command",resourceId:row.id,
      result:"needs_human_review",correlationId:row.operationId,
      metadata:{
        schema:"fm.vende.compensation-risk.v1",
        productId:row.productId,subscriptionId:row.subscriptionId,
        operationId:row.operationId,action:row.action,reason,
        paymentOutcome:input.outcome,observationId:input.observationId,
        observedAt:input.observedAt.toISOString(),
        currentAssistantLicenseVerified:false,
        automaticCompensationAuthorized:false,
      },
    });
    flagged++;
  }
  return flagged;
}
