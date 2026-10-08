/**
 * Transport-independent gateway adapter contract. No live credentials or HTTP calls.
 * A gateway event is never proof of settlement until independently verified.
 */
export type PaymentProvider = "cakto" | "hotmart" | "asaas" | "stripe";
export type GatewayPaymentStatus = "pending" | "paid" | "failed" | "refunded" | "chargeback";
export type VerifiedPayment = Readonly<{
  provider: PaymentProvider;
  providerPaymentId: string;
  providerSubscriptionId: string;
  providerEventId: string;
  status: GatewayPaymentStatus;
  currency: string;
  amountMinor: bigint;
  settledAt: string | null;
}>;

export interface PaymentGatewayAdapter {
  readonly provider: PaymentProvider;
  /** Verify provider-specific cryptographic signature before parsing payload. */
  verifyWebhook(rawBody: Uint8Array, headers: Readonly<Record<string, string>>): Promise<{
    verified: boolean;
    providerEventId?: string;
  }>;
  /** Read payment from the provider API using secret-ref resolver, not inline credentials. */
  fetchPayment(paymentId: string): Promise<VerifiedPayment>;
}

export function normalizeProviderPayment(payment: VerifiedPayment): VerifiedPayment {
  if (!payment.providerPaymentId || !payment.providerSubscriptionId || !payment.providerEventId) {
    throw new Error("gateway_missing_identifiers");
  }
  if (!/^[A-Z]{3}$/.test(payment.currency) || payment.amountMinor < 0n) {
    throw new Error("gateway_invalid_amount");
  }
  if (payment.status === "paid" && (!payment.settledAt || !Number.isFinite(Date.parse(payment.settledAt)))) {
    throw new Error("gateway_unconfirmed_settlement");
  }
  return payment;
}

export async function verifyGatewayNotification(
  adapter: PaymentGatewayAdapter,
  body: Uint8Array,
  headers: Readonly<Record<string, string>>,
  paymentId: string,
): Promise<VerifiedPayment> {
  const verified = await adapter.verifyWebhook(body, headers);
  if (!verified.verified || !verified.providerEventId) throw new Error("gateway_unverified_webhook");
  const payment = normalizeProviderPayment(await adapter.fetchPayment(paymentId));
  if (payment.provider !== adapter.provider || payment.providerEventId !== verified.providerEventId) {
    throw new Error("gateway_identity_mismatch");
  }
  return payment;
}
