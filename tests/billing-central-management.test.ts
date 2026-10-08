import { describe, expect, it } from "vitest";
import { validateGatewayDisable, GatewayManagementUnavailableError, sanitizeGatewaySecretInput } from "../src/domain/billing-central/gateway-management";
import type { TenantContext } from "../src/domain/security/tenant-context";

const owner: TenantContext = {tenantId:"fm",userId:"owner1",role:"owner",correlationId:"test"};
const viewer: TenantContext = {...owner,role:"viewer"};
const target = {id:"018f51b2-78c4-7b32-8a11-000000000003",billingTenantId:"fm",status:"verified" as const};
describe("gateway write safety gate",()=>{
  it("blocks financial writes when management is disabled",()=>{
    expect(()=>validateGatewayDisable(owner,target,false)).toThrow(GatewayManagementUnavailableError);
  });
  it("enforces billing write authorization",()=>{
    expect(()=>validateGatewayDisable(viewer,target,true)).toThrow("security.permission_denied:billing:write");
  });
  it("denies attempts to write another tenant gateway",()=>{
    expect(()=>validateGatewayDisable(owner,{...target,billingTenantId:"other"},true)).toThrow("security.cross_tenant_access_denied");
  });
  it("never persists client-provided inline credentials",()=>{
    expect(()=>sanitizeGatewaySecretInput({api_key:"sk_live",credentialRef:"vault://arbitrary"})).toThrow(GatewayManagementUnavailableError);
  });
});
