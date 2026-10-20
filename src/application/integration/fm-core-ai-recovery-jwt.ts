/** Command corporate platform-admin → Core governed AI usage recovery.
 *
 * Pure signing primitive, NOT an authorization source. Caller MUST verify the
 * Command human session, corporate membership, RBAC and fresh reauthentication
 * before constructing the actor. No public route is enabled here.
 */
import { createPrivateKey, randomUUID, sign } from "node:crypto";

export const CORE_AI_RECOVERY_PATH = "/internal/v1/command/ai/usage/reconcile";

export class CoreAIRecoveryAuthorityDenied extends Error {
  constructor() { super("fm_command.core_ai_recovery_denied"); }
}

export interface CoreAIRecoveryActor {
  userId: string;
  sessionId: string;
  organizationId: string;
  role: "platform_admin";
  approved: true;
  stepUpAt: Date;
}

export interface CoreAIRecoveryJWTConfig {
  privateKeyPem: string;
  issuer: string;
  audience: string;
  corporateOrganizationId: string;
}

const validId = /^[A-Za-z0-9_.-]{1,128}$/;

function b64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function signCoreAIRecoveryAuthorization(
  actor: CoreAIRecoveryActor,
  config: CoreAIRecoveryJWTConfig,
  options: { now?: Date; tokenId?: string } = {},
): string {
  const now = options.now ?? new Date();
  const time = Math.floor(now.getTime() / 1000);
  const stepUp = Math.floor(actor.stepUpAt.getTime() / 1000);
  const tokenId = options.tokenId ?? randomUUID();
  if (
    !Number.isSafeInteger(time) || !Number.isSafeInteger(stepUp) ||
    stepUp > time + 15 || time - stepUp > 300 ||
    actor.role !== "platform_admin" || actor.approved !== true ||
    !validId.test(actor.userId) || !validId.test(actor.sessionId) ||
    !validId.test(actor.organizationId) ||
    actor.organizationId !== config.corporateOrganizationId ||
    !validId.test(config.issuer) || !validId.test(config.audience) ||
    !validId.test(tokenId) || tokenId.length < 16 ||
    !config.privateKeyPem.startsWith("-----BEGIN PRIVATE KEY-----")
  ) {
    throw new CoreAIRecoveryAuthorityDenied();
  }
  try {
    const claims = {
      iss: config.issuer,
      aud: config.audience,
      sub: actor.userId,
      jti: tokenId,
      iat: time,
      nbf: time,
      exp: time + 120,
      session_id: actor.sessionId,
      step_up_at: stepUp,
      actor_type: "human",
      role: "platform_admin",
      scope: "fm_core_platform",
      permissions: ["core.ai.admin.mutate"],
    };
    const input = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))
      + "." + b64(JSON.stringify(claims));
    const signature = sign("RSA-SHA256", Buffer.from(input, "ascii"), {
      key: createPrivateKey(config.privateKeyPem),
      padding: 6, // RSA_PKCS1_PADDING — JWT RS256
    }).toString("base64url");
    return input + "." + signature;
  } catch {
    throw new CoreAIRecoveryAuthorityDenied();
  }
}
