import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(()=>({
  session:vi.fn(),authorize:vi.fn(),
}));
vi.mock("next/headers",()=>({
  headers:vi.fn(async()=>new Headers()),
}));
vi.mock("../src/application/security/resolve-tenant-context",()=>({
  resolveTenantContext:mocks.session,
}));
vi.mock("../src/domain/security/tenant-context",()=>({
  requirePermission:mocks.authorize,
}));

import { GET } from "../src/app/api/billing/vende-commercial-policy/route";

beforeEach(()=>{
  vi.clearAllMocks();
  process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID="fm-corporate";
  mocks.session.mockResolvedValue({
    tenantId:"fm-corporate",role:"owner",userId:"fm-owner",
  });
});

describe("C06 FM-only approved Vende policy read surface",()=>{
  it("returns exact version, controlled business days and never grants lifecycle execution",async()=>{
    const response=await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const payload=await response.json();
    expect(payload.policy.version).toBe("fm.vende.commercial.v1.2026-10-20");
    expect(payload.policy.suspensionCalendarDays).toBe(5);
    expect(payload.policy.minimumCompletedBusinessDays).toBe(3);
    expect(payload.policy.returnAfterFinalCancellation)
      .toBe("new_customer_tenant_subscription_ids");
    expect(payload.lifecycleExecutorEnabled).toBe(false);
    expect(payload.externalSettlementHomologated).toBe(false);
    expect(payload.gracePeriodRequiresVerifiedCalendar).toBe(true);
    expect(mocks.authorize).toHaveBeenCalledOnce();
    expect(mocks.authorize).toHaveBeenCalledWith(
      expect.objectContaining({tenantId:"fm-corporate"}),"billing:read",
    );
  });
  it("blocks other tenants, staff roles, missing corporate scope, and insufficient permissions",async()=>{
    for(const who of [
      {tenantId:"outside",role:"owner"},
      {tenantId:"fm-corporate",role:"manager"},
      {tenantId:"fm-corporate",role:"staff"},
    ]) {
      mocks.session.mockResolvedValueOnce({...who,userId:"actor"});
      expect((await GET()).status).toBe(403);
    }
    delete process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID;
    expect((await GET()).status).toBe(403);
    process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID="fm-corporate";
    mocks.authorize.mockImplementationOnce(()=>{throw new Error("denied");});
    expect((await GET()).status).toBe(403);
  });
  it("fails closed on missing authentication without leaking session details",async()=>{
    mocks.session.mockRejectedValueOnce(new Error("sensitive session failure"));
    const response=await GET();
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain("sensitive");
  });
});
