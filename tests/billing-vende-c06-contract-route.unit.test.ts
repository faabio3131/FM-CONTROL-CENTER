import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({
  session:vi.fn(),authority:vi.fn(),stepUp:vi.fn(),audit:vi.fn(),
  enroll:vi.fn(),suspend:vi.fn(),cancel:vi.fn(),regularize:vi.fn(),
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
  GovernedVendeC06Service:class{
    enrollPaidTerm=mocks.enroll;
    requestSuspension=mocks.suspend;
    scheduleCancellation=mocks.cancel;
    requestRegularization=mocks.regularize;
  },
}));
import { POST } from "../src/app/api/billing/vende-contracts/route";

const base={
  action:"request_delinquency_suspension",
  productId:"11111111-1111-4111-8111-111111111111",
  subscriptionId:"22222222-2222-4222-8222-222222222222",
  invoiceId:"33333333-3333-4333-8333-333333333333",
  operationId:"fm-license-hold-2026-001",
  expectedRevision:1,
  sourceRef:"fm-verified-readback-123",
  password:"synthetic-admin-password",
};
const request=(body:object)=>new Request("http://localhost/api/billing/vende-contracts",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify(body),
});
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    tenantId:"fm-company",userId:"fm-owner",role:"owner",correlationId:"c06",
  });
  mocks.stepUp.mockResolvedValue({userId:"fm-owner",verifiedAt:new Date()});
  mocks.audit.mockResolvedValue(undefined);
  mocks.suspend.mockResolvedValue({state:"pending",remoteEntitlementConfirmed:false,revision:2});
});
describe("C06 governed contract ingress: no external authority from request body",()=>{
  it("refuses spoofed tenant, fake provider status, URL and extra fields",async()=>{
    for(const extra of [
      {tenantId:"other"}, {providerPaymentStatus:"paid"},
      {assistantOrigin:"https://attacker.invalid"},
      {expectedRevision:"1"},
      {operationId:null},
    ]){
      expect((await POST(request({...base,...extra}))).status).toBe(400);
    }
    expect(mocks.suspend).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("rejects oversized payload before step-up or mutation",async()=>{
    const big=await POST(request({...base,sourceRef:"a".repeat(10_000)}));
    expect(big.status).toBe(403);
    expect(mocks.stepUp).not.toHaveBeenCalled();
    expect(mocks.suspend).not.toHaveBeenCalled();
  });
  it("requires step-up, durable pre-audit and does not report delivered",async()=>{
    mocks.stepUp.mockResolvedValueOnce({userId:"other"});
    expect((await POST(request(base))).status).toBe(403);
    mocks.audit.mockRejectedValueOnce(new Error("audit offline"));
    expect((await POST(request(base))).status).toBe(403);
    expect(mocks.suspend).not.toHaveBeenCalled();
    const response=await POST(request(base));
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      result:{state:"pending",remoteEntitlementConfirmed:false},
      deliveryConfirmed:false,
    });
    expect(mocks.suspend).toHaveBeenCalledOnce();
    expect(mocks.suspend).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm-company"}),
      expect.objectContaining({userId:"fm-owner"}),
      expect.objectContaining({expectedRevision:1,operationId:base.operationId}),
    );
    expect(mocks.audit.mock.invocationCallOrder[1])
      .toBeLessThan(mocks.suspend.mock.invocationCallOrder[0]);
  });
  it("rejects lifecycle tenant spoofing and requires distinct evidence fields",async()=>{
    const cancelled={action:"schedule_cancellation",
      productId:base.productId,subscriptionId:base.subscriptionId,
      expectedRevision:1,operationId:"cancel-consent-123",
      customerConsentRef:"verified-consent-fm-123",password:base.password};
    const regularize={action:"request_regularization",
      productId:base.productId,subscriptionId:base.subscriptionId,
      paidInvoiceId:base.invoiceId,expectedRevision:1,
      operationId:"reactivate-paid-123",sourceRef:"settlement-readback-123",
      password:base.password};
    for(const invalid of [
      {...cancelled,tenantId:"foreign"},
      {...cancelled,sourceRef:"ignored-field"},
      {...cancelled,expectedRevision:"1"},
      {...regularize,providerPaid:true},
      {...regularize,invoiceId:base.invoiceId},
      {...regularize,paidInvoiceId:null},
    ])expect((await POST(request(invalid))).status).toBe(400);
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.regularize).not.toHaveBeenCalled();
    mocks.cancel.mockResolvedValueOnce({state:"cancel_at_period_end",
      paidAccessUntil:"2026-11-15",remoteEntitlementConfirmed:false});
    mocks.regularize.mockResolvedValueOnce({state:"reactivation_pending",
      remoteEntitlementConfirmed:false});
    const first=await POST(request(cancelled));
    expect(first.status).toBe(202);
    expect(await first.json()).toMatchObject({deliveryConfirmed:false,
      result:{state:"cancel_at_period_end",remoteEntitlementConfirmed:false}});
    const second=await POST(request(regularize));
    expect(second.status).toBe(202);
    expect(await second.json()).toMatchObject({deliveryConfirmed:false,
      result:{state:"reactivation_pending",remoteEntitlementConfirmed:false}});
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.regularize).toHaveBeenCalledOnce();
  });

});
