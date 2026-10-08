import { describe, expect, it } from "vitest";
import { canActivateProvider, listProviderDescriptors } from "../src/domain/billing-central/provider-registry";

describe("Gateway provider registry", () => {
  it("exposes known planned providers without advertising live readiness", () => {
    const items=listProviderDescriptors();
    expect(items.map((item)=>item.code)).toContain("mercado_pago");
    expect(items.map((item)=>item.code)).toContain("cakto");
    expect(items.every((item)=>item.status==="planned")).toBe(true);
    expect(items.every((item)=>item.supports.length===0)).toBe(true);
  });
  it("does not enable payments for an uncertified provider", () => {
    expect(canActivateProvider("cakto")).toBe(false);
    expect(canActivateProvider("unknown")).toBe(false);
  });
});
