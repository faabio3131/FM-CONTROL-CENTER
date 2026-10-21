import { beforeEach,describe,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),authority:vi.fn(),step:vi.fn(),approve:vi.fn(),reactivate:vi.fn(),limit:vi.fn()}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",()=>({resolveTenantContext:m.session}));
vi.mock("../src/application/billing/assistant-plan-catalog-service",()=>({requireFMPlanAuthority:m.authority}));
vi.mock("../src/application/security/password-step-up",()=>({verifyPasswordStepUp:m.step}));
vi.mock("../src/application/billing/vende-c06-delivery",()=>({reapproveVendeDelinquency:m.approve}));
vi.mock("../src/application/billing/vende-reactivation-delivery",()=>({reapproveVendeReactivation:m.reactivate}));
vi.mock("../src/infrastructure/db/client",()=>{
  const chain={from:()=>chain,where:()=>chain,orderBy:()=>chain,limit:m.limit};
  return {db:{select:()=>chain}};
});
import { GET,POST } from "../src/app/api/billing/products/[productId]/vende-command-approvals/route";
const productId="11111111-1111-4111-8111-111111111111",commandId="22222222-2222-4222-8222-222222222222";
const params={params:Promise.resolve({productId})};const url="http://localhost/approvals";
const payload={commandId,expectedApprovedAt:null,password:"synthetic-test-password"};
const request=(b:unknown)=>new Request(url,{method:"POST",body:JSON.stringify(b)});
beforeEach(()=>{
  vi.resetAllMocks();m.session.mockResolvedValue({tenantId:"corporate",userId:"owner",role:"owner",correlationId:"approval-ci"});
  m.step.mockResolvedValue({userId:"owner",verifiedAt:new Date()});m.approve.mockResolvedValue({state:"pending",dispatched:false});m.reactivate.mockResolvedValue({state:"pending",dispatched:false});
});
describe("Vende command reapproval ingress",()=>{
  it("rejects authority and outcome injection, invalid bodies and oversized input before password checks",async()=>{
    for(const b of [null,[],{...payload,tenantId:"other"},{...payload,approvedAt:new Date().toISOString()},
      {...payload,actorId:"other"},{...payload,state:"pending"},{...payload,commandId:"invalid"},
      {...payload,password:""},{...payload,password:"x".repeat(3000)},{...payload,expectedApprovedAt:42}])
      expect((await POST(request(b),params)).status).toBe(400);
    expect((await POST(new Request(url,{method:"POST",body:"{"}),params)).status).toBe(400);
    expect(m.step).not.toHaveBeenCalled();expect(m.approve).not.toHaveBeenCalled();
  });
  it("requires corporate authority and password verification and sanitizes failures",async()=>{
    m.authority.mockImplementationOnce(()=>{throw Error("foreign");});expect((await POST(request(payload),params)).status).toBe(403);
    expect(m.step).not.toHaveBeenCalled();
    m.step.mockRejectedValueOnce(Error("private-auth-detail"));const response=await POST(request(payload),params);
    expect(response.status).toBe(403);expect(await response.text()).not.toContain("private-auth-detail");
    expect(m.approve).not.toHaveBeenCalled();
  });
  it("passes the original CAS value and trusted proof to the transactional service, without dispatch",async()=>{
    const response=await POST(request(payload),params);expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");expect(await response.json()).toMatchObject({dispatched:false});
    expect(m.approve).toHaveBeenCalledWith(expect.objectContaining({tenantId:"corporate",userId:"owner"}),
      expect.objectContaining({userId:"owner"}),{productId,commandId,expectedApprovedAt:null});
    expect(JSON.stringify(m.approve.mock.calls)).not.toContain(payload.password);
    m.approve.mockRejectedValueOnce(Error("secret-db-detail"));const denied=await POST(request(payload),params);
    expect(denied.status).toBe(403);expect(await denied.text()).not.toContain("secret-db-detail");
  });
  it("requires accessible product before listing, caps output, and does not reapprove on GET",async()=>{
    m.limit.mockResolvedValueOnce([]);expect((await GET(new Request(url),params)).status).toBe(403);
    m.limit.mockResolvedValueOnce([{id:productId}]).mockResolvedValueOnce(Array.from({length:51},(_,n)=>({id:String(n)})));
    const response=await GET(new Request(url),params);expect(response.status).toBe(200);
    const body=await response.json();expect(body.items).toHaveLength(50);expect(body.truncated).toBe(true);
    expect(m.step).not.toHaveBeenCalled();expect(m.approve).not.toHaveBeenCalled();
  });
  it("routes reactivation separately with exact action and trusted human approval",async()=>{
    const reactivation={...payload,action:"REACTIVATE_VERIFIED"};
    const response=await POST(request(reactivation),params);
    expect(response.status).toBe(200);
    expect((await response.json()).dispatched).toBe(false);
    expect(m.reactivate).toHaveBeenCalledWith(expect.objectContaining({tenantId:"corporate"}),
      expect.objectContaining({userId:"owner"}),{productId,commandId,expectedApprovedAt:null});
    expect(m.approve).not.toHaveBeenCalled();
    expect((await POST(request({...reactivation,action:"UNAUTHORIZED"}),params)).status).toBe(400);
    expect((await POST(request({...reactivation,dispatched:true}),params)).status).toBe(400);
  });
  it("rejects unrecognized or duplicated GET actions before reading data",async()=>{
    for(const suffix of ["?action=UNKNOWN","?action=REACTIVATE_VERIFIED&action=SUSPEND_DELINQUENCY","?tenantId=foreign"])
      expect((await GET(new Request(url+suffix),params)).status).toBe(400);
    expect(m.limit).not.toHaveBeenCalled();
    m.limit.mockResolvedValueOnce([{id:productId}]).mockResolvedValueOnce([]);
    expect((await GET(new Request(url+"?action=REACTIVATE_VERIFIED"),params)).status).toBe(200);
  });

});
