import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),password:vi.fn(),prepare:vi.fn(),second:vi.fn(),queue:vi.fn(),config:vi.fn()}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",
  ()=>({resolveTenantContext:m.session}));
vi.mock("../src/application/security/password-step-up",
  ()=>({verifyPasswordStepUp:m.password}));
vi.mock("../src/application/billing/vende-compensation-correction-intent",
  ()=>({prepareVendeCorrectionIntent:m.prepare,secondReviewVendeCorrectionIntent:m.second,
    queueReviewedVendeCorrection:m.queue}));
vi.mock("../src/application/billing/assistant-plan-outbox-dispatcher",
  ()=>({planProjectionConfigFromEnvironment:m.config}));
import {POST} from "../src/app/api/billing/products/[productId]/vende-compensation-intents/route";
const productId="11111111-1111-4111-8111-111111111111";
const commandId="22222222-2222-4222-8222-222222222222";
const intentId="33333333-3333-4333-8333-333333333333";
const url="http://localhost/api/billing/products/"+productId+"/vende-compensation-intents";
const params={params:Promise.resolve({productId})};
const post=(obj:unknown)=>new Request(url,{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify(obj)});
const input={action:"prepare",commandId,expectedReviewVersion:2,password:"synthetic-human-password"};
beforeEach(()=>{
  vi.resetAllMocks();
  m.session.mockResolvedValue({tenantId:"fm",userId:"fm-owner",role:"owner"});
  m.password.mockResolvedValue({userId:"fm-owner",verifiedAt:new Date()});
  m.prepare.mockResolvedValue({intentId,approvedForDispatch:false,
    remediationDispatched:false,review:"awaiting_independent_human_review"});
  m.second.mockResolvedValue({intentId,approvedForDispatch:false,
    remediationDispatched:false,review:"reviewed_no_dispatch"});
  m.config.mockReturnValue({organizationId:"fm",assistantOrigin:"https://assistant.test/",
    signingKey:"synthetic-command-key-long-enough-123456",keyId:"fm-key"});
  m.queue.mockResolvedValue({intentId,operationId:"p01.correction."+intentId,
    state:"reactivation_pending",remoteEntitlementConfirmed:false,
    financialRefundExecuted:false,caseResolved:false,automaticDispatchExecuted:false});
});
describe("P01 two-person correction intent endpoint remains non-mutating",()=>{
  it("prepares with fresh password proof; never accepts refunds/close commands",async()=>{
    const r=await POST(post(input),params);
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(await r.json()).toMatchObject({approvedForDispatch:false,
      remediationDispatched:false});
    expect(m.prepare).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm"}),
      expect.objectContaining({userId:"fm-owner"}),
      {productId,commandId,expectedReviewVersion:2},
    );
    expect(m.second).not.toHaveBeenCalled();
  });
  it("requires explicit prepared intent identifier for independent review",async()=>{
    const r=await POST(post({...input,action:"second_review",intentId}),params);
    expect(r.status).toBe(200);
    expect(m.second).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm"}),
      expect.objectContaining({userId:"fm-owner"}),
      {productId,commandId,expectedReviewVersion:2,intentId},
    );
  });
  it("queues only through explicit fresh third action, not second_review",async()=>{
    const r=await POST(post({...input,action:"queue",intentId}),params);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      state:"reactivation_pending",remoteEntitlementConfirmed:false,
      financialRefundExecuted:false,automaticDispatchExecuted:false,
    });
    expect(m.queue).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm"}),
      expect.objectContaining({userId:"fm-owner"}),
      {productId,commandId,expectedReviewVersion:2,intentId},
      expect.objectContaining({organizationId:"fm"}),
    );
    expect(m.prepare).not.toHaveBeenCalled();
    expect(m.second).not.toHaveBeenCalled();
  });
  it("denies arbitrary financial, tenant, resolution and dispatch fields before step-up",async()=>{
    for(const altered of [
      {...input,tenantId:"victim"}, {...input,refundAmount:100},
      {...input,approveDispatch:true},{...input,resolved:true},
      {...input,action:"refund"}, {...input,action:"dispatch"},
      {...input,expectedReviewVersion:0},
      {...input,expectedReviewVersion:2.5},
      {...input,expectedReviewVersion:"2"}, {...input,password:""},
      {...input,password:"a".repeat(160)},
      {...input,action:"second_review"},
      {...input,action:"second_review",intentId:"malformed"},
      {...input,action:"prepare",intentId},
      {...input,action:"queue"},
      {...input,action:"queue",intentId,amount:100},
    ])expect((await POST(post(altered),params)).status).toBe(400);
    expect(m.prepare).not.toHaveBeenCalled();
    expect(m.second).not.toHaveBeenCalled();
    expect(m.queue).not.toHaveBeenCalled();
    expect(m.password).not.toHaveBeenCalled();
  });
  it("fails closed without exposing authentication or ledger details",async()=>{
    m.session.mockRejectedValueOnce(Error("EXTERNAL_PASSWORD"));
    const r=await POST(post(input),params);
    expect(r.status).toBe(403);
    expect(await r.text()).not.toContain("EXTERNAL_PASSWORD");
    m.prepare.mockRejectedValueOnce(Error("FINANCIAL_REFERENCE"));
    const s=await POST(post(input),params);
    expect(s.status).toBe(403);
    expect(await s.text()).not.toContain("FINANCIAL_REFERENCE");
  });
});
