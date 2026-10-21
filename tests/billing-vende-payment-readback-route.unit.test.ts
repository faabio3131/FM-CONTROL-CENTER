import { beforeEach,describe,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),authority:vi.fn(),step:vi.fn(),audit:vi.fn(),inspect:vi.fn(),bind:vi.fn(),observe:vi.fn(),quarantine:vi.fn()}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",()=>({resolveTenantContext:m.session}));
vi.mock("../src/application/billing/assistant-plan-catalog-service",()=>({requireFMPlanAuthority:m.authority}));
vi.mock("../src/application/security/password-step-up",()=>({verifyPasswordStepUp:m.step}));
vi.mock("../src/application/audit/record-audit-event",()=>({recordAuditEvent:m.audit}));
vi.mock("../src/application/billing/vende-payment-readback-service",()=>({VendePaymentReadbackService:class{inspect=m.inspect;bindPayer=m.bind;observe=m.observe;quarantine=m.quarantine;}}));
import { GET,POST } from "../src/app/api/billing/products/[productId]/payment-readback/route";
const productId="11111111-1111-4111-8111-111111111111",invoiceId="22222222-2222-4222-8222-222222222222";
const observationId="33333333-3333-4333-8333-333333333333";
const params={params:Promise.resolve({productId})};
const url=`http://localhost/api/billing/products/${productId}/payment-readback`;
const payload={action:"bind",invoiceId,password:"synthetic-password",providerCustomerRef:"cus_reviewed",sourceRef:"fm-reviewed"};
const request=(body:unknown)=>new Request(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{
  vi.resetAllMocks();delete process.env.FM_COMMAND_VENDE_PAYMENT_READBACK_ENABLED;
  m.session.mockResolvedValue({tenantId:"corporate",userId:"owner",role:"owner",correlationId:"test"});
  m.step.mockResolvedValue({userId:"owner",verifiedAt:new Date()});
  m.bind.mockResolvedValue({bindingId:invoiceId});m.observe.mockResolvedValue({state:"recorded",replayed:true});
  m.quarantine.mockResolvedValue({quarantined:1});m.inspect.mockResolvedValue({invoiceId,attempts:[],readbackEnabled:false});
});
describe("Vende readback corporate ingress",()=>{
  it("rejects untrusted authority, outcome, configuration and malformed input before step-up",async()=>{
    for(const extra of [{tenantId:"other"},{actor:"other"},{outcome:"settled_verified"},{secretRef:"env://bad"},
      {enabled:true},{providerUrl:"https://attacker.invalid"},{invoiceId:"invalid"},{password:""},{providerCustomerRef:"customer"}])
      expect((await POST(request({...payload,...extra}),params)).status).toBe(400);
    for(const body of [null,[],{...payload,sourceRef:"x".repeat(5000)},{...payload,action:"unknown"}])
      expect((await POST(request(body),params)).status).toBe(400);
    expect((await POST(new Request(url,{method:"POST",body:"{"}),params)).status).toBe(400);
    expect(m.step).not.toHaveBeenCalled();expect(m.bind).not.toHaveBeenCalled();
  });
  it("requires session, corporate role, same actor and successful pre-audit",async()=>{
    m.session.mockRejectedValueOnce(Error("secret-session"));expect((await POST(request(payload),params)).status).toBe(403);
    m.authority.mockImplementationOnce(()=>{throw Error("foreign-tenant");});expect((await POST(request(payload),params)).status).toBe(403);
    m.step.mockResolvedValueOnce({userId:"other",verifiedAt:new Date()});expect((await POST(request(payload),params)).status).toBe(403);
    m.audit.mockRejectedValueOnce(Error("secret-audit"));const denied=await POST(request(payload),params);
    expect(denied.status).toBe(403);expect(await denied.text()).not.toContain("secret-audit");expect(m.bind).not.toHaveBeenCalled();
  });
  it("binds with server-derived context after pre-audit and never records the password",async()=>{
    const r=await POST(request(payload),params);expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");expect(await r.json()).toMatchObject({financialStateChanged:false});
    expect(m.audit.mock.invocationCallOrder[0]).toBeLessThan(m.bind.mock.invocationCallOrder[0]);
    expect(m.bind).toHaveBeenCalledWith(expect.objectContaining({tenantId:"corporate",userId:"owner"}),expect.objectContaining({userId:"owner"}),{productId,invoiceId,providerCustomerRef:"cus_reviewed",sourceRef:"fm-reviewed"});
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain(payload.password);
  });
  it("blocks external reads by default, then preserves explicit observation ID without retry",async()=>{
    const body={action:"observe",invoiceId,password:payload.password,observationId};
    expect((await POST(request(body),params)).status).toBe(403);expect(m.step).not.toHaveBeenCalled();expect(m.observe).not.toHaveBeenCalled();
    process.env.FM_COMMAND_VENDE_PAYMENT_READBACK_ENABLED="true";
    try{
      expect((await POST(request(body),params)).status).toBe(200);
      expect(m.observe).toHaveBeenCalledWith(expect.anything(),expect.anything(),{productId,invoiceId,observationId});
      m.observe.mockRejectedValueOnce(Error("secret-provider-error"));const r=await POST(request(body),params);
      expect(r.status).toBe(403);expect(await r.text()).not.toContain("secret-provider-error");expect(m.observe).toHaveBeenCalledTimes(2);
    }finally{delete process.env.FM_COMMAND_VENDE_PAYMENT_READBACK_ENABLED;}
  });
  it("permits governed local quarantine with external flag off",async()=>{
    expect((await POST(request({action:"quarantine",invoiceId,password:payload.password}),params)).status).toBe(200);
    expect(m.quarantine).toHaveBeenCalledOnce();expect(m.observe).not.toHaveBeenCalled();
  });
  it("scopes reads and rejects duplicate or foreign query fields",async()=>{
    for(const query of [`invoiceId=${invoiceId}&tenantId=foreign`,`invoiceId=${invoiceId}&invoiceId=${invoiceId}`,"invoiceId=bad"])
      expect((await GET(new Request(url+"?"+query),params)).status).toBe(400);
    expect(m.inspect).not.toHaveBeenCalled();
    expect((await GET(new Request(url+"?invoiceId="+invoiceId),params)).status).toBe(200);
    expect(m.inspect).toHaveBeenCalledWith(expect.objectContaining({tenantId:"corporate"}),{productId,invoiceId});
    m.authority.mockImplementationOnce(()=>{throw Error("denied");});expect((await GET(new Request(url+"?invoiceId="+invoiceId),params)).status).toBe(403);
    expect(m.inspect).toHaveBeenCalledOnce();expect(m.audit).not.toHaveBeenCalled();expect(m.observe).not.toHaveBeenCalled();
  });
});
