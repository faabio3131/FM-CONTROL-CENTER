import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { billingAuditEvents,billingGatewayAccounts,billingInvoices,billingProviderPayments } from "@/infrastructure/db/billing-schema";
import { productDefinitions } from "@/infrastructure/db/platform-schema";
import { vendePaymentAttestations } from "@/infrastructure/db/vende-commercial-schema";
import { vendePaymentReadbackAttempts,vendePaymentReadbackBindings } from "@/infrastructure/db/vende-payment-readback-schema";
import type { TenantContext } from "@/domain/security/tenant-context";
import type { StepUpProof } from "@/application/security/password-step-up";
import { requireFMPlanAuthority } from "./assistant-plan-catalog-service";
import { recordPostDeliveryVendePaymentRisk } from "./vende-compensation-risk";
import { AsaasVendePaymentReadOnlyClient,type VendePaymentOutcome,type VendePaymentReadbackPort } from "@/infrastructure/billing/asaas-vende-payment-readonly-client";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Identity={productId:string;invoiceId:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class VendeReadbackAuthorityDenied extends Error {
  constructor(){super("vende.readback_authority_or_state_denied");}
}
function actor(context:TenantContext,proof:StepUpProof,at:Date){
  requireFMPlanAuthority(context,true);
  const age=at.getTime()-proof.verifiedAt.getTime();
  if(proof.userId!==context.userId || !Number.isFinite(age) || age<0 || age>300_000)
    throw new VendeReadbackAuthorityDenied();
}
function ids(input:Identity){
  if(!UUID.test(input.invoiceId)||!UUID.test(input.productId))throw new VendeReadbackAuthorityDenied();
}
async function lock(tx:Tx,tenantId:string,invoiceId:string){
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`vende.readback:${tenantId}:${invoiceId}`},0))`);
}
async function canonical(tx:Tx,tenantId:string,input:Identity){
  const [invoice]=await tx.select().from(billingInvoices).where(and(
    eq(billingInvoices.tenantId,tenantId),eq(billingInvoices.id,input.invoiceId),
    eq(billingInvoices.productId,input.productId),
  )).for("update").limit(1);
  if(!invoice || invoice.currency!=="BRL")throw new VendeReadbackAuthorityDenied();
  const [product]=await tx.select().from(productDefinitions).where(and(
    eq(productDefinitions.tenantId,tenantId),eq(productDefinitions.id,input.productId),
    eq(productDefinitions.slug,"vendeatendeia"),eq(productDefinitions.status,"active"),
  )).limit(1);
  const [payment]=await tx.select().from(billingProviderPayments).where(and(
    eq(billingProviderPayments.tenantId,tenantId),eq(billingProviderPayments.invoiceId,invoice.id),
    eq(billingProviderPayments.gatewayAccountId,invoice.gatewayAccountId),
  )).limit(1);
  const [gateway]=await tx.select().from(billingGatewayAccounts).where(and(
    eq(billingGatewayAccounts.tenantId,tenantId),eq(billingGatewayAccounts.id,invoice.gatewayAccountId),
    eq(billingGatewayAccounts.provider,"asaas"),eq(billingGatewayAccounts.status,"enabled"),
  )).limit(1);
  if(!product || !payment || !gateway || !["sandbox","production"].includes(gateway.environment))
    throw new VendeReadbackAuthorityDenied();
  return {invoice,payment,gateway};
}
async function snapshot(tx:Tx,tenantId:string,input:Identity){
  const current=await canonical(tx,tenantId,input);
  const [binding]=await tx.select().from(vendePaymentReadbackBindings).where(and(
    eq(vendePaymentReadbackBindings.tenantId,tenantId),eq(vendePaymentReadbackBindings.invoiceId,input.invoiceId),
  )).limit(1);
  if(!binding || binding.gatewayAccountId!==current.gateway.id ||
     binding.externalPaymentRef!==current.payment.externalPaymentId)throw new VendeReadbackAuthorityDenied();
  return {...current,binding};
}
function hash(value:unknown){return createHash("sha256").update(JSON.stringify(value)).digest("hex");}
async function audit(tx:Tx,context:TenantContext,action:string,subjectId:string){
  await tx.insert(billingAuditEvents).values({tenantId:context.tenantId,actorId:context.userId,
    action,subjectId,correlationId:context.correlationId});
}

/** Internal service. HTTP composition must establish session and real step-up.
 * No public observation ingestion, provider mutation, invoice settlement, license
 * mutation or scheduler is introduced. External execution defaults OFF.
 */
export class VendePaymentReadbackService {
  constructor(private readonly port:VendePaymentReadbackPort=new AsaasVendePaymentReadOnlyClient(),
    private readonly clock:()=>Date=()=>new Date()){}

  /** Corporate read model. Explicit columns prevent credential/snapshot exposure. */
  async inspect(context:TenantContext,input:Identity){
    requireFMPlanAuthority(context,false);ids(input);
    return db.transaction(async tx=>{
      const {invoice,payment}=await canonical(tx,context.tenantId,input);
      const [binding]=await tx.select({
        providerCustomerRef:vendePaymentReadbackBindings.providerCustomerRef,
        sourceRef:vendePaymentReadbackBindings.sourceRef,
        createdAt:vendePaymentReadbackBindings.createdAt,
      }).from(vendePaymentReadbackBindings).where(and(
        eq(vendePaymentReadbackBindings.tenantId,context.tenantId),
        eq(vendePaymentReadbackBindings.invoiceId,input.invoiceId),
      )).limit(1);
      const attempts=await tx.select({
        observationId:vendePaymentReadbackAttempts.observationId,
        state:vendePaymentReadbackAttempts.state,reason:vendePaymentReadbackAttempts.reason,
        startedAt:vendePaymentReadbackAttempts.startedAt,finishedAt:vendePaymentReadbackAttempts.finishedAt,
      }).from(vendePaymentReadbackAttempts).where(and(
        eq(vendePaymentReadbackAttempts.tenantId,context.tenantId),
        eq(vendePaymentReadbackAttempts.invoiceId,input.invoiceId),
      )).orderBy(desc(vendePaymentReadbackAttempts.startedAt),desc(vendePaymentReadbackAttempts.id)).limit(21);
      return {invoiceId:invoice.id,amountMinor:invoice.amountMinor,currency:invoice.currency,
        externalPaymentRef:payment.externalPaymentId,binding:binding??null,
        attempts:attempts.slice(0,20),truncated:attempts.length>20,
        readbackEnabled:process.env.FM_COMMAND_VENDE_PAYMENT_READBACK_ENABLED==="true"};
    });
  }

  async bindPayer(context:TenantContext,proof:StepUpProof,
    input:Identity & {providerCustomerRef:string;sourceRef:string}){
    actor(context,proof,this.clock());ids(input);
    if(!/^cus_[A-Za-z0-9_-]{1,128}$/.test(input.providerCustomerRef) ||
       !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{3,127}$/.test(input.sourceRef))throw new VendeReadbackAuthorityDenied();
    return db.transaction(async tx=>{
      await lock(tx,context.tenantId,input.invoiceId);
      const current=await canonical(tx,context.tenantId,input);
      const [prior]=await tx.select().from(vendePaymentReadbackBindings).where(and(
        eq(vendePaymentReadbackBindings.tenantId,context.tenantId),eq(vendePaymentReadbackBindings.invoiceId,input.invoiceId),
      )).limit(1);
      if(prior){
        if(prior.providerCustomerRef!==input.providerCustomerRef || prior.sourceRef!==input.sourceRef ||
           prior.externalPaymentRef!==current.payment.externalPaymentId || prior.gatewayAccountId!==current.gateway.id)
          throw new VendeReadbackAuthorityDenied();
        return {bindingId:prior.id};
      }
      const [added]=await tx.insert(vendePaymentReadbackBindings).values({tenantId:context.tenantId,
        invoiceId:input.invoiceId,gatewayAccountId:current.gateway.id,externalPaymentRef:current.payment.externalPaymentId,
        providerCustomerRef:input.providerCustomerRef,sourceRef:input.sourceRef,actorId:context.userId,
      }).returning({bindingId:vendePaymentReadbackBindings.id});
      await audit(tx,context,"vende.payment_readback.payer_bound",added.bindingId);
      return added;
    });
  }

  async observe(context:TenantContext,proof:StepUpProof,input:Identity & {observationId:string}){
    const started=this.clock();actor(context,proof,started);ids(input);
    if(process.env.FM_COMMAND_VENDE_PAYMENT_READBACK_ENABLED!=="true" || !UUID.test(input.observationId))
      throw new VendeReadbackAuthorityDenied();
    const claim=await db.transaction(async tx=>{
      await lock(tx,context.tenantId,input.invoiceId);
      const current=await snapshot(tx,context.tenantId,input);
      const fingerprint=hash(current);
      const [prior]=await tx.select().from(vendePaymentReadbackAttempts).where(and(
        eq(vendePaymentReadbackAttempts.tenantId,context.tenantId),eq(vendePaymentReadbackAttempts.observationId,input.observationId),
      )).limit(1);
      if(prior){
        if(prior.invoiceId!==input.invoiceId)throw new VendeReadbackAuthorityDenied();
        // Replay returns only operation status, never refreshes financial proof.
        return {current,attempt:prior,replayed:true};
      }
      const [busy]=await tx.select().from(vendePaymentReadbackAttempts).where(and(
        eq(vendePaymentReadbackAttempts.tenantId,context.tenantId),eq(vendePaymentReadbackAttempts.invoiceId,input.invoiceId),
        eq(vendePaymentReadbackAttempts.state,"processing"),
      )).limit(1);
      if(busy)throw new VendeReadbackAuthorityDenied();
      const [attempt]=await tx.insert(vendePaymentReadbackAttempts).values({tenantId:context.tenantId,
        invoiceId:input.invoiceId,observationId:input.observationId,snapshotHash:fingerprint,
        state:"processing",actorId:context.userId,startedAt:started,
      }).returning();
      // Invalidate older positive observations BEFORE I/O. Crash/timeout must
      // not leave an old unpaid proof eligible for suspension.
      await tx.insert(vendePaymentAttestations).values({tenantId:context.tenantId,invoiceId:input.invoiceId,
        externalPaymentRef:current.payment.externalPaymentId,outcome:"needs_attention",verifiedAt:started,
        sourceRef:`asaas-read:${input.observationId}:pending`,
      });
      await audit(tx,context,"vende.payment_readback.claimed",attempt.id);
      return {current,attempt,replayed:false};
    });
    if(claim.replayed)return {state:claim.attempt.state,replayed:true};
    let outcome:VendePaymentOutcome="needs_attention";
    let reason="provider_unavailable";
    try{
      const {invoice,payment,gateway,binding}=claim.current;
      const result=await this.port.read({tenantId:context.tenantId,gatewayAccountId:gateway.id,
        provider:"asaas",environment:gateway.environment as "sandbox"|"production",secretRef:gateway.secretRef},
      {paymentId:payment.externalPaymentId,providerCustomerRef:binding.providerCustomerRef,
        invoiceId:invoice.id,amountMinor:invoice.amountMinor});
      if(["unpaid_verified","settled_verified","reversed_verified","needs_attention"].includes(result))outcome=result;
      reason=outcome==="needs_attention"?"provider_state_requires_review":"verified_readback";
    }catch{/* Only sanitized reason codes; never persist response bodies or secrets. */}
    const ended=this.clock();
    if(!Number.isFinite(ended.getTime()) || ended<started || ended.getTime()-started.getTime()>30_000){
      outcome="needs_attention";reason="readback_deadline_exceeded";
    }
    const verifiedAt=Number.isFinite(ended.getTime()) && ended>=started?ended:started;
    return db.transaction(async tx=>{
      await lock(tx,context.tenantId,input.invoiceId);
      const [attempt]=await tx.select().from(vendePaymentReadbackAttempts).where(and(
        eq(vendePaymentReadbackAttempts.tenantId,context.tenantId),eq(vendePaymentReadbackAttempts.id,claim.attempt.id),
      )).for("update").limit(1);
      if(!attempt || attempt.state!=="processing")throw new VendeReadbackAuthorityDenied();
      try{
        const current=await snapshot(tx,context.tenantId,input);
        if(hash(current)!==attempt.snapshotHash){outcome="needs_attention";reason="canonical_state_changed";}
      }catch(error){
        if(!(error instanceof VendeReadbackAuthorityDenied))throw error;
        outcome="needs_attention";reason="canonical_state_changed";
      }
      await tx.insert(vendePaymentAttestations).values({tenantId:context.tenantId,invoiceId:input.invoiceId,
        externalPaymentRef:claim.current.payment.externalPaymentId,outcome,verifiedAt,
        sourceRef:`asaas-read:${input.observationId}:result`,
      });
      const state=outcome==="needs_attention"?"needs_attention":"recorded";
      await tx.update(vendePaymentReadbackAttempts).set({state,reason,finishedAt:verifiedAt})
        .where(eq(vendePaymentReadbackAttempts.id,attempt.id));
      await audit(tx,context,"vende.payment_readback."+state,attempt.id);
      // The readback observation is the ONLY canonical new PSP evidence.
      // A later verified reversal/settlement may contradict a delivered
      // lifecycle intent: record a single risk signal, never mutate SaaS.
      if(reason==="verified_readback")
        await recordPostDeliveryVendePaymentRisk(tx,{
          tenantId:context.tenantId,invoiceId:input.invoiceId,
          observationId:input.observationId,outcome,observedAt:verifiedAt,
        });
      return {state,replayed:false};
    });
  }

  async quarantine(context:TenantContext,proof:StepUpProof,input:Identity){
    const now=this.clock();actor(context,proof,now);ids(input);
    return db.transaction(async tx=>{
      await lock(tx,context.tenantId,input.invoiceId);
      await canonical(tx,context.tenantId,input);
      const rows=await tx.update(vendePaymentReadbackAttempts).set({state:"needs_attention",
        reason:"abandoned_readback",finishedAt:now}).where(and(
        eq(vendePaymentReadbackAttempts.tenantId,context.tenantId),eq(vendePaymentReadbackAttempts.invoiceId,input.invoiceId),
        eq(vendePaymentReadbackAttempts.state,"processing"),sql`${vendePaymentReadbackAttempts.startedAt} < ${new Date(now.getTime()-30_000)}`,
      )).returning({id:vendePaymentReadbackAttempts.id});
      for(const row of rows)await audit(tx,context,"vende.payment_readback.quarantined",row.id);
      return {quarantined:rows.length};
    });
  }
}
