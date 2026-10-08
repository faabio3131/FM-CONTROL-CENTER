import { describe, expect, it } from "vitest";
import { attributePayment, type ExpectedInvoice, type VerifiedGatewayReceipt } from "../src/domain/billing-central/attribution";

const expected: ExpectedInvoice = {
  billingTenantId: "fm", productCode: "KORDENA", customerId: "ze",
  subscriptionId: "sub-ze", invoiceId: "invoice-oct", gatewayAccountId: "fm-cakto",
  amountMinor: 19900n, currency: "BRL",
};
const reference = { billingTenantId: expected.billingTenantId, productCode: expected.productCode,
  customerId: expected.customerId, subscriptionId: expected.subscriptionId, invoiceId: expected.invoiceId };
const receipt: VerifiedGatewayReceipt = { billingTenantId: "fm", gatewayAccountId: "fm-cakto",
  provider: "cakto", externalPaymentId: "pay-100", amountMinor: 19900n, currency: "BRL" };

describe("billing commercial attribution", () => {
  it("attributes only a fully identified and verified receipt", () => {
    expect(attributePayment(expected, receipt, reference)).toEqual({ status: "matched", attribution: {
      ...reference, gatewayAccountId: "fm-cakto", provider: "cakto", externalPaymentId: "pay-100" } });
  });
  it.each([
    ["different SaaS", { ...reference, productCode: "ATENDEVENDEIA" }],
    ["different customer", { ...reference, customerId: "maria" }],
    ["different subscription", { ...reference, subscriptionId: "other-sub" }],
    ["different invoice", { ...reference, invoiceId: "other-invoice" }],
    ["different tenant", { ...reference, billingTenantId: "company-abc" }],
  ])("quarantines %s mapping", (_label, mapping) => {
    expect(attributePayment(expected, receipt, mapping).status).toBe("quarantined");
  });
  it("quarantines unrecognized payments rather than guessing by email", () => {
    expect(attributePayment(null, receipt, reference).status).toBe("quarantined");
    expect(attributePayment(expected, receipt, null).status).toBe("quarantined");
  });
  it("isolates gateway receiver and commercial tenant", () => {
    expect(attributePayment(expected, { ...receipt, gatewayAccountId: "abc-cakto" }, reference).status).toBe("quarantined");
    expect(attributePayment(expected, { ...receipt, billingTenantId: "company-abc" }, reference).status).toBe("quarantined");
  });
  it("quarantines amount and currency mismatch", () => {
    expect(attributePayment(expected, { ...receipt, amountMinor: 9900n }, reference).status).toBe("quarantined");
    expect(attributePayment(expected, { ...receipt, currency: "USD" }, reference).status).toBe("quarantined");
  });
});
