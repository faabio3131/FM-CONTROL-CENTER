import { ASAAS_PRODUCTION_SECRET_REF, resolveGatewaySecret } from "./secret-resolver";

const BASE = "https://api.asaas.com/v3";
export class AsaasCheckoutTransportError extends Error {
  constructor(readonly code: string) { super(code); this.name = "AsaasCheckoutTransportError"; }
}
export type AsaasCustomer = { id: string; externalReference?: string };
export type AsaasPixCode = { encodedImage: string; payload: string; expirationDate?: string };
type Transport = typeof fetch;

/**
 * Provider boundary, not an exposed checkout route. Secrets remain server-side.
 * Never auto-retry ambiguous POSTs; caller must reconcile by externalReference.
 */
export class AsaasCheckoutClient {
  constructor(private readonly transport: Transport = fetch) {}
  private async request<T>(method: "GET" | "POST", path: string, payload?: object): Promise<T> {
    const key = resolveGatewaySecret({ provider: "asaas", environment: "production", secretRef: ASAAS_PRODUCTION_SECRET_REF });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await this.transport(BASE + path, {
        method, headers: { access_token: key, accept: "application/json", "content-type": "application/json", "user-agent": "FMCommand/1.0" },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: controller.signal, redirect: "error", cache: "no-store",
      });
      if (!res.ok) throw new AsaasCheckoutTransportError("billing.asaas_http_" + res.status);
      return await res.json() as T;
    } catch (error) {
      if (error instanceof AsaasCheckoutTransportError) throw error;
      throw new AsaasCheckoutTransportError("billing.asaas_uncertain_response");
    } finally { clearTimeout(timeout); }
  }
  async findCustomers(reference: string): Promise<AsaasCustomer[]> {
    if (!/^fmcc-[a-z0-9-]{6,100}$/.test(reference)) throw new AsaasCheckoutTransportError("billing.customer_reference_invalid");
    const found = await this.request<{ data?: AsaasCustomer[] }>("GET", "/customers?externalReference=" + encodeURIComponent(reference));
    if (!Array.isArray(found.data)) throw new AsaasCheckoutTransportError("billing.customer_lookup_invalid");
    return found.data.filter(c => c.externalReference === reference && /^cus_[\w-]+$/.test(c.id));
  }
  async ensureCustomer(input: { reference: string; name: string; cpfCnpj: string; email?: string }): Promise<string> {
    const existing = await this.findCustomers(input.reference);
    if (existing.length > 1) throw new AsaasCheckoutTransportError("billing.customer_duplicate_requires_review");
    if (existing.length === 1) return existing[0].id;
    if (input.name.trim().length < 3 || !/^\d{11}(?:\d{3})?$/.test(input.cpfCnpj))
      throw new AsaasCheckoutTransportError("billing.customer_data_invalid");
    const created = await this.request<AsaasCustomer>("POST", "/customers", {
      name: input.name.trim(), cpfCnpj: input.cpfCnpj,
      ...(input.email ? { email: input.email.trim() } : {}),
      externalReference: input.reference, notificationDisabled: true,
    });
    if (!/^cus_[\w-]+$/.test(created.id) || created.externalReference !== input.reference)
      throw new AsaasCheckoutTransportError("billing.customer_create_unconfirmed");
    return created.id;
  }
  async pixCode(paymentId: string): Promise<AsaasPixCode> {
    if (!/^pay_[\w-]+$/.test(paymentId)) throw new AsaasCheckoutTransportError("billing.payment_id_invalid");
    const data = await this.request<AsaasPixCode>("GET", "/payments/" + encodeURIComponent(paymentId) + "/pixQrCode");
    if (!data.payload || !data.encodedImage || !/^[a-zA-Z0-9+/=]+$/.test(data.encodedImage))
      throw new AsaasCheckoutTransportError("billing.pix_payload_invalid");
    return data;
  }
}
