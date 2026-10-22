import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),read:vi.fn(),config:vi.fn()}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("../src/application/security/resolve-tenant-context",
  ()=>({resolveTenantContext:m.session}));
vi.mock("../src/application/billing/assistant-plan-outbox-dispatcher",
  ()=>({planProjectionConfigFromEnvironment:m.config}));
vi.mock("../src/application/billing/vende-compensation-outcome",
  ()=>({readVendeCorrectionOutcome:m.read}));
import {GET} from "../src/app/api/billing/products/[productId]/vende-compensation-intents/[intentId]/status/route";
const productId="11111111-1111-4111-8111-111111111111";
const intentId="22222222-2222-4222-8222-222222222222";
const url="http://localhost/api/billing/products/"+productId+
  "/vende-compensation-intents/"+intentId+"/status";
const params={params:Promise.resolve({productId,intentId})};
beforeEach(()=>{
  vi.resetAllMocks();
  m.session.mockResolvedValue({tenantId:"fm",userId:"owner",role:"owner"});
  m.config.mockReturnValue({organizationId:"fm",assistantOrigin:"https://assistant.example.test/",
    signingKey:"synthetic-command-key-32-bytes-long",keyId:"fm"});
  m.read.mockResolvedValue({intentId,operationId:"p01.correction."+intentId,
    state:"queued",remoteEntitlementConfirmed:false,
    financialSettlementCurrentlyVerified:false,
    coreQuotaVerified:false,caseResolved:false});
});
describe("P01 correction status read-only HTTP",()=>{
  it("returns no-store and never assumes delivery or case closure",async()=>{
    const r=await GET(new Request(url),params);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toMatchObject({
      state:"queued",coreQuotaVerified:false,caseResolved:false,
      remoteEntitlementConfirmed:false,
    });
    expect(m.read).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm"}),{productId,intentId},
      expect.objectContaining({organizationId:"fm"}),
    );
  });
  it("refuses forged query, invalid identifiers and impossible case",async()=>{
    expect((await GET(new Request(url+"?tenantId=other"),params)).status).toBe(400);
    expect((await GET(new Request(url),{
      params:Promise.resolve({productId,intentId:"invalid"}),
    })).status).toBe(400);
    expect(m.read).not.toHaveBeenCalled();
    expect(m.session).not.toHaveBeenCalled();
  });
  it("hides S2S status and financial readback errors",async()=>{
    m.read.mockRejectedValueOnce(Error("FINANCIAL_CUSTOMER_SECRET"));
    const r=await GET(new Request(url),params);
    expect(r.status).toBe(403);
    expect(await r.text()).not.toContain("FINANCIAL_CUSTOMER_SECRET");
  });
});
