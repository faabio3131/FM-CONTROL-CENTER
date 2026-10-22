/** Read-only P01 post-queue verification.
 * The canonical C06 dispatcher owns the actual signed transition and ACK.
 * A local 'delivered' row is never sufficient by itself to declare the
 * current license valid; recheck both independent sources after I/O.
 */
import {and,eq,sql} from "drizzle-orm";
import {db} from "@/infrastructure/db/client";
import {auditEvents} from "@/infrastructure/db/foundation-schema";
import {productDefinitions} from "@/infrastructure/db/platform-schema";
import {billingInvoices} from "@/infrastructure/db/billing-schema";
import {vendeContractTerms,vendeLifecycleCommands} from "@/infrastructure/db/vende-commercial-schema";
import {currentBoundVendePaymentEvidence} from "./vende-payment-evidence";
import {fmLocalCivilDate} from "@/domain/billing/vende-commercial-policy-v1";
import {requireFMPlanAuthority} from "./assistant-plan-catalog-service";
import {readVendeCommercialSnapshot,requireVendeCommercialDelivery}
  from "./vende-c06-delivery";
import type {TenantContext} from "@/domain/security/tenant-context";
import type {PlanProjectionConfig} from "./assistant-plan-outbox-dispatcher";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREPARED="vende.compensation_correction.prepared";
const REVIEWED="vende.compensation_correction.second_reviewed";
const denied=():never=>{throw new Error("vende.compensation_status_unavailable");};
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Scope={productId:string;intentId:string};
type Command=typeof vendeLifecycleCommands.$inferSelect;
function state(row:Command):"queued"|"processing"|"needs_reconciliation"|"delivered_unverified"{
  if(row.state==="pending")return "queued";
  if(row.state==="processing")return "processing";
  if(row.state==="delivered")return "delivered_unverified";
  return "needs_reconciliation";
}
const flags={
  providerRefundExecuted:false as const,
  coreQuotaVerified:false as const,
  caseResolved:false as const,
};
async function linkedCommand(tx:Tx,context:TenantContext,input:Scope){
  const [product]=await tx.select({id:productDefinitions.id}).from(productDefinitions)
    .where(and(eq(productDefinitions.tenantId,context.tenantId),
      eq(productDefinitions.id,input.productId),eq(productDefinitions.slug,"vendeatendeia"),
      eq(productDefinitions.status,"active"))).limit(1);
  if(!product)return denied();
  const [prepared]=await tx.select({metadata:auditEvents.metadata}).from(auditEvents)
    .where(and(eq(auditEvents.tenantId,context.tenantId),
      eq(auditEvents.id,input.intentId),eq(auditEvents.action,PREPARED),
      eq(auditEvents.resourceType,"vende_lifecycle_command"),
      sql`${auditEvents.metadata} ->> 'productId' = ${input.productId}`,
    )).limit(1);
  if(!prepared||prepared.metadata.schema!=="fm.vende.compensation-intent.v1"||
     prepared.metadata.approvedForDispatch!==false||
     prepared.metadata.remediationDispatched!==false||
     typeof prepared.metadata.commandId!=="string"||
     !UUID.test(prepared.metadata.commandId))return denied();
  const [review]=await tx.select({
    id:auditEvents.id,result:auditEvents.result,metadata:auditEvents.metadata,
  }).from(auditEvents)
    .where(and(eq(auditEvents.tenantId,context.tenantId),
      eq(auditEvents.action,REVIEWED),
      eq(auditEvents.resourceType,"vende_lifecycle_command"),
      eq(auditEvents.resourceId,prepared.metadata.commandId),
      sql`${auditEvents.metadata} ->> 'intentId' = ${input.intentId}`,
      sql`${auditEvents.metadata} ->> 'productId' = ${input.productId}`,
    )).limit(1);
  if(!review||review.result!=="reviewed_no_dispatch"||
     review.metadata.schema!=="fm.vende.compensation-second-review.v1"||
     review.metadata.productId!==input.productId||
     review.metadata.observationId!==prepared.metadata.observationId||
     review.metadata.reviewVersion!==prepared.metadata.reviewVersion||
     review.metadata.approvedForDispatch!==false||
     review.metadata.remediationDispatched!==false||
     review.metadata.caseResolved!==false)return denied();
  const [original]=await tx.select().from(vendeLifecycleCommands)
    .where(and(eq(vendeLifecycleCommands.tenantId,context.tenantId),
      eq(vendeLifecycleCommands.productId,input.productId),
      eq(vendeLifecycleCommands.id,prepared.metadata.commandId),
    )).limit(1);
  const [correction]=await tx.select().from(vendeLifecycleCommands)
    .where(and(eq(vendeLifecycleCommands.tenantId,context.tenantId),
      eq(vendeLifecycleCommands.productId,input.productId),
      eq(vendeLifecycleCommands.operationId,"p01.correction."+input.intentId),
    )).limit(1);
  if(!original||!correction||original.action!=="SUSPEND_DELINQUENCY"||
     correction.action!=="REACTIVATE_VERIFIED"||
     correction.subscriptionId!==original.subscriptionId||
     correction.customerId!==original.customerId||
     correction.externalTenantId!==original.externalTenantId||
     correction.sourceInvoiceId!==original.sourceInvoiceId||
     correction.sourceRef!=="p01.correction."+input.intentId||
     correction.expectedRevision!==original.revision||
     correction.revision!==original.revision+1||
     prepared.metadata.operationId!==original.operationId||
     prepared.metadata.invoiceId!==original.sourceInvoiceId)
    return denied();
  return correction;
}

export async function readVendeCorrectionOutcome(
  context:TenantContext,input:Scope,
  config:PlanProjectionConfig,http:typeof fetch=fetch,now:Date=new Date(),
){
  requireFMPlanAuthority(context,false);
  if(!UUID.test(input.productId)||!UUID.test(input.intentId)||
     config.organizationId!==context.tenantId)return denied();
  const command=await db.transaction(tx=>linkedCommand(tx,context,input));
  if(command.state!=="delivered")return {
    intentId:input.intentId,operationId:command.operationId,
    state:state(command),remoteEntitlementConfirmed:false as const,
    financialSettlementCurrentlyVerified:false as const,...flags,
  };
  const base=requireVendeCommercialDelivery(config);
  const proof=await readVendeCommercialSnapshot(base,command,config,http,now);
  const confirmed=await db.transaction(async tx=>{
    const current=await linkedCommand(tx,context,input);
    if(current.state!=="delivered"||
       current.operationId!==command.operationId||
       current.revision!==command.revision||
       current.deliveryTarget?.schema!=="fm.vende.reactivation-target.v1"||
       !current.sourceInvoiceId)return false;
    const target=current.deliveryTarget;
    if(proof.operation_status!=="applied"||
       proof.applied_action!=="REACTIVATE_VERIFIED"||
       proof.license_status!=="active"||
       proof.plan_code!==target.planCode||
       proof.plan_revision!==target.planRevision||
       proof.valid_until!==target.validUntil)return false;
    const [invoice]=await tx.select().from(billingInvoices).where(and(
      eq(billingInvoices.tenantId,context.tenantId),
      eq(billingInvoices.id,current.sourceInvoiceId),
      eq(billingInvoices.productId,input.productId),
      eq(billingInvoices.customerId,current.customerId),
      eq(billingInvoices.subscriptionId,current.subscriptionId),
    )).for("update").limit(1);
    if(!invoice||invoice.status!=="paid"||
       (await currentBoundVendePaymentEvidence(tx,invoice,new Date()))?.outcome!=="settled_verified")
      return false;
    const [term]=await tx.select().from(vendeContractTerms).where(and(
      eq(vendeContractTerms.tenantId,context.tenantId),
      eq(vendeContractTerms.productId,input.productId),
      eq(vendeContractTerms.subscriptionId,current.subscriptionId),
      eq(vendeContractTerms.customerId,current.customerId),
    )).for("update").limit(1);
    return !!term&&term.revision===current.revision&&
      term.lifecycleState==="active"&&term.paidThrough>=fmLocalCivilDate(new Date());
  });
  return {
    intentId:input.intentId,operationId:command.operationId,
    state:confirmed?"assistant_active_payment_verified" as const:"needs_reconciliation" as const,
    remoteEntitlementConfirmed:confirmed,
    financialSettlementCurrentlyVerified:confirmed,
    ...flags,
  };
}
