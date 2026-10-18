import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  stepUp: vi.fn(),
  audit: vi.fn(),
  send: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));
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
vi.mock("../src/application/integration/fm-core-bridge-governance", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("../src/application/integration/fm-core-bridge-governance")
  >();
  return {
    ...original,
    sendGovernedCommandBridgeAction: mocks.send,
  };
});

import { POST } from "../src/app/api/integrations/fm-core/bridge/identities/route";

const payload = {
  action: "grant",
  tenantId: "tenant-a",
  unitId: "unit-a",
  capability: "ai.text",
  password: "only-test-password",
};

const request = (body: object) => new Request(
  "http://localhost/api/integrations/fm-core/bridge/identities",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  },
);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID = "fm-company";
  process.env.FM_COMMAND_CORE_BRIDGE_ASSISTANT_URL = "https://assistant.example";
  process.env.FM_COMMAND_CORE_BRIDGE_CONTROL_KEY_ID = "command-key-1";
  process.env.FM_COMMAND_CORE_BRIDGE_CONTROL_SIGNING_KEY =
    "synthetic-command-control-hmac-key-000001";
  process.env.FM_COMMAND_CORE_BRIDGE_TARGET_KEY_ID = "core-key-1";
  mocks.context.mockResolvedValue({
    tenantId: "fm-company",
    userId: "owner-1",
    role: "owner",
    correlationId: "test-correlation",
  });
  mocks.stepUp.mockResolvedValue({
    userId: "owner-1",
    verifiedAt: new Date(),
  });
  mocks.audit.mockResolvedValue(undefined);
  mocks.send.mockResolvedValue("granted");
});

describe("Command corporate bridge administration authorization", () => {
  it("denies an admin of another tenant even if password is valid", async () => {
    mocks.context.mockResolvedValue({
      tenantId: "client-tenant", userId: "owner-1", role: "admin",
      correlationId: "test-correlation",
    });
    const response = await POST(request(payload));
    expect(response.status).toBe(403);
    expect(mocks.stepUp).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("denies analyst and member roles in the FM corporate tenant", async () => {
    for (const role of ["analyst", "member", "viewer"]) {
      mocks.context.mockResolvedValue({
        tenantId: "fm-company", userId: "member-1", role,
        correlationId: "test-correlation",
      });
      const response = await POST(request(payload));
      expect(response.status).toBe(403);
    }
    expect(mocks.stepUp).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("requires matching reauthenticated human identity", async () => {
    mocks.stepUp.mockResolvedValue({
      userId: "attacker-user", verifiedAt: new Date(),
    });
    expect((await POST(request(payload))).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("never trusts a caller-supplied actor or target core key", async () => {
    const response = await POST(request({
      ...payload,
      actorUserId: "spoofed-actor",
      organizationId: "spoofed-org",
      targetCoreKeyId: "spoofed-target",
    }));
    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledOnce();
    const [target, authority, config] = mocks.send.mock.calls[0];
    expect(target).toEqual({
      action: "grant", tenantId: "tenant-a",
      unitId: "unit-a", capability: "ai.text",
    });
    expect(authority.actorUserId).toBe("owner-1");
    expect(authority.organizationId).toBe("fm-company");
    expect(config.targetCoreKeyId).toBe("core-key-1");
    expect(mocks.audit).toHaveBeenCalledOnce();
  });

  it("fails closed if the corporate tenant is not configured", async () => {
    delete process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID;
    expect((await POST(request(payload))).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not send an invalid action or path-like scope", async () => {
    for (const input of [
      { ...payload, action: "rotate_secret" },
      { ...payload, tenantId: "../../other" },
      { ...payload, password: "" },
    ]) {
      expect((await POST(request(input))).status).toBe(400);
    }
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("returns a sanitized error when downstream rejects or times out", async () => {
    mocks.send.mockRejectedValue(new Error("sensitive-platform-hmac"));
    const response = await POST(request(payload));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("sensitive-platform-hmac");
    expect(mocks.audit).toHaveBeenCalledOnce();
  });
});
