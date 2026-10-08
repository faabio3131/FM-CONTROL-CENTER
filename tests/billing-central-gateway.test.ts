import { describe, expect, it } from "vitest";
import { verifyGatewayNotification, type PaymentGatewayAdapter } from "../src/domain/billing-central/gateway";

const base = {
  provider: "cakto" as const, providerPaymentId: "pay-1", providerSubscriptionId: "sub-1",
  providerEventId: "evt-1", status: "paid" as const, currency: "BRL",
  amountMinor: 19900n, settledAt: "2026-10-08T12:00:00Z",
};

const adapter: PaymentGatewayAdapter = {
  provider: "cakto",
  async verifyWebhook() { return { verified: true, providerEventId: "evt-1" }; },
  async fetchPayment() { return base; },
};
describe("Billing gateway adapter boundary", () => {
  it("accepts an independently verified provider payment", async () => {
    await expect(verifyGatewayNotification(adapter, new Uint8Array(), {}, "pay-1")).resolves.toEqual(base);
  });
  it("rejects unsigned webhook even if API would return paid", async () => {
    await expect(verifyGatewayNotification({ ...adapter, verifyWebhook: async () => ({ verified: false }) },
      new Uint8Array(), {}, "pay-1")).rejects.toThrow("gateway_unverified_webhook");
  });
  it("rejects event mismatch", async () => {
    await expect(verifyGatewayNotification({ ...adapter, verifyWebhook: async () => ({ verified: true, providerEventId: "wrong" }) },
      new Uint8Array(), {}, "pay-1")).rejects.toThrow("gateway_identity_mismatch");
  });
  it("does not treat unconfirmed payment as settled", async () => {
    await expect(verifyGatewayNotification({ ...adapter, fetchPayment: async () => ({ ...base, settledAt: null }) },
      new Uint8Array(), {}, "pay-1")).rejects.toThrow("gateway_unconfirmed_settlement");
  });
});
