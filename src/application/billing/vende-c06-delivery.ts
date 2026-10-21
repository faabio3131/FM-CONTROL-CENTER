/** Internal FM Command commercial suspension dispatcher.
 *
 * One-shot, no blind retries: a timeout becomes UNKNOWN and requires signed
 * read-only reconciliation. Never call this from an unauthenticated customer
 * route. No worker is enabled by default.
 */
import { and, eq, lt, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { billingCustomerBindings, billingInvoices } from "@/infrastructure/db/billing-schema";
import { productDefinitions } from "@/infrastructure/db/platform-schema";
import { auditEvents } from "@/infrastructure/db/foundation-schema";
import { requireFMPlanAuthority } from "./assistant-plan-catalog-service";
import type { TenantContext } from "@/domain/security/tenant-context";
import type { StepUpProof } from "@/application/security/password-step-up";
import {
  vendeContractTerms,vendeLifecycleCommands,
} from "@/infrastructure/db/vende-commercial-schema";
import type { PlanProjectionConfig } from "@/application/billing/assistant-plan-outbox-dispatcher";
import {
  ASSISTANT_COMMERCIAL_STATUS_PATH,ASSISTANT_COMMERCIAL_TRANSITION_PATH,
  signAssistantCommercialStatus,signAssistantCommercialTransition,
} from "./assistant-commercial-lifecycle-signer";

import { currentBoundVendePaymentEvidence } from "./vende-payment-evidence";

export class VendeCommercialDeliveryDenied extends Error {
  constructor(code="vende.commercial_delivery_unavailable"){super(code);}
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function freshApproval(approvedAt:Date|null,now:Date):approvedAt is Date {
  if(!approvedAt)return false;
  const age=now.getTime()-approvedAt.getTime();
  return Number.isFinite(age)&&age>=0&&age<=300_000;
}

/** Human reapproval of a never-attempted intent. No network or status reset.
 * Compare the previously observed approval to reject concurrent/stale requests.
 * The old and new approvals remain in the atomic audit record.
 */
export async function reapproveVendeDelinquency(
  context:TenantContext,proof:StepUpProof,
  input:{productId:string;commandId:string;expectedApprovedAt:string|null},
  now:Date=new Date(),
){
  requireFMPlanAuthority(context,true);
  if(!UUID.test(input.productId)||!UUID.test(input.commandId)||proof.userId!==context.userId||
     !freshApproval(proof.verifiedAt,now)||
     (input.expectedApprovedAt!==null && (typeof input.expectedApprovedAt!=="string" ||
      !Number.isFinite(Date.parse(input.expectedApprovedAt)) ||
      new Date(input.expectedApprovedAt).toISOString()!==input.expectedApprovedAt)))
    throw new VendeCommercialDeliveryDenied();
  return db.transaction(async tx=>{
    const [row]=await tx.select().from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.id,input.commandId),eq(vendeLifecycleCommands.tenantId,context.tenantId),
      eq(vendeLifecycleCommands.productId,input.productId),
    )).for("update").limit(1);
    if(!row||row.action!=="SUSPEND_DELINQUENCY"||row.state!=="pending"||row.claimedAt||row.deliveredAt||
       (row.approvedAt?.toISOString()??null)!==input.expectedApprovedAt||
       (row.approvedAt && now.getTime()-row.approvedAt.getTime()<=300_000))
      throw new VendeCommercialDeliveryDenied();
    const [product]=await tx.select({id:productDefinitions.id}).from(productDefinitions).where(and(
      eq(productDefinitions.tenantId,context.tenantId),eq(productDefinitions.id,input.productId),
      eq(productDefinitions.slug,"vendeatendeia"),eq(productDefinitions.status,"active"),
    )).limit(1);
    if(!product||!await financialFence(tx,row,now))throw new VendeCommercialDeliveryDenied();
    const [term]=await tx.select().from(vendeContractTerms).where(and(
      eq(vendeContractTerms.tenantId,context.tenantId),eq(vendeContractTerms.subscriptionId,row.subscriptionId),
      eq(vendeContractTerms.productId,input.productId),eq(vendeContractTerms.customerId,row.customerId),
    )).for("update").limit(1);
    const [binding]=await tx.select().from(billingCustomerBindings).where(and(
      eq(billingCustomerBindings.tenantId,context.tenantId),eq(billingCustomerBindings.productId,input.productId),
      eq(billingCustomerBindings.customerId,row.customerId),eq(billingCustomerBindings.externalTenantId,row.externalTenantId),
    )).limit(1);
    if(!term||term.revision!==row.revision||term.lifecycleState!=="suspension_pending"||!binding)
      throw new VendeCommercialDeliveryDenied();
    await tx.insert(auditEvents).values({tenantId:context.tenantId,actorId:context.userId,actorType:"user",
      action:"vende.commercial_intent.reapproved",resourceType:"vende_lifecycle_command",resourceId:row.id,
      result:"success",correlationId:context.correlationId,metadata:{
        previousActorId:row.actorId,previousApprovedAt:row.approvedAt?.toISOString()??null,
        approvedAt:proof.verifiedAt.toISOString(),operationId:row.operationId,productId:row.productId,
        revision:row.revision,sourceInvoiceId:row.sourceInvoiceId,
      }});
    await tx.update(vendeLifecycleCommands).set({approvedAt:proof.verifiedAt,actorId:context.userId})
      .where(eq(vendeLifecycleCommands.id,row.id));
    return {commandId:row.id,approvedAt:proof.verifiedAt.toISOString(),state:"pending" as const,dispatched:false};
  });
}
type RemoteStatus={
  tenant_id:string;operation_status:"applied"|"not_applied";
  applied_action:string|null;license_status:string;
  plan_code:string;plan_revision:number;valid_until:number;
};
function origin(config:PlanProjectionConfig){
  try{
    const u=new URL(config.assistantOrigin);
    if(u.protocol!=="https:" || u.username || u.password || u.search ||
       u.hash || u.pathname!=="/")
      throw new VendeCommercialDeliveryDenied();
    return u;
  }catch{throw new VendeCommercialDeliveryDenied();}
}
function enabled(config:PlanProjectionConfig){
  if(process.env.FM_COMMAND_VENDE_C06_DELIVERY_ENABLED!=="true" ||
     config.organizationId!==process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID ||
     !config.signingKey || config.signingKey.length<32)
    throw new VendeCommercialDeliveryDenied();
  return origin(config);
}
async function postSigned(
  base:URL,path:string,envelope:{body:string;headers:Record<string,string>},
  http:typeof fetch,
):Promise<Response>{
  return http(new URL(path,base),{
    method:"POST",headers:envelope.headers,body:envelope.body,
    redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000),
  });
}
async function financialFence(
  tx:Parameters<Parameters<typeof db.transaction>[0]>[0],
  row:typeof vendeLifecycleCommands.$inferSelect,now:Date,
){
  if(!row.sourceInvoiceId)return false;
  const [invoice]=await tx.select().from(billingInvoices).where(and(
    eq(billingInvoices.tenantId,row.tenantId),
    eq(billingInvoices.id,row.sourceInvoiceId),
    eq(billingInvoices.productId,row.productId),
    eq(billingInvoices.customerId,row.customerId),
    eq(billingInvoices.subscriptionId,row.subscriptionId),
  )).for("update").limit(1);
  if(!invoice||invoice.status!=="pending")return false;
  const last=await currentBoundVendePaymentEvidence(tx,invoice,now);
  if(!last||last.outcome!=="unpaid_verified")return false;
  return true;
}
async function transitionState(
  id:string,expected:"processing"|"unknown",next:"unknown"|"delivered",
  now:Date,remoteAck:boolean,
):Promise<"unknown"|"delivered">{
  return db.transaction(async tx=>{
    const [row]=await tx.select().from(vendeLifecycleCommands)
      .where(eq(vendeLifecycleCommands.id,id)).for("update").limit(1);
    if(!row||row.state!==expected||row.action!=="SUSPEND_DELINQUENCY")
      throw new VendeCommercialDeliveryDenied();
    const [terms]=await tx.select().from(vendeContractTerms).where(and(
      eq(vendeContractTerms.tenantId,row.tenantId),
      eq(vendeContractTerms.subscriptionId,row.subscriptionId),
      eq(vendeContractTerms.productId,row.productId),
    )).for("update").limit(1);
    const accepted=remoteAck && terms?.lifecycleState==="suspension_pending" &&
      terms.revision===row.revision && await financialFence(tx,row,now);
    if(next==="delivered" && accepted){
      await tx.update(vendeContractTerms).set({
        lifecycleState:"suspended",updatedAt:now,
      }).where(eq(vendeContractTerms.id,terms.id));
      await tx.update(vendeLifecycleCommands).set({
        state:"delivered",deliveredAt:now,
      }).where(eq(vendeLifecycleCommands.id,id));
      return "delivered";
    }
    await tx.update(vendeLifecycleCommands).set({
      state:"unknown",
    }).where(eq(vendeLifecycleCommands.id,id));
    return "unknown";
  });
}
async function signedRemoteSnapshot(
  url:URL,row:typeof vendeLifecycleCommands.$inferSelect,
  config:PlanProjectionConfig,http:typeof fetch,now:Date,
):Promise<RemoteStatus>{
  const envelope=signAssistantCommercialStatus(config,{
    tenantId:row.externalTenantId,operationId:row.operationId,
  },now);
  const result=await postSigned(url,ASSISTANT_COMMERCIAL_STATUS_PATH,envelope,http);
  if(!result.ok)throw new VendeCommercialDeliveryDenied();
  const candidate:unknown=await result.json();
  if(!candidate||typeof candidate!=="object")throw new VendeCommercialDeliveryDenied();
  const snapshot=candidate as Partial<RemoteStatus>;
  if(snapshot.tenant_id!==row.externalTenantId ||
     !["applied","not_applied"].includes(snapshot.operation_status??"") ||
     !["active","trial","suspended","cancelled"].includes(snapshot.license_status??"") ||
     typeof snapshot.plan_code!=="string" || typeof snapshot.plan_revision!=="number" ||
     !Number.isSafeInteger(snapshot.plan_revision) ||
     !Number.isSafeInteger(snapshot.valid_until))
    throw new VendeCommercialDeliveryDenied();
  return snapshot as RemoteStatus;
}
/** One-shot attempt. A failure after claim stays unknown; signed readback
 * can resolve without replay. Nobody may infer delivery from HTTP status.
 */
export async function dispatchVendeDelinquencyOnce(
  commandId:string,config:PlanProjectionConfig,
  http:typeof fetch=fetch,now:Date=new Date(),
):Promise<"delivered"|"unknown">{
  const base=enabled(config);
  if(!UUID.test(commandId))throw new VendeCommercialDeliveryDenied();
  const row=await db.transaction(async tx=>{
    const [candidate]=await tx.select().from(vendeLifecycleCommands)
      .where(eq(vendeLifecycleCommands.id,commandId)).for("update").limit(1);
    if(!candidate || candidate.state!=="pending" ||
       candidate.action!=="SUSPEND_DELINQUENCY" ||
       candidate.tenantId!==config.organizationId ||
       !freshApproval(candidate.approvedAt,now) ||
       !await financialFence(tx,candidate,now))
      throw new VendeCommercialDeliveryDenied();
    const [term]=await tx.select().from(vendeContractTerms).where(and(
      eq(vendeContractTerms.tenantId,candidate.tenantId),
      eq(vendeContractTerms.subscriptionId,candidate.subscriptionId),
    )).for("update").limit(1);
    if(!term || term.revision!==candidate.revision ||
       term.lifecycleState!=="suspension_pending")
      throw new VendeCommercialDeliveryDenied();
    const [claimed]=await tx.update(vendeLifecycleCommands).set({
      state:"processing",claimedAt:now,
    }).where(and(eq(vendeLifecycleCommands.id,commandId),
      eq(vendeLifecycleCommands.state,"pending"),
    )).returning();
    if(!claimed)throw new VendeCommercialDeliveryDenied();
    return claimed;
  });
  try{
    const remote=await signedRemoteSnapshot(base,row,config,http,now);
    if(remote.operation_status==="applied"){
      return transitionState(commandId,"processing","delivered",new Date(),
        remote.applied_action==="SUSPEND_DELINQUENCY" &&
        remote.license_status==="suspended");
    }
    if(!["active","trial"].includes(remote.license_status))
      return transitionState(commandId,"processing","unknown",new Date(),false);
    // Re-validate current finance state AFTER the remote status read and
    // immediately BEFORE requesting a mutation. This narrows (but cannot
    // eliminate) the cross-system payment/suspension race: a settlement
    // arriving after this final DB check still requires governed compensation.
    const stillUnpaid=await db.transaction(async tx=>{
      const [claimed]=await tx.select().from(vendeLifecycleCommands).where(and(
        eq(vendeLifecycleCommands.id,row.id),
        eq(vendeLifecycleCommands.tenantId,row.tenantId),
        eq(vendeLifecycleCommands.state,"processing"),
      )).for("update").limit(1);
      if(!claimed || !freshApproval(claimed.approvedAt,new Date()) ||
         claimed.approvedAt.getTime()!==row.approvedAt?.getTime() ||
         claimed.actorId!==row.actorId ||
         !await financialFence(tx,claimed,new Date()))return false;
      // Match the claim's invoice-before-term lock order to limit deadlocks.
      const [term]=await tx.select().from(vendeContractTerms).where(and(
        eq(vendeContractTerms.tenantId,row.tenantId),
        eq(vendeContractTerms.subscriptionId,row.subscriptionId),
      )).for("update").limit(1);
      return !!term && term.lifecycleState==="suspension_pending" &&
        term.revision===row.revision;
    });
    if(!stillUnpaid)
      return transitionState(commandId,"processing","unknown",new Date(),false);
    const mutationAt=new Date();
    if(!freshApproval(row.approvedAt,mutationAt))
      return transitionState(commandId,"processing","unknown",mutationAt,false);
    const signed=signAssistantCommercialTransition(config,{
      tenantId:row.externalTenantId,actorId:row.actorId,
      operationId:row.operationId,approvedAt:row.approvedAt,
      action:"SUSPEND_DELINQUENCY",expectedStatus:remote.license_status as "active"|"trial",
      expectedPlanCode:remote.plan_code,
      expectedPlanRevision:remote.plan_revision,
      expectedValidUntil:new Date(remote.valid_until*1000),
      targetPlanCode:remote.plan_code,
      targetPlanRevision:remote.plan_revision,
      targetValidUntil:new Date(remote.valid_until*1000),
      effectiveAt:mutationAt,verifiedPaymentRef:"none",
    },mutationAt);
    const response=await postSigned(base,ASSISTANT_COMMERCIAL_TRANSITION_PATH,signed,http);
    // An unsigned HTTP 2xx body is never authoritative proof of a remote
    // mutation. Require a fresh, separately signed request-scoped readback.
    // Timeout, missing readback or mismatched tenant/action stays UNKNOWN;
    // recovery may only repeat the safe read, never the mutation.
    if(!response.ok)
      return transitionState(commandId,"processing","unknown",new Date(),false);
    const proof=await signedRemoteSnapshot(base,row,config,http,new Date());
    const ack=proof.operation_status==="applied" &&
      proof.applied_action==="SUSPEND_DELINQUENCY" &&
      proof.license_status==="suspended";
    return transitionState(commandId,"processing",ack?"delivered":"unknown",
      new Date(),ack);
  }catch{
    return transitionState(commandId,"processing","unknown",new Date(),false);
  }
}

/** Recovery of timeout/unknown: read-only verification, no second mutation. */
export async function reconcileUnknownVendeDelinquency(
  commandId:string,config:PlanProjectionConfig,
  http:typeof fetch=fetch,now:Date=new Date(),
):Promise<"delivered"|"unknown">{
  const base=enabled(config);
  if(!UUID.test(commandId))throw new VendeCommercialDeliveryDenied();
  const [row]=await db.select().from(vendeLifecycleCommands).where(and(
    eq(vendeLifecycleCommands.id,commandId),
    eq(vendeLifecycleCommands.tenantId,config.organizationId),
    eq(vendeLifecycleCommands.state,"unknown"),
    eq(vendeLifecycleCommands.action,"SUSPEND_DELINQUENCY"),
  )).limit(1);
  if(!row)throw new VendeCommercialDeliveryDenied();
  try{
    const snapshot=await signedRemoteSnapshot(base,row,config,http,now);
    const applied=snapshot.operation_status==="applied" &&
      snapshot.applied_action==="SUSPEND_DELINQUENCY" &&
      snapshot.license_status==="suspended";
    return transitionState(commandId,"unknown",applied?"delivered":"unknown",
      new Date(),applied);
  }catch{return "unknown";}
}


/** Reclaim abandoned IN-FLIGHT ownership without any network replay.
 * Process crash or grace-timeout becomes UNKNOWN for read-only reconciliation.
 * Never called automatically without an authenticated FM scheduler identity.
 */
export async function quarantineAbandonedVendeClaims(
  config:PlanProjectionConfig,
  now:Date=new Date(),limit=25,
):Promise<number>{
  enabled(config);
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new VendeCommercialDeliveryDenied();
  const expired=new Date(now.getTime()-15*60*1000);
  if(!Number.isFinite(expired.getTime()))throw new VendeCommercialDeliveryDenied();
  return db.transaction(async tx=>{
    const abandoned=await tx.select({id:vendeLifecycleCommands.id})
      .from(vendeLifecycleCommands).where(and(
        eq(vendeLifecycleCommands.tenantId,config.organizationId),
        inArray(vendeLifecycleCommands.action,["SUSPEND_DELINQUENCY","REACTIVATE_VERIFIED"]),
        eq(vendeLifecycleCommands.state,"processing"),
        lt(vendeLifecycleCommands.claimedAt,expired),
      )).orderBy(vendeLifecycleCommands.claimedAt).limit(limit)
      .for("update",{skipLocked:true});
    let quarantined=0;
    for(const row of abandoned){
      const changed=await tx.update(vendeLifecycleCommands).set({state:"unknown"})
        .where(and(eq(vendeLifecycleCommands.id,row.id),
          eq(vendeLifecycleCommands.state,"processing"),
        )).returning({id:vendeLifecycleCommands.id});
      if(changed.length)quarantined++;
    }
    return quarantined;
  });
}

// Internal transport primitives, shared by governed commercial dispatchers.
export {enabled as requireVendeCommercialDelivery,postSigned as postVendeCommercialSigned,
  signedRemoteSnapshot as readVendeCommercialSnapshot,freshApproval as hasFreshVendeApproval};
export type {RemoteStatus as VendeRemoteCommercialStatus};
