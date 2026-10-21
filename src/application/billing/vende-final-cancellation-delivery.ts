/** B1.13 — final cancellation at the EXCLUSIVE paid-period boundary.
 * Never run on an external scheduler by default. Approval is reauthenticated
 * when due: the scheduling step-up is not an evergreen authorization.
 * Read-only recovery after a disputed POST; no mutation replay.
 */
import {and,eq} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {billingCustomerBindings,billingSubscriptions} from "@/infrastructure/db/billing-schema";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import {vendeContractTerms,vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {fmPaidThroughExclusiveInstant} from "@/domain/billing/vende-commercial-policy-v1";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import type {TenantContext} from "@/domain/security/tenant-context";
import type {StepUpProof} from "@/application/security/password-step-up";
import type {PlanProjectionConfig} from "./assistant-plan-outbox-dispatcher";
import {ASSISTANT_COMMERCIAL_TRANSITION_PATH,signAssistantCommercialTransition} from "./assistant-commercial-lifecycle-signer";
import {VendeCommercialDeliveryDenied,hasFreshVendeApproval,requireVendeCommercialDelivery,
  readVendeCommercialSnapshot,postVendeCommercialSigned,type VendeRemoteCommercialStatus} from "./vende-c06-delivery";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Command=typeof vendeLifecycleCommands.$inferSelect;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const denied=():never=>{throw new VendeCommercialDeliveryDenied();};

/** Always re-evaluate the canonical term and binding; never accept plan,
 * tenant, cutoff or scope from the caller. Cancellation must not be early. */
async function eligible(tx:Tx,row:Command,now:Date){
  if(row.action!=="SCHEDULE_CANCEL"||row.sourceInvoiceId!==null)return null;
  const [term]=await tx.select().from(vendeContractTerms).where(and(
    eq(vendeContractTerms.tenantId,row.tenantId),eq(vendeContractTerms.productId,row.productId),
    eq(vendeContractTerms.subscriptionId,row.subscriptionId),eq(vendeContractTerms.customerId,row.customerId),
  )).for("update").limit(1);
  if(!term||term.revision!==row.revision||term.lifecycleState!=="cancel_at_period_end"||
     term.autoRenew||term.paidThrough!==row.effectiveDate)return null;
  const deadline=fmPaidThroughExclusiveInstant(term.paidThrough);
  if(!Number.isFinite(now.getTime())||now.getTime()<deadline.getTime())return null;
  const [subscription]=await tx.select().from(billingSubscriptions).where(and(
    eq(billingSubscriptions.tenantId,row.tenantId),eq(billingSubscriptions.id,row.subscriptionId),
    eq(billingSubscriptions.productId,row.productId),eq(billingSubscriptions.customerId,row.customerId),
  )).for("update").limit(1);
  if(!subscription||subscription.status==="cancelled")return null;
  const [product]=await tx.select({id:productDefinitions.id}).from(productDefinitions).where(and(
    eq(productDefinitions.tenantId,row.tenantId),eq(productDefinitions.id,row.productId),
    eq(productDefinitions.slug,"vendeatendeia"),eq(productDefinitions.status,"active"),
  )).limit(1);
  const [binding]=await tx.select({id:billingCustomerBindings.id}).from(billingCustomerBindings).where(and(
    eq(billingCustomerBindings.tenantId,row.tenantId),
    eq(billingCustomerBindings.productId,row.productId),
    eq(billingCustomerBindings.customerId,row.customerId),
    eq(billingCustomerBindings.externalTenantId,row.externalTenantId),
  )).limit(1);
  if(!product||!binding)return null;
  return {term,deadline,planCode:subscription.planCode};
}
function verifiedRemote(proof:VendeRemoteCommercialStatus|null,row:Command,planCode:string,deadline:Date){
  return !!proof&&proof.operation_status==="applied"&&
    proof.applied_action==="CANCEL_AT_PERIOD_END"&&proof.license_status==="cancelled"&&
    proof.plan_code===planCode&&Number.isSafeInteger(proof.plan_revision)&&proof.plan_revision>=1&&
    proof.valid_until===deadline.getTime()/1000&&row.action==="SCHEDULE_CANCEL";
}
async function finish(id:string,state:"processing"|"unknown",proof:VendeRemoteCommercialStatus|null){
  return db.transaction(async tx=>{
    const [row]=await tx.select().from(vendeLifecycleCommands).where(eq(vendeLifecycleCommands.id,id))
      .for("update").limit(1);
    if(!row||row.action!=="SCHEDULE_CANCEL"||row.state!==state)return denied();
    const now=new Date();
    const check=proof?.operation_status==="applied"?await eligible(tx,row,now):null;
    if(check&&verifiedRemote(proof,row,check.planCode,check.deadline)){
      await tx.update(vendeContractTerms).set({lifecycleState:"cancelled",updatedAt:now})
        .where(eq(vendeContractTerms.id,check.term.id));
      await tx.update(billingSubscriptions).set({status:"cancelled"})
        .where(and(eq(billingSubscriptions.id,row.subscriptionId),eq(billingSubscriptions.tenantId,row.tenantId)));
      await tx.update(vendeLifecycleCommands).set({state:"delivered",deliveredAt:now})
        .where(eq(vendeLifecycleCommands.id,id));
      return "delivered" as const;
    }
    await tx.update(vendeLifecycleCommands).set({state:"unknown"})
      .where(eq(vendeLifecycleCommands.id,id));
    return "unknown" as const;
  });
}

/** Fresh human authority for due, never-attempted cancellation, under CAS.
 * Approval does NOT dispatch and cannot change paid period, consent or status. */
export async function reapproveVendeFinalCancellation(
  context:TenantContext,proof:StepUpProof,
  input:{productId:string;commandId:string;expectedApprovedAt:string|null},
  now:Date=new Date(),
){
  requireFMPlanAuthority(context,true);
  if(!UUID.test(input.productId)||!UUID.test(input.commandId)||
     proof.userId!==context.userId||!hasFreshVendeApproval(proof.verifiedAt,now)||
     (input.expectedApprovedAt!==null&&
      (typeof input.expectedApprovedAt!=="string"||!Number.isFinite(Date.parse(input.expectedApprovedAt))||
       new Date(input.expectedApprovedAt).toISOString()!==input.expectedApprovedAt)))return denied();
  return db.transaction(async tx=>{
    const [row]=await tx.select().from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.id,input.commandId),
      eq(vendeLifecycleCommands.tenantId,context.tenantId),
      eq(vendeLifecycleCommands.productId,input.productId),
    )).for("update").limit(1);
    if(!row||row.action!=="SCHEDULE_CANCEL"||row.state!=="pending"||row.claimedAt||
       row.deliveredAt||row.deliveryTarget||
       (row.approvedAt?.toISOString()??null)!==input.expectedApprovedAt||
       (row.approvedAt&&now.getTime()-row.approvedAt.getTime()<=300_000))return denied();
    if(!await eligible(tx,row,now))return denied();
    await tx.insert(auditEvents).values({
      tenantId:context.tenantId,actorId:context.userId,actorType:"user",
      action:"vende.cancellation_intent.reapproved",resourceType:"vende_lifecycle_command",
      resourceId:row.id,result:"success",correlationId:context.correlationId,
      metadata:{operationId:row.operationId,productId:row.productId,revision:row.revision,
        previousApprovedAt:row.approvedAt?.toISOString()??null,
        previousActorId:row.actorId,approvedAt:proof.verifiedAt.toISOString(),dueDate:row.effectiveDate},
    });
    await tx.update(vendeLifecycleCommands).set({approvedAt:proof.verifiedAt,actorId:context.userId})
      .where(eq(vendeLifecycleCommands.id,row.id));
    return {state:"pending" as const,commandId:row.id,
      approvedAt:proof.verifiedAt.toISOString(),dispatched:false};
  });
}

/** One-shot only. Never assume 2xx is proof, never send before the entire
 * paid local date ended, never synthesize another human approval. */
export async function dispatchVendeFinalCancellationOnce(
  commandId:string,config:PlanProjectionConfig,http:typeof fetch=fetch,now:Date=new Date(),
):Promise<"delivered"|"unknown">{
  const base=requireVendeCommercialDelivery(config);
  if(!UUID.test(commandId))return denied();
  const row=await db.transaction(async tx=>{
    const [candidate]=await tx.select().from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.id,commandId),eq(vendeLifecycleCommands.tenantId,config.organizationId),
    )).for("update").limit(1);
    if(!candidate||candidate.state!=="pending"||candidate.claimedAt||candidate.deliveredAt||
       candidate.deliveryTarget||!hasFreshVendeApproval(candidate.approvedAt,now)||
       !await eligible(tx,candidate,now))return denied();
    const [claimed]=await tx.update(vendeLifecycleCommands).set({state:"processing",claimedAt:now})
      .where(eq(vendeLifecycleCommands.id,commandId)).returning();
    return claimed;
  });
  try{
    const remote=await readVendeCommercialSnapshot(base,row,config,http,now);
    if(remote.operation_status!=="not_applied"||
       !["active","trial","suspended"].includes(remote.license_status))
      return finish(commandId,"processing",null);
    const fence=await db.transaction(async tx=>{
      const [claimed]=await tx.select().from(vendeLifecycleCommands).where(and(
        eq(vendeLifecycleCommands.id,row.id),eq(vendeLifecycleCommands.tenantId,row.tenantId),
        eq(vendeLifecycleCommands.state,"processing"),
      )).for("update").limit(1);
      const at=new Date();
      if(!claimed||claimed.actorId!==row.actorId||
         claimed.approvedAt?.getTime()!==row.approvedAt?.getTime()||
         !hasFreshVendeApproval(claimed.approvedAt,at))return null;
      const current=await eligible(tx,claimed,at);
      if(!current||remote.plan_code!==current.planCode||
         remote.valid_until!==current.deadline.getTime()/1000||
         remote.plan_revision<1)return null;
      return current;
    });
    const mutationAt=new Date();
    if(!fence||!hasFreshVendeApproval(row.approvedAt,mutationAt))
      return finish(commandId,"processing",null);
    const envelope=signAssistantCommercialTransition(config,{
      tenantId:row.externalTenantId,actorId:row.actorId,operationId:row.operationId,
      approvedAt:row.approvedAt!,action:"CANCEL_AT_PERIOD_END",
      expectedStatus:remote.license_status as "active"|"trial"|"suspended",
      expectedPlanCode:remote.plan_code,expectedPlanRevision:remote.plan_revision,
      expectedValidUntil:new Date(remote.valid_until*1000),
      targetPlanCode:remote.plan_code,targetPlanRevision:remote.plan_revision,
      targetValidUntil:new Date(remote.valid_until*1000),
      effectiveAt:mutationAt,verifiedPaymentRef:"none",
    },mutationAt);
    const response=await postVendeCommercialSigned(base,ASSISTANT_COMMERCIAL_TRANSITION_PATH,envelope,http);
    if(!response.ok)return finish(commandId,"processing",null);
    return finish(commandId,"processing",await readVendeCommercialSnapshot(base,row,config,http,new Date()));
  }catch{return finish(commandId,"processing",null);}
}

/** Recovery is signed READ ONLY, even with a now-expired human step-up.
 * A missing/mismatched ACK leaves UNKNOWN for supervised review. */
export async function reconcileUnknownVendeFinalCancellation(
  commandId:string,config:PlanProjectionConfig,http:typeof fetch=fetch,now:Date=new Date(),
):Promise<"delivered"|"unknown">{
  const base=requireVendeCommercialDelivery(config);
  if(!UUID.test(commandId))return denied();
  const [row]=await db.select().from(vendeLifecycleCommands).where(and(
    eq(vendeLifecycleCommands.id,commandId),eq(vendeLifecycleCommands.tenantId,config.organizationId),
    eq(vendeLifecycleCommands.action,"SCHEDULE_CANCEL"),eq(vendeLifecycleCommands.state,"unknown"),
  )).limit(1);
  if(!row)return denied();
  try{
    return await finish(commandId,"unknown",
      await readVendeCommercialSnapshot(base,row,config,http,now));
  }catch{return "unknown";}
}
