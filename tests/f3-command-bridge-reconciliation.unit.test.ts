import { describe, expect, it, vi } from "vitest";

import {
  COMMAND_BRIDGE_PATH,
  COMMAND_BRIDGE_STATUS_PATH,
  signCommandBridgeRequest,
} from "@/application/integration/fm-core-bridge-governance";
import { lookupCommandBridgeOutcome } from "@/application/integration/fm-core-bridge-reconciliation";

const NOW = new Date("2026-10-18T15:00:00.000Z");
const AUTHORITY = {
  actorUserId: "fm-admin-1",
  organizationId: "fm-org",
  stepUpAt: NOW,
};
const CONFIG = {
  assistantOrigin: "https://assistant.example",
  commandKeyId: "command-key-1",
  commandSigningKey: "test-only-command-hmac-signing-secret-000001",
  targetCoreKeyId: "core-key-1",
};
const TARGET = {
  action: "grant" as const,
  tenantId: "customer-a",
  unitId: "unit-a",
  capability: "ai.text",
};

describe("read-only Command reconciliation protocol", () => {
  it("domain-separates status signatures and keeps UUID and scope HMAC-bound", async () => {
    const requestId = "a1b2c3d4-1234-4abc-8def-123456789012";
    const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://assistant.example" + COMMAND_BRIDGE_STATUS_PATH);
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("manual");
      expect(init?.cache).toBe("no-store");
      const raw = String(init?.body);
      const json = JSON.parse(raw) as Record<string, unknown>;
      expect(json.command_request_id).toBe(requestId);
      expect(json.tenant_id).toBe("customer-a");
      expect(json.organization_id).toBe("fm-org");
      expect(json.target_key_id).toBe("core-key-1");
      expect(raw).not.toContain(CONFIG.commandSigningKey);
      const headers = new Headers(init?.headers);
      const timestamp = headers.get("X-FM-Command-Timestamp") ?? "";
      const nonce = headers.get("X-FM-Command-Nonce") ?? "";
      const sig = headers.get("X-FM-Command-Signature") ?? "";
      expect(sig).toBe(signCommandBridgeRequest(
        CONFIG.commandSigningKey, CONFIG.commandKeyId,
        timestamp, nonce, Buffer.from(raw), COMMAND_BRIDGE_STATUS_PATH,
      ));
      expect(sig).not.toBe(signCommandBridgeRequest(
        CONFIG.commandSigningKey, CONFIG.commandKeyId,
        timestamp, nonce, Buffer.from(raw), COMMAND_BRIDGE_PATH,
      ));
      return new Response(JSON.stringify({ status: "applied", outcome: "granted" }), {
        status: 200,
      });
    });
    expect(await lookupCommandBridgeOutcome(
      TARGET, AUTHORITY, requestId, CONFIG, { http: transport as typeof fetch, now: NOW },
    )).toEqual({ status: "applied", outcome: "granted" });
    expect(transport).toHaveBeenCalledOnce();
  });

  it("keeps unknown as unknown, never interprets it as permission to retry", async () => {
    const transport = vi.fn(async () => new Response(
      JSON.stringify({ status: "unknown", outcome: null }), { status: 200 },
    ));
    const result = await lookupCommandBridgeOutcome(
      TARGET, AUTHORITY, "reconciliation-uuid-1", CONFIG,
      { http: transport as typeof fetch, now: NOW },
    );
    expect(result.status).toBe("unknown");
    expect(result.outcome).toBeNull();
    expect(transport).toHaveBeenCalledOnce();
  });

  it("rejects forged applied outcome, spoofed ID and opaque transport errors", async () => {
    const fakeResponse = vi.fn(async () => new Response(
      JSON.stringify({ status: "applied", outcome: "revoked" }), { status: 200 },
    ));
    await expect(lookupCommandBridgeOutcome(
      TARGET, AUTHORITY, "reconciliation-uuid-1", CONFIG,
      { http: fakeResponse as typeof fetch, now: NOW },
    )).rejects.toThrow("fm_core.bridge_governance_unavailable");
    const unused = vi.fn();
    await expect(lookupCommandBridgeOutcome(
      TARGET, AUTHORITY, "../forged-id", CONFIG,
      { http: unused as typeof fetch, now: NOW },
    )).rejects.toThrow("fm_core.bridge_governance_unavailable");
    expect(unused).not.toHaveBeenCalled();
    const unreachable = vi.fn(async () => { throw new Error("sensitive-real-token"); });
    await expect(lookupCommandBridgeOutcome(
      TARGET, AUTHORITY, "reconciliation-uuid-1", CONFIG,
      { http: unreachable as typeof fetch, now: NOW },
    )).rejects.toThrow("fm_core.bridge_governance_unavailable");
    expect(unreachable).toHaveBeenCalledOnce();
  });
});
