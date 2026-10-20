import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({
  session:vi.fn(),authority:vi.fn(),stepUp:vi.fn(),audit:vi.fn(),
  publish:vi.fn(),
}));
vi.mock("next/headers",()=>({headers:vi.fn(async()=>new Headers())}));
vi.mock("../src/application/security/resolve-tenant-context",()=>({
  resolveTenantContext:mocks.session,
}));
vi.mock("../src/application/billing/assistant-plan-catalog-service",()=>({
  requireFMPlanAuthority:mocks.authority,
}));
vi.mock("../src/application/security/password-step-up",()=>({
  verifyPasswordStepUp:mocks.stepUp,
}));
vi.mock("../src/application/audit/record-audit-event",()=>({
  recordAuditEvent:mocks.audit,
}));
vi.mock("../src/application/billing/vende-c06-governed-execution",()=>({
  GovernedVendeC06Service:class{publishCalendar=mocks.publish;},
}));
vi.mock("../src/infrastructure/db/client",()=>({db:{}}));

import { POST } from "../src/app/api/billing/products/[productId]/vende-calendar/route";
const pid="11111111-1111-4111-8111-111111111111";
const params={params:Promise.resolve({productId:pid})};
const payload={
  region:"BR-SP",revision:1,
  validFrom:"2026-10-01",validThrough:"2026-12-31",
  holidays:["2026-10-26"],
  sourceRef:"fm-reviewed-official-calendar",
  password:"only-synthetic-ci-password",
};
const input=(body:object)=>new Request("http://localhost/api/billing/products/"+pid+"/vende-calendar",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify(body),
});
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    tenantId:"fm-company",userId:"fm-admin",role:"admin",correlationId:"request-1",
  });
  mocks.stepUp.mockResolvedValue({userId:"fm-admin",verifiedAt:new Date()});
  mocks.publish.mockResolvedValue({id:pid,revision:1});
  mocks.audit.mockResolvedValue(undefined);
});
describe("C06 governed FM calendar server ingress",()=>{
  it("rejects unknown extra fields and source/tenant override",async()=>{
    for(const extra of [
      {tenantId:"other-tenant"}, {externalUrl:"https://attacker.invalid"},
      {password:null},{holidays:[true]},{revision:"1"},
    ]){
      expect((await POST(input({...payload,...extra}),params)).status).toBe(400);
    }
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("requires same human step-up actor and pre-audit before DB mutation",async()=>{
    mocks.stepUp.mockResolvedValueOnce({userId:"someone-else",verifiedAt:new Date()});
    expect((await POST(input(payload),params)).status).toBe(403);
    mocks.audit.mockRejectedValueOnce(new Error("audit database failed"));
    expect((await POST(input(payload),params)).status).toBe(403);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect((await POST(input(payload),params)).status).toBe(201);
    expect(mocks.audit).toHaveBeenCalledTimes(3);
    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(mocks.audit.mock.invocationCallOrder[2])
      .toBeLessThan(mocks.publish.mock.invocationCallOrder[0]);
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm-company"}),
      expect.objectContaining({userId:"fm-admin"}),
      expect.objectContaining({region:"BR-SP",revision:1,productId:pid}),
    );
  });
  it("rejects external tenant and staff role before any write",async()=>{
    mocks.authority.mockImplementationOnce(()=>{throw new Error("FM only");});
    expect((await POST(input(payload),params)).status).toBe(403);
    expect(mocks.stepUp).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
