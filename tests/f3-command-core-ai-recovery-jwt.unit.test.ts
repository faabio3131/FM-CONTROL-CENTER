import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  CoreAIRecoveryAuthorityDenied,
  CORE_AI_RECOVERY_PATH,
  signCoreAIRecoveryAuthorization,
} from "@/application/integration/fm-core-ai-recovery-jwt";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const cfg = {
  privateKeyPem,
  issuer: "fm-command",
  audience: "fm-core-recovery",
  corporateOrganizationId: "fm-company",
};
const now = new Date("2026-10-19T15:00:00Z");
const actor = {
  userId: "owner-1", sessionId: "session-1",
  organizationId: "fm-company", role: "platform_admin" as const,
  approved: true as const, stepUpAt: now,
};
const fixedJti = "command-admin-jti-1234567890";

describe("Command → Core governed usage authority", () => {
  it("signs only a short-lived human scoped RS256 token", () => {
    const signed = signCoreAIRecoveryAuthorization(actor, cfg, {
      now, tokenId: fixedJti,
    });
    const [header, claims] = signed.split(".");
    const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString());
    const payload = JSON.parse(Buffer.from(claims, "base64url").toString());
    expect(parsedHeader.alg).toBe("RS256");
    expect(payload.actor_type).toBe("human");
    expect(payload.scope).toBe("fm_core_platform");
    expect(payload.permissions).toEqual(["core.ai.admin.mutate"]);
    expect(payload.exp - payload.iat).toBe(120);
    expect(payload).not.toHaveProperty("privateKeyPem");
    expect(signed).not.toContain(privateKeyPem);
    expect(CORE_AI_RECOVERY_PATH).toBe("/internal/v1/command/ai/usage/reconcile");
    expect(signed.split(".")).toHaveLength(3);
  });

  it("rejects stale step-up, wrong corporate organization and unapproved actors", () => {
    for (const changed of [
      { ...actor, organizationId: "foreign-company" },
      { ...actor, approved: false as const },
      { ...actor, stepUpAt: new Date("2026-10-19T14:45:00Z") },
    ]) {
      expect(() => signCoreAIRecoveryAuthorization(
        changed as typeof actor, cfg, { now, tokenId: fixedJti },
      )).toThrow(CoreAIRecoveryAuthorityDenied);
    }
  });
});
