import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  CoreAIRecoveryAuthorityDenied,
  CORE_AI_RECOVERY_PATH,
  signCoreAIRecoveryAuthorization,
  sendGovernedCoreAIRecovery,
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

  it("dispatches one signed opaque recovery to exact HTTPS Core endpoint", async () => {
    let observed = 0;
    await sendGovernedCoreAIRecovery(
      {
        requestId: "request-1", tenantId: "tenant-1", unitId: "unit-1",
        evidenceId: "evidence-1", requestsRevision: 3, tokensRevision: 3,
      }, actor, { ...cfg, coreOrigin: "https://core.example.test" },
      {
        now,
        http: (async (url, init) => {
          observed++;
          expect(String(url)).toBe(
            "https://core.example.test/internal/v1/command/ai/usage/reconcile",
          );
          expect(init?.method).toBe("POST");
          expect(init?.redirect).toBe("manual");
          const headers = new Headers(init?.headers);
          expect(headers.get("Authorization")?.startsWith("Bearer ")).toBe(true);
          expect(JSON.parse(String(init?.body))).toEqual({
            request_id: "request-1", tenant_id: "tenant-1",
            unit_id: "unit-1", evidence_id: "evidence-1",
            requests_revision: 3, tokens_revision: 3,
          });
          return new Response(null, { status: 204 });
        }) as typeof fetch,
      },
    );
    expect(observed).toBe(1);
  });

  it("never retries after unknown Core status or trusts an insecure endpoint", async () => {
    let attempts = 0;
    const intent = {
      requestId: "request-2", tenantId: "tenant-1", unitId: "unit-1",
      evidenceId: "evidence-2", requestsRevision: 2, tokensRevision: 2,
    };
    await expect(sendGovernedCoreAIRecovery(
      intent, actor, { ...cfg, coreOrigin: "https://core.example.test" },
      { now, http: (async () => {
        attempts++;
        return new Response("unavailable", { status: 503 });
      }) as typeof fetch },
    )).rejects.toThrow(CoreAIRecoveryAuthorityDenied);
    expect(attempts).toBe(1);
    await expect(sendGovernedCoreAIRecovery(
      intent, actor, { ...cfg, coreOrigin: "http://insecure.example.test" },
      { now, http: (async () => { attempts++; return new Response(); }) as typeof fetch },
    )).rejects.toThrow(CoreAIRecoveryAuthorityDenied);
    expect(attempts).toBe(1);
  });
});
