import { attributeGatewayPayment, validateBillingAttribution, type BillingAttribution, type GatewayPaymentNotice } from "@/domain/billing/payment-attribution";
import { AsaasSandboxClient, type AsaasCharge } from "@/infrastructure/billing/asaas-sandbox-client";

export interface CanonicalBillingRepository {
  findInvoice(tenantId: string, invoiceId: string): Promise<BillingAttribution | null>;
  findPayment(tenantId: string, gatewayAccountId: string, externalPaymentId: string): Promise<{ invoiceId: string; status: string } | null>;
  recordPayment(input: { binding: BillingAttribution; externalPaymentId: string; status: string }): Promise<void>;
  markInvoicePaid(tenantId: string, invoiceId: string, externalPaymentId: string): Promise<void>;
}

/** Gate provider-verified payments through the persisted invoice identity; never trust SaaS-supplied identifiers. */
export class CanonicalBillingService {
  constructor(private readonly repository: CanonicalBillingRepository, private readonly gateway: Pick<AsaasSandboxClient, "createPixCharge" | "getCharge">) {}
  async createCharge(tenantId: string, invoiceId: string, asaasCustomerId: string, dueDate: string): Promise<AsaasCharge> {
    const binding = await this.repository.findInvoice(tenantId, invoiceId);
    if (!binding || binding.tenantId !== tenantId || binding.invoiceId !== invoiceId) throw new Error("billing.invoice_not_found");
    validateBillingAttribution(binding);
    if (binding.environment !== "sandbox") throw new Error("billing.sandbox_only");
    const existing = await this.repository.findPayment(tenantId, binding.gatewayAccountId, invoiceId);
    if (existing) throw new Error("billing.payment_already_registered");
    const charge = await this.gateway.createPixCharge({
      customer: asaasCustomerId,
      value: binding.amountMinor / 100,
      dueDate,
      externalReference: binding.invoiceId,
      description: "FM Tecnologia - " + binding.productId + " - " + binding.invoiceId,
    });
    await this.repository.recordPayment({binding, externalPaymentId:charge.id,status:charge.status});
    return charge;
  }
  async reconcile(tenantId: string, invoiceId: string, paymentId: string): Promise<"paid" | "pending"> {
    const binding = await this.repository.findInvoice(tenantId,invoiceId);
    if (!binding || binding.tenantId !== tenantId) throw new Error("billing.invoice_not_found");
    if (binding.environment !== "sandbox") throw new Error("billing.sandbox_only");
    const registered = await this.repository.findPayment(tenantId,binding.gatewayAccountId,paymentId);
    if (!registered || registered.invoiceId !== invoiceId) throw new Error("billing.payment_binding_mismatch");
    const charge = await this.gateway.getCharge(paymentId);
    if (charge.id !== paymentId || charge.externalReference !== invoiceId || !Number.isFinite(charge.value))
      throw new Error("billing.gateway_response_mismatch");
    const amountMinor = Math.round(charge.value * 100);
    const notice: GatewayPaymentNotice = {
      provider:"asaas",providerPaymentId:charge.id,gatewayAccountId:binding.gatewayAccountId,
      environment:"sandbox",invoiceId,amountMinor,currency:"BRL",eventId:"reconciliation:"+paymentId,
    };
    attributeGatewayPayment(binding,notice);
    if (charge.status !== "RECEIVED" && charge.status !== "CONFIRMED") return "pending";
    await this.repository.markInvoicePaid(tenantId,invoiceId,paymentId);
    return "paid";
  }
}
