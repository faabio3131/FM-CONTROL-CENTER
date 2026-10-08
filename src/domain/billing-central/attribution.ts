/** Deterministic attribution boundary: never infer the payer or product from email or display labels. */
export type PaymentAttribution = Readonly<{
  billingTenantId: string;
  productCode: string;
  customerId: string;
  subscriptionId: string;
  invoiceId: string;
  gatewayAccountId: string;
  provider: string;
  externalPaymentId: string;
}>;

export type ExpectedInvoice = Readonly<{
  billingTenantId: string;
  productCode: string;
  customerId: string;
  subscriptionId: string;
  invoiceId: string;
  gatewayAccountId: string;
  amountMinor: bigint;
  currency: string;
}>;

export type VerifiedGatewayReceipt = Readonly<{
  billingTenantId: string;
  gatewayAccountId: string;
  provider: string;
  externalPaymentId: string;
  amountMinor: bigint;
  currency: string;
}>;

export type AttributionResult =
  | Readonly<{ status: "matched"; attribution: PaymentAttribution }>
  | Readonly<{ status: "quarantined"; reason: string }>;

export function attributePayment(
  expected: ExpectedInvoice | null,
  receipt: VerifiedGatewayReceipt,
  providerReference: Readonly<{
    billingTenantId: string;
    productCode: string;
    customerId: string;
    subscriptionId: string;
    invoiceId: string;
  }> | null,
): AttributionResult {
  if (!expected || !providerReference) return { status: "quarantined", reason: "missing_verified_mapping" };
  if (!receipt.externalPaymentId || !receipt.provider) return { status: "quarantined", reason: "invalid_external_reference" };
  const fields = ["billingTenantId", "productCode", "customerId", "subscriptionId", "invoiceId"] as const;
  if (fields.some((key) => !expected[key] || expected[key] !== providerReference[key])) {
    return { status: "quarantined", reason: "identity_mismatch" };
  }
  if (expected.billingTenantId !== receipt.billingTenantId ||
      expected.gatewayAccountId !== receipt.gatewayAccountId) {
    return { status: "quarantined", reason: "receiver_mismatch" };
  }
  if (expected.amountMinor <= 0n || expected.amountMinor !== receipt.amountMinor ||
      expected.currency !== receipt.currency || !/^[A-Z]{3}$/.test(receipt.currency)) {
    return { status: "quarantined", reason: "amount_or_currency_mismatch" };
  }
  return { status: "matched", attribution: {
    billingTenantId: expected.billingTenantId,
    productCode: expected.productCode,
    customerId: expected.customerId,
    subscriptionId: expected.subscriptionId,
    invoiceId: expected.invoiceId,
    gatewayAccountId: expected.gatewayAccountId,
    provider: receipt.provider,
    externalPaymentId: receipt.externalPaymentId,
  } };
}
