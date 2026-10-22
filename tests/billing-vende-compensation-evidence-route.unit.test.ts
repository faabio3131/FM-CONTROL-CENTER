import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),password:vi.fn(),config:vi.fn(),verify:vi.fn()}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",()=>({resolveTenantContext:m.session}));
vi.mock("../src/application/security/password-step-up",()=>({verifyPasswordStepUp:m.password}));
vi.mock("../src/application/billing/assistant-plan-outbox-dispatcher",()=>({planProjectionConfigFromEnvironment:m.config}));
vi.mock("../src/application/billing/vende-compensation-evidence-review",()=>({observeVendeCompensationEvidence:m.verify}));
import {POST} from "../src/app/api/billing/products/[productId]/vende-compensation-evidence/route";
const productId="11111111-1111-4111-8111-111111111111";
const commandId="22222222-2222-4222-8222-222222222222";
const url="http://localhost/api/billing/products/"+productId+"/vende-compensation-evidence";
const params={params:Promise.resolve({productId})};
const post=(body:unknown)=>new Request(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const input={commandId,expectedReviewVersion:1,password:"fm-operator-password"};
beforeEach(()=>{
  vi.resetAllMocks();
  m.session.mockResolvedValue({tenantId:"fm",userId:"owner",role:"owner"});
  m.password.mockResolvedValue({userId:"owner",verifiedAt:new Date()});
  m.config.mockReturnValue({organizationId:"fm",signingKey:"synthetic-commercial-key-32-bytes",keyId:"fm-key",assistantOrigin:"https://assistant.example.test"});
  m.verify.mockResolvedValue({state:"remote_operation_not_applied",remoteObserved:true,remediationDispatched:false,caseResolved:false});
});
describe("P01 supervised read-only case evidence HTTP",()=>{
  it("requires FM password and keeps response read only",async()=>{
    const r=await POST(post(input),params);
    expect(r.status).toBe(200);expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect((await r.json()).remediationDispatched).toBe(false);
    expect(m.password).toHaveBeenCalledOnce();
    expect(m.verify).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm"}),
      expect.objectContaining({userId:"owner"}),
      {productId,commandId,expectedReviewVersion:1},
      expect.objectContaining({organizationId:"fm"}),
    );
  });
  it("rejects additional fields and invalid approval",async()=>{
    for(const mutation of [
      {...input,tenantId:"foreign"},{...input,refund:true},
      {...input,resolved:true},{...input,licenseStatus:"active"},
      {...input,expectedReviewVersion:0},{...input,expectedReviewVersion:"1"},
      {...input,commandId:"invalid"},{...input,password:""},
      {...input,password:"a".repeat(150)},{...input,reason:"x".repeat(2000)},
    ])expect((await POST(post(mutation),params)).status).toBe(400);
    expect(m.verify).not.toHaveBeenCalled();
    expect(m.password).not.toHaveBeenCalled();
  });
  it("sanitizes refused authority and transport",async()=>{
    m.session.mockRejectedValueOnce(Error("DATABASE_SECRET"));
    const r=await POST(post(input),params);
    expect(r.status).toBe(403);expect(await r.text()).not.toContain("DATABASE_SECRET");
    m.verify.mockRejectedValueOnce(Error("REMOTE_KEY_SECRET"));
    const s=await POST(post(input),params);
    expect(s.status).toBe(403);expect(await s.text()).not.toContain("REMOTE_KEY_SECRET");
  });
});
