import { describe, expect, it } from "vitest";
import { listTenantGatewayConfigurations, validateGatewayConfiguration, type GatewayConfiguration } from "../src/domain/billing-central/gateway-configuration";
import type { TenantContext } from "../src/domain/security/tenant-context";

const owner: TenantContext = { tenantId: "fm", userId: "u1", role: "owner", correlationId: "c1" };
const config = { billingTenantId: "fm", providerCode: "mercado_pago", environment: "sandbox" as const,
  credentialRef: "vault://fm/gateways/mp", publicLabel: "Minha conta Mercado Pago" };
describe("gateway configuration tenancy", () => {
  it("accepts a provider configuration via a secret reference", () => {
    expect(validateGatewayConfiguration(owner, config)).toEqual(config);
  });
  it("rejects a cross-tenant configuration", () => {
    expect(() => validateGatewayConfiguration(owner, { ...config, billingTenantId: "other" })).toThrow();
  });
  it("rejects raw API endpoints or inline secrets", () => {
    expect(() => validateGatewayConfiguration(owner, { ...config, credentialRef: "https://api.example.com/token" })).toThrow();
    expect(() => validateGatewayConfiguration(owner, { ...config, credentialRef: "sk_live_literal" })).toThrow();
  });
  it("separates each company's accounts and strips credential references", () => {
    const records: GatewayConfiguration[] = [
      { ...config, id: "one", status: "disabled" },
      { ...config, id: "two", billingTenantId: "other", status: "verified" },
    ];
    expect(listTenantGatewayConfigurations(owner, records)).toEqual([{
      id: "one", billingTenantId: "fm", providerCode: "mercado_pago",
      environment: "sandbox", publicLabel: "Minha conta Mercado Pago", status: "disabled",
    }]);
  });
});
