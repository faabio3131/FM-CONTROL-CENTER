import { describe, expect, it } from "vitest";
import { asaasBaseUrl, buildAsaasReadOnlyRequest, assertAsaasSandboxOnly } from "../src/infrastructure/billing/asaas-connector";
describe("Asaas provider sandbox foundation",()=>{
  it("keeps production and sandbox endpoints distinct",()=>{
    expect(asaasBaseUrl("sandbox")).toBe("https://api-sandbox.asaas.com/v3");
    expect(asaasBaseUrl("production")).toBe("https://api.asaas.com/v3");
  });
  it("only constructs approved read-only requests",()=>{
    const request=buildAsaasReadOnlyRequest("sandbox","myAccount","test-key");
    expect(request.url).toBe("https://api-sandbox.asaas.com/v3/myAccount");
    expect(request.init.method).toBe("GET");
    expect(request.init.redirect).toBe("error");
    expect((request.init.headers as Record<string,string>).access_token).toBe("test-key");
    expect(JSON.stringify({url:request.url,method:request.init.method})).not.toContain("test-key");
  });
  it("blocks invalid resources, credentials and production activation",()=>{
    expect(()=>buildAsaasReadOnlyRequest("sandbox","/anything" as "payments","abc")).toThrow();
    expect(()=>buildAsaasReadOnlyRequest("sandbox","payments","bad\nheader")).toThrow();
    expect(()=>assertAsaasSandboxOnly("production")).toThrow();
    expect(()=>assertAsaasSandboxOnly("sandbox")).not.toThrow();
  });
});
