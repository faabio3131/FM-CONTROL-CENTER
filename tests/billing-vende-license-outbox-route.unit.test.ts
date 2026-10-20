import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: vi.fn(), stepUp: vi.fn(), audit: vi.fn(),
  list: vi.fn(), reconcile: vi.fn(), config: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("../src/application/security/resolve-tenant-context", () => ({
  resolveTenantContext: mocks.context,
}));
vi.mock("../src/application/security/password-step-up", () => ({
  verifyPasswordStepUp: mocks.stepUp,
  StepUpRequiredError: class extends Error {},
}));
vi.mock("../src/application/audit/record-audit-event", () => ({
  recordAuditEvent: mocks.audit,
}));
vi.mock("../src/application/billing/assistant-paid-license-outbox", () => ({
  reconcileBlockedVendePaidLicense: mocks.reconcile,
}));
vi.mock("../src/application/billing/assistant-plan-outbox-dispatcher", () => ({
  planProjectionConfigFromEnvironment: mocks.config,
}));
vi.mock("../src/infrastructure/db/client", () => ({
  db: { select: () => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({limit: mocks.list}),
      }),
    }),
  }) },
}));

import { GET, POST } from "../src/app/api/billing/vende-license-outbox/route";

const ID = "11111111-2222-4333-8444-555555555555";
const config = {
  assistantOrigin: "https://assistant.example.test",
  keyId: "ci-command-key",
  signingKey: "a-synthetic-test-only-secret-that-is-over-32-characters",
  organizationId: "fm-company",
};
function post(body: unknown) {
  return new Request("http://localhost/api/billing/vende-license-outbox", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID = "fm-company";
  mocks.context.mockResolvedValue({
    tenantId:"fm-company", userId:"fm-operator", role:"admin",
    correlationId:"test-vende-outbox",
  });
  mocks.stepUp.mockResolvedValue({userId:"fm-operator",verifiedAt:new Date()});
  mocks.audit.mockResolvedValue(undefined);
  mocks.config.mockReturnValue(config);
  mocks.reconcile.mockResolvedValue("still_blocked");
  mocks.list.mockResolvedValue([{
    outboxId:ID, invoiceId:ID, externalTenantId:"customer-vende-1",
    planCode:"premium",planRevision:1,state:"blocked",attempts:1,
    createdAt:new Date(),claimedAt:new Date(),
  }]);
});

describe("FM-only governed Vende paid-license recovery route", () => {
  it("rejects noncorporate tenant administrators before any DB access", async () => {
    mocks.context.mockResolvedValue({
      tenantId:"customer-org",userId:"operator",role:"admin",correlationId:"negative",
    });
    expect((await GET()).status).toBe(403);
    expect((await POST(post({action:"reconcile",outboxId:ID,password:"example"}))).status)
      .toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("lists bounded corporate outbox status without credentials or mutation", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({state:"blocked",outboxId:ID,attempts:1});
    expect(mocks.list).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({action:"billing.vende_license.outbox_viewed"}));
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("rejects forged scope, invalid UUID, unknown actions and missing password", async () => {
    for (const body of [
      {action:"reconcile",outboxId:ID,password:"example",tenantId:"other"},
      {action:"reconcile",outboxId:"not-an-id",password:"example"},
      {action:"retry",outboxId:ID,password:"example"},
      {action:"reconcile",outboxId:ID,password:" "},
    ]) expect((await POST(post(body))).status).toBe(400);
    expect(mocks.stepUp).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("denies a wrong-account step-up without auditing a permitted intent", async () => {
    mocks.stepUp.mockResolvedValue({userId:"another-admin",verifiedAt:new Date()});
    const response = await POST(post({action:"reconcile",outboxId:ID,password:"example"}));
    expect(response.status).toBe(403);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("fails closed if the durable corporate pre-audit cannot be written", async () => {
    mocks.audit.mockRejectedValueOnce(new Error("secret-db-error"));
    const response = await POST(post({action:"reconcile",outboxId:ID,password:"example"}));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret-db-error");
    expect(mocks.config).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("preserves blocked state when Assistant cannot prove prior delivery", async () => {
    const response = await POST(post({action:"reconcile",outboxId:ID,password:"example"}));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({outboxId:ID,status:"still_blocked"});
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith(ID,config);
    expect(mocks.audit.mock.calls.map(call=>call[1].action)).toEqual([
      "billing.vende_license.reconciliation_requested",
      "billing.vende_license.reconciliation_checked",
    ]);
  });

  it("acknowledges only proven preexisting delivery; no fresh bind dispatch", async () => {
    mocks.reconcile.mockResolvedValue("delivered");
    const response = await POST(post({action:"reconcile",outboxId:ID,password:"example"}));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({outboxId:ID,status:"delivered"});
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith(ID,config);
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({
        action:"billing.vende_license.reconciliation_checked",
        metadata:{outboxId:ID,status:"delivered"},
      }));
  });

  it("sanitizes transport failure without automatic retries", async () => {
    mocks.reconcile.mockRejectedValue(new Error("sensitive-provider-transport"));
    const response = await POST(post({action:"reconcile",outboxId:ID,password:"example"}));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("sensitive-provider-transport");
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
  });
});
