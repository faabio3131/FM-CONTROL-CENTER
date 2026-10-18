import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  commandBridgeConfigFromEnvironment,
  CoreBridgeGovernanceError,
  parseCommandBridgeTarget,
  sendGovernedCommandBridgeAction,
  signCommandBridgeRequest,
} from "@/application/integration/fm-core-bridge-governance";

const SIGNING_KEY = "synthetic-command-control-hmac-key-000001";
const target = {
  action: "revoke_grant" as const,
  tenantId: "tenant-a",
  unitId: "unit-a",
  capability: "ai.text",
};
const config = {
  assistantOrigin: "https://assistant.example",
  commandKeyId: "command-key-1",
  commandSigningKey: SIGNING_KEY,
  targetCoreKeyId: "core-key-1",
};
const NOW = new Date("2026-10-18T15:00:00Z");
const authority = {
  actorUserId: "platform-owner-1",
  organizationId: "fm-platform-org",
  stepUpAt: NOW,
};

describe("Command → Assistant service identity governance contract", () => {
  it("validates exact action and scope rather than accepting forged actor", () => {
    expect(parseCommandBridgeTarget({ ...target, actorUserId: "malicious" })).toEqual(target);
    expect(parseCommandBridgeTarget({ ...target, tenantId: "../tenant-b" })).toBeNull();
    expect(parseCommandBridgeTarget({ ...target, action: "reactivate" })).toBeNull();
    expect(parseCommandBridgeTarget({ ...target, capability: "" })).toBeNull();
  });

  it("binds HMAC to method/path/key/timestamp/nonce and exact body bytes", () => {
    const body = Buffer.from('{"action":"revoke_grant"}', "utf8");
    const expectedMessage = [
      "POST", "/internal/v1/command/core-bridge/manage", "command-key-1",
      "1792335600", "nonce-123456789012345678901234",
      createHash("sha256").update(body).digest("hex"),
    ].join("\n");
    const expected = createHmac("sha256", SIGNING_KEY)
      .update(expectedMessage, "ascii").digest("hex");
    expect(signCommandBridgeRequest(
      SIGNING_KEY, "command-key-1",
      "1792335600", "nonce-123456789012345678901234", body,
    )).toBe(expected);
  });

  it("sends only signed scope + human identity, never password or signing key", async () => {
    const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        "https://assistant.example/internal/v1/command/core-bridge/manage",
      );
      expect(init?.redirect).toBe("manual");
      const raw = String(init?.body);
      expect(raw).not.toContain(SIGNING_KEY);
      expect(raw).not.toContain("password");
      const payload = JSON.parse(raw) as Record<string, unknown>;
      expect(payload.tenant_id).toBe("tenant-a");
      expect(payload.unit_id).toBe("unit-a");
      expect(payload.actor_user_id).toBe("platform-owner-1");
      expect(payload.organization_id).toBe("fm-platform-org");
      expect(payload.target_key_id).toBe("core-key-1");
      const headers = new Headers(init?.headers);
      expect(headers.get("X-FM-Command-Signature")).toBe(
        signCommandBridgeRequest(
          SIGNING_KEY, "command-key-1",
          headers.get("X-FM-Command-Timestamp") ?? "",
          headers.get("X-FM-Command-Nonce") ?? "",
          Buffer.from(raw),
        ),
      );
      return new Response(JSON.stringify({ status: "revoked" }), { status: 200 });
    });
    const outcome = await sendGovernedCommandBridgeAction(target, authority, config, {
      now: NOW, http: spy as typeof fetch,
    });
    expect(outcome).toBe("revoked");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("never retries or trusts redirects and errors containing secrets", async () => {
    const spy = vi.fn(async () => new Response(
      JSON.stringify({ secret: "never-disclose-this" }), { status: 503 },
    ));
    await expect(sendGovernedCommandBridgeAction(
      target, authority, config, { now: NOW, http: spy as typeof fetch },
    )).rejects.toThrow("fm_core.bridge_governance_unavailable");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("denies expired human step-up before any network activity", async () => {
    const spy = vi.fn();
    await expect(sendGovernedCommandBridgeAction(
      target,
      { ...authority, stepUpAt: new Date("2026-10-18T14:40:00Z") },
      config, { now: NOW, http: spy as typeof fetch },
    )).rejects.toBeInstanceOf(CoreBridgeGovernanceError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses partial, HTTP or credential-bearing target origin", () => {
    for (const url of [
      "", "http://assistant.example", "https://user:password@assistant.example",
      "https://assistant.example/admin", "https://assistant.example/?apiKey=1",
    ]) {
      expect(() => commandBridgeConfigFromEnvironment({
        FM_COMMAND_CORE_BRIDGE_ASSISTANT_URL: url,
        FM_COMMAND_CORE_BRIDGE_CONTROL_KEY_ID: "command-key-1",
        FM_COMMAND_CORE_BRIDGE_CONTROL_SIGNING_KEY: SIGNING_KEY,
        FM_COMMAND_CORE_BRIDGE_TARGET_KEY_ID: "core-key-1",
      } as NodeJS.ProcessEnv)).toThrow(CoreBridgeGovernanceError);
    }
    expect(commandBridgeConfigFromEnvironment({
      FM_COMMAND_CORE_BRIDGE_ASSISTANT_URL: "https://assistant.example",
      FM_COMMAND_CORE_BRIDGE_CONTROL_KEY_ID: "command-key-1",
      FM_COMMAND_CORE_BRIDGE_CONTROL_SIGNING_KEY: SIGNING_KEY,
      FM_COMMAND_CORE_BRIDGE_TARGET_KEY_ID: "core-key-1",
    } as NodeJS.ProcessEnv).assistantOrigin).toBe("https://assistant.example");
  });
});
