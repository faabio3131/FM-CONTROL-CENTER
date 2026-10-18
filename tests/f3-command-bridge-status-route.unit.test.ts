import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  stepUp: vi.fn(),
  audit: vi.fn(),
  lookup: vi.fn(),
  query: vi.fn(),
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
vi.mock("../src/application/integration/fm-core-bridge-reconciliation", () => ({
  lookupCommandBridgeOutcome: mocks.lookup,
}));
vi.mock("../src/infrastructure/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: mocks.query }),
      }),
    }),
  },
}));

import { POST } from "../src/app/api/integrations/fm-core/bridge/identities/status/route";

const ID = "a1b2c3d4-1234-4abc-8def-123456789012";
const intent = {
  action: "fm_core.bridge.grant.requested",
  actorId: "fm-admin-1",
  resourceId: "core-key-1",
  metadata: {
    commandRequestId: ID,
    tenantId: "tenant-a",
    unitId: "unit-a",
    capability: "ai.text",
  },
};
const request = (body: object) => new Request(
  "http://localhost/api/integrations/fm-core/bridge/identities/status",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    tenantId: "fm-company", userId: "fm-admin-1", role: "owner",
    correlationId: "test-reconciliation",
  });
  mocks.stepUp.mockResolvedValue({
    userId: "fm-admin-1", verifiedAt: new Date(),
  });
  mocks.audit.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue([intent]);
  mocks.lookup.mockResolvedValue({ status: "applied", outcome: "granted" });
});

describe("Command reconciles only its own preaudited signed mutations", () => {
  it("denies a client tenant admin before DB or network", async () => {
    mocks.context.mockResolvedValue({
      tenantId: "customer-company", userId: "fm-admin-1", role: "admin",
      correlationId: "test-reconciliation",
    });
    expect((await POST(request({ commandRequestId: ID, password: "synthetic" }))).status)
      .toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("denies mismatched step-up identity", async () => {
    mocks.stepUp.mockResolvedValue({ userId: "another-user", verifiedAt: new Date() });
    expect((await POST(request({ commandRequestId: ID, password: "synthetic" }))).status)
      .toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("does not query Assistant when no matching corporate audit intent exists", async () => {
    mocks.query.mockResolvedValue([]);
    expect((await POST(request({ commandRequestId: ID, password: "synthetic" }))).status)
      .toBe(404);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("rejects malformed metadata or forged target identity in an audit row", async () => {
    for (const row of [
      { ...intent, action: "fm_core.bridge.status_checked" },
      { ...intent, resourceId: "another-core" },
      { ...intent, metadata: { ...intent.metadata, tenantId: "../../escape" } },
    ]) {
      mocks.query.mockResolvedValue([row]);
      expect((await POST(request({ commandRequestId: ID, password: "synthetic" }))).status)
        .toBe(404);
    }
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("uses only persisted scope, author and ID, never caller-supplied targets", async () => {
    const response = await POST(request({
      commandRequestId: ID,
      password: "synthetic",
      tenantId: "attacker-tenant",
      targetCoreKeyId: "spoofed",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      commandRequestId: ID, status: "applied", outcome: "granted",
    });
    expect(mocks.lookup).toHaveBeenCalledOnce();
    const [target, authority, id, config] = mocks.lookup.mock.calls[0];
    expect(target).toEqual({
      action: "grant", tenantId: "tenant-a", unitId: "unit-a", capability: "ai.text",
    });
    expect(authority.actorUserId).toBe("fm-admin-1");
    expect(authority.organizationId).toBe("fm-company");
    expect(id).toBe(ID);
    expect(config.targetCoreKeyId).toBe("core-key-1");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "fm_core.bridge.status_checked", result: "success",
        metadata: { commandRequestId: ID, status: "applied" },
      }),
    );
  });

  it("never converts unknown to permission to repeat a mutation", async () => {
    mocks.lookup.mockResolvedValue({ status: "unknown", outcome: null });
    const response = await POST(request({ commandRequestId: ID, password: "synthetic" }));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("unknown");
  });

  it("sanitizes downstream failure and never invokes mutation sender", async () => {
    mocks.lookup.mockRejectedValue(new Error("test-hidden-hmac"));
    const response = await POST(request({ commandRequestId: ID, password: "synthetic" }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("test-hidden-hmac");
  });
});
