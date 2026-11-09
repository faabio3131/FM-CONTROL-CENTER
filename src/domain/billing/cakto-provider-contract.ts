/**
 * V1 FM Command — interface de transporte de checkout Cakto.
 * Nenhuma regra financeira ou autoridade de licença pertence a este adapter.
 */
export class PaymentProviderError extends Error {
  constructor(readonly code: string, readonly kind: "transient" | "rejected" | "uncertain") {
    super(code); this.name = "PaymentProviderError";
  }
}
export class WebhookRejectedError extends Error {
  constructor(readonly code: string) { super(code); this.name = "WebhookRejectedError"; }
}
export type Money = { amountMinor: number; currency: string };
export type CustomerInput = { name: string; email: string; taxId: string | null; externalReference: string };
export type CreateSubscriptionInput = {
  customerRef: string; price: Money; interval: "month" | "year"; externalReference: string;
  description: string; firstDueDate: string;
};
export type ProviderSubscription = { subscriptionRef: string; checkoutUrl: string | null };
export type PaymentEvent = {
  eventId: string; type: "payment_confirmed" | "payment_overdue" | "payment_refunded" | "subscription_cancelled";
  subscriptionRef: string; paymentRef: string | null; amount: Money | null; occurredAt: Date;
};
export type ProviderCapabilities = { billingMode: "provider_recurring"; methods: readonly ("pix" | "card")[]; refunds: boolean };
export interface PaymentProvider {
  readonly id: string; readonly currencies: readonly string[];
  readonly capabilities: ProviderCapabilities;
  createCustomer(input: CustomerInput): Promise<{ customerRef: string }>;
  createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription>;
  findSubscriptionByReference(reference: string): Promise<ProviderSubscription | null>;
  cancelSubscription(subscriptionRef: string): Promise<void>;
  verifyWebhook(headers: Headers, rawBody: string): PaymentEvent | null;
}
