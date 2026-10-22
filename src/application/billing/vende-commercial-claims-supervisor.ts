/** B1.10 — read-only C06 commercial claim supervision, strictly FM-scoped.
 * Counts use all canonical rows; list is a bounded operational projection.
 * No worker/scheduler/network or mutation can be reached from this reader.
 */
import {and,asc,eq,inArray,isNull,lt,or,sql} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import {VENDE_COMPENSATION_REVIEW_ACTION} from "./vende-compensation-risk";
import {vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import {fmLocalCivilDate} from "@/domain/billing/vende-commercial-policy-v1";
import type {TenantContext} from "@/domain/security/tenant-context";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const states=["pending","processing","unknown","blocked","delivered"] as const;
type State=typeof states[number];
export class VendeClaimsMonitorDenied extends Error{
  constructor(){super("vende.claims_monitor_denied");}
}

export async function readVendeClaimsMonitor(
  context:TenantContext,productId:string,now:Date=new Date(),
){
  requireFMPlanAuthority(context,false);
  if(!UUID.test(productId)||!Number.isFinite(now.getTime()))throw new VendeClaimsMonitorDenied();
  const [product]=await db.select({id:productDefinitions.id}).from(productDefinitions).where(and(
    eq(productDefinitions.tenantId,context.tenantId),
    eq(productDefinitions.id,productId),
    eq(productDefinitions.slug,"vendeatendeia"),
    eq(productDefinitions.status,"active"),
  )).limit(1);
  if(!product)throw new VendeClaimsMonitorDenied();
  const scoped=and(eq(vendeLifecycleCommands.tenantId,context.tenantId),
    eq(vendeLifecycleCommands.productId,productId));
  const rows=await db.select({
    state:vendeLifecycleCommands.state,
    total:sql<number>`count(*)::int`,
  }).from(vendeLifecycleCommands).where(scoped).groupBy(vendeLifecycleCommands.state);
  const totals:Record<State,number>={
    pending:0,processing:0,unknown:0,blocked:0,delivered:0,
  };
  for(const row of rows){
    if(states.some(state=>state===row.state))
      totals[row.state as State]=Number(row.total);
  }
  const staleBefore=new Date(now.getTime()-15*60_000);
  const approvalBefore=new Date(now.getTime()-300_000);
  const [stale]=await db.select({total:sql<number>`count(*)::int`})
    .from(vendeLifecycleCommands).where(and(scoped,
      eq(vendeLifecycleCommands.state,"processing"),
      lt(vendeLifecycleCommands.claimedAt,staleBefore)));
  const [expired]=await db.select({total:sql<number>`count(*)::int`})
    .from(vendeLifecycleCommands).where(and(scoped,
      or(
        inArray(vendeLifecycleCommands.action,[
          "SUSPEND_DELINQUENCY","REACTIVATE_VERIFIED",
          "RENEW_VERIFIED","APPLY_UPGRADE",
        ]),
        and(inArray(vendeLifecycleCommands.action,["SCHEDULE_CANCEL","APPLY_DOWNGRADE"]),
          lt(vendeLifecycleCommands.effectiveDate,fmLocalCivilDate(now))),
      ),
      eq(vendeLifecycleCommands.state,"pending"),
      isNull(vendeLifecycleCommands.claimedAt),
      isNull(vendeLifecycleCommands.deliveredAt),
      or(isNull(vendeLifecycleCommands.approvedAt),
        lt(vendeLifecycleCommands.approvedAt,approvalBefore))));
  // Historical, immutable total. Not a count of open/resolved cases:
  // a human reconciliation workflow will define that state separately.
  const [risks]=await db.select({total:sql<number>`count(*)::int`})
    .from(auditEvents).where(and(
      eq(auditEvents.tenantId,context.tenantId),
      eq(auditEvents.action,VENDE_COMPENSATION_REVIEW_ACTION),
      eq(auditEvents.resourceType,"vende_lifecycle_command"),
      sql`${auditEvents.metadata} ->> 'productId' = ${productId}`,
    ));
  const compensationReviewEvents=Number(risks?.total??0);
  const recent=await db.select({
    id:vendeLifecycleCommands.id,action:vendeLifecycleCommands.action,
    operationId:vendeLifecycleCommands.operationId,
    state:vendeLifecycleCommands.state,
    revision:vendeLifecycleCommands.revision,
    sourceInvoiceId:vendeLifecycleCommands.sourceInvoiceId,
    createdAt:vendeLifecycleCommands.createdAt,
    approvedAt:vendeLifecycleCommands.approvedAt,
    claimedAt:vendeLifecycleCommands.claimedAt,
    deliveredAt:vendeLifecycleCommands.deliveredAt,
  }).from(vendeLifecycleCommands).where(scoped).orderBy(
    sql`CASE ${vendeLifecycleCommands.state}
      WHEN 'unknown' THEN 0 WHEN 'processing' THEN 1
      WHEN 'blocked' THEN 2 WHEN 'pending' THEN 3 ELSE 4 END`,
    asc(vendeLifecycleCommands.createdAt),asc(vendeLifecycleCommands.id),
  ).limit(51);
  const staleProcessing=Number(stale?.total??0);
  const expiredApprovals=Number(expired?.total??0);
  return {
    totals,staleProcessing,expiredApprovals,compensationReviewEvents,
    alert:totals.unknown>0||staleProcessing>0||compensationReviewEvents>0?"critical" as const:
      expiredApprovals>0?"attention" as const:"healthy" as const,
    items:recent.slice(0,50),truncated:recent.length>50,
    // Never infer current entitlement solely from these Command-side states.
    runtimeEntitlementVerified:false as const,
  };
}
