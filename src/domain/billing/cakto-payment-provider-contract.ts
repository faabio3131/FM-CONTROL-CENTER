/** Cakto adapter boundary over the existing Command-owned billing ledger. */
export class PaymentProviderError extends Error {
  constructor(readonly code: string, readonly kind: "transient" | "rejected" | "uncertain") { super(code); this.name = "PaymentProviderError"; }
}
export class WebhookRejectedError extends Error {
  constructor(readonly code: string) { super(code); this.name = "WebhookRejectedError"; }
}
export type Money = { readonly amountMinor: number; readonly currency: string };
export type CreateSubscriptionInput = { readonly customerRef: string; readonly price: Money; readonly interval: "month" | "year"; readonly externalReference: string; readonly description: string; readonly firstDueDate: string };
export type CustomerInput = { readonly name: string; readonly email: string; readonly taxId: string | null; readonly externalReference: string };
export type ProviderSubscription = { readonly subscriptionRef: string; readonly checkoutUrl: string | null };
export type PaymentEvent = { readonly eventId: string; readonly type: "payment_confirmed" | "payment_overdue" | "payment_refunded" | "subscription_cancelled"; readonly subscriptionRef: string; readonly paymentRef: string | null; readonly amount: Money | null; readonly occurredAt: Date; readonly offerInterval: "month" | "year" };
export type ProviderCapabilities = { readonly billingMode: "provider_recurring"; readonly methods: readonly ("pix" | "card")[]; readonly refunds: boolean };
export type PaymentProvider = {
  readonly id: string; readonly currencies: readonly string[]; readonly capabilities: ProviderCapabilities;
  createCustomer(input: CustomerInput): Promise<{ customerRef: string }>;
  createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription>;
  findSubscriptionByReference(reference: string): Promise<ProviderSubscription | null>;
  cancelSubscription(subscriptionRef: string): Promise<void>;
  verifyWebhook(headers: Headers, rawBody: string): PaymentEvent | null;
};
