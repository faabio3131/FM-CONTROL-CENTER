/** Read-only history of authenticated compensation observations.
 * The audit stream is historical and MUST NOT authorize new license,
 * commercial or payment mutations. All reads are corporate/tenant scoped.
 */
import {and,desc,eq,sql} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import {VENDE_COMPENSATION_REVIEW_ACTION} from "./vende-compensation-risk";
import {projectVendeHistoricalObservation} from "@/domain/billing/vende-compensation-audit-projection";
import type {TenantContext} from "@/domain/security/tenant-context";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION="vende.compensation_review.remote_observed";
const denied=():never=>{throw new Error("vende.compensation_history_denied");};
export async function readVendeCompensationObservationHistory(
  context:TenantContext,productId:string,commandId:string,
){
  requireFMPlanAuthority(context,false);
  if(!UUID.test(productId)||!UUID.test(commandId))return denied();
  return db.transaction(async tx=>{
    const [product]=await tx.select({id:productDefinitions.id}).from(productDefinitions)
      .where(and(
        eq(productDefinitions.tenantId,context.tenantId),
        eq(productDefinitions.id,productId),
        eq(productDefinitions.slug,"vendeatendeia"),
        eq(productDefinitions.status,"active"),
      )).limit(1);
    if(!product)return denied();
    const [command]=await tx.select({id:vendeLifecycleCommands.id,operationId:vendeLifecycleCommands.operationId})
      .from(vendeLifecycleCommands).where(and(
        eq(vendeLifecycleCommands.tenantId,context.tenantId),
        eq(vendeLifecycleCommands.productId,productId),
        eq(vendeLifecycleCommands.id,commandId),
      )).limit(1);
    if(!command)return denied();
    const [risk]=await tx.select({id:auditEvents.id}).from(auditEvents)
      .where(and(
        eq(auditEvents.tenantId,context.tenantId),
        eq(auditEvents.action,VENDE_COMPENSATION_REVIEW_ACTION),
        eq(auditEvents.resourceType,"vende_lifecycle_command"),
        eq(auditEvents.resourceId,commandId),
        sql`${auditEvents.metadata} ->> 'productId' = ${productId}`,
      )).limit(1);
    if(!risk)return denied();
    const rows=await tx.select({
      result:auditEvents.result,metadata:auditEvents.metadata,
      occurredAt:auditEvents.occurredAt,
    }).from(auditEvents).where(and(
      eq(auditEvents.tenantId,context.tenantId),
      eq(auditEvents.action,ACTION),
      eq(auditEvents.resourceType,"vende_lifecycle_command"),
      eq(auditEvents.resourceId,commandId),
      sql`${auditEvents.metadata} ->> 'productId' = ${productId}`,
      sql`${auditEvents.metadata} ->> 'operationId' = ${command.operationId}`,
    )).orderBy(desc(auditEvents.occurredAt),desc(auditEvents.id)).limit(11);
    return {
      items:rows.slice(0,10).map(projectVendeHistoricalObservation),
      truncated:rows.length>10,
      historicalOnly:true as const,
      currentLicenseVerified:false as const,
      currentFinanceVerified:false as const,
      remediationConfirmed:false as const,
      caseResolved:false as const,
    };
  });
}
