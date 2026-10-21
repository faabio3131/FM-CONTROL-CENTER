import { and, desc, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { billingInvoices, billingProviderPayments } from "@/infrastructure/db/billing-schema";
import { vendePaymentAttestations } from "@/infrastructure/db/vende-commercial-schema";

import { vendePaymentReadbackAttempts } from "@/infrastructure/db/vende-payment-readback-schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type InvoiceIdentity = Pick<typeof billingInvoices.$inferSelect,"id"|"tenantId"|"gatewayAccountId">;

/** Evidence is trusted only when written by the authorized reconciler AND bound
 * to the canonical payment. This reader never authenticates a provider payload,
 * accepts a customer-supplied observation, or falls back to older positive proof.
 * Callers must lock and validate the complete commercial invoice first.
 */
export async function currentBoundVendePaymentEvidence(
  tx:Transaction,invoice:InvoiceIdentity,now:Date,
){
  if(!Number.isFinite(now.getTime()))return null;
  const [payment]=await tx.select().from(billingProviderPayments).where(and(
    eq(billingProviderPayments.tenantId,invoice.tenantId),
    eq(billingProviderPayments.invoiceId,invoice.id),
    eq(billingProviderPayments.gatewayAccountId,invoice.gatewayAccountId),
  )).limit(1);
  if(!payment)return null;
  const [inFlight]=await tx.select().from(vendePaymentReadbackAttempts).where(and(
    eq(vendePaymentReadbackAttempts.tenantId,invoice.tenantId),
    eq(vendePaymentReadbackAttempts.invoiceId,invoice.id),
    eq(vendePaymentReadbackAttempts.state,"processing"),
  )).limit(1);
  if(inFlight)return null;
  const [last]=await tx.select().from(vendePaymentAttestations).where(and(
    eq(vendePaymentAttestations.tenantId,invoice.tenantId),
    eq(vendePaymentAttestations.invoiceId,invoice.id),
  )).orderBy(desc(vendePaymentAttestations.verifiedAt),
    desc(vendePaymentAttestations.createdAt),
    desc(vendePaymentAttestations.observationSequence)).limit(1);
  if(!last || last.externalPaymentRef!==payment.externalPaymentId ||
     !Number.isFinite(last.verifiedAt.getTime()) ||
     last.verifiedAt.getTime()>now.getTime()+15_000 ||
     now.getTime()-last.verifiedAt.getTime()>15*60_000)return null;
  // An uncertain readback invalidates all earlier evidence, including proof
  // with tolerated future clock skew. New positive proof must be appended later.
  const [uncertain]=await tx.select().from(vendePaymentAttestations).where(and(
    eq(vendePaymentAttestations.tenantId,invoice.tenantId),
    eq(vendePaymentAttestations.invoiceId,invoice.id),
    eq(vendePaymentAttestations.outcome,"needs_attention"),
  )).orderBy(desc(vendePaymentAttestations.observationSequence)).limit(1);
  if(uncertain && uncertain.observationSequence>last.observationSequence)return null;
  // A locally received/confirmed/reversed payment is never unpaid proof.
  // Unknown provider status requires reconciliation, not optimistic suspension.
  if(last.outcome==="unpaid_verified" &&
     !["pending","PENDING","OVERDUE"].includes(payment.status))return null;
  return last;
}
