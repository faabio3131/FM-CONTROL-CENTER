/** Internal FM Command commercial suspension dispatcher.
 *
 * One-shot, no blind retries: a timeout becomes UNKNOWN and requires signed
 * read-only reconciliation. Never call this from an unauthenticated customer
 * route. No worker is enabled by default.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { billingInvoices } from "@/infrastructure/db/billing-schema";
import {
  vendeContractTerms,vendeLifecycleCommands,vendePaymentAttestations,
} from "@/infrastructure/db/vende-commercial-schema";
import type { PlanProjectionConfig } from "@/application/billing/assistant-plan-outbox-dispatcher";
import {
  ASSISTANT_COMMERCIAL_STATUS_PATH,ASSISTANT_COMMERCIAL_TRANSITION_PATH,
  signAssistantCommercialStatus,signAssistantCommercialTransition,
} from "./assistant-commercial-lifecycle-signer";

export class VendeCommercialDeliveryDenied extends Error {
  constructor(code="vende.commercial_delivery_unavailable"){super(code);}
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
  const [last]=await tx.select().from(vendePaymentAttestations).where(and(
    eq(vendePaymentAttestations.tenantId,row.tenantId),
    eq(vendePaymentAttestations.invoiceId,row.sourceInvoiceId),
  )).orderBy(desc(vendePaymentAttestations.verifiedAt),
    desc(vendePaymentAttestations.createdAt)).limit(1);
  if(!last||last.outcome!=="unpaid_verified" ||
     last.verifiedAt.getTime()>now.getTime()+15000 ||
     now.getTime()-last.verifiedAt.getTime()>15*60_000)return false;
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
    const signed=signAssistantCommercialTransition(config,{
      tenantId:row.externalTenantId,actorId:row.actorId,
      operationId:row.operationId,approvedAt:now,
      action:"SUSPEND_DELINQUENCY",expectedStatus:remote.license_status as "active"|"trial",
      expectedPlanCode:remote.plan_code,
      expectedPlanRevision:remote.plan_revision,
      expectedValidUntil:new Date(remote.valid_until*1000),
      targetPlanCode:remote.plan_code,
      targetPlanRevision:remote.plan_revision,
      targetValidUntil:new Date(remote.valid_until*1000),
      effectiveAt:now,verifiedPaymentRef:"none",
    },now);
    const response=await postSigned(base,ASSISTANT_COMMERCIAL_TRANSITION_PATH,signed,http);
    const reply:unknown=response.ok?await response.json():null;
    const ack=response.ok && !!reply && typeof reply==="object" &&
      (reply as {status?:unknown}).status==="suspended";
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
