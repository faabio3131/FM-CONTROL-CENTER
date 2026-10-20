/** Command corporate platform-admin → Core governed AI usage recovery.
 *
 * Pure signing primitive, NOT an authorization source. Caller MUST verify the
 * Command human session, corporate membership, RBAC and fresh reauthentication
 * before constructing the actor. No public route is enabled here.
 */
import { constants, createPrivateKey, randomUUID, sign } from "node:crypto";

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
    !config.privateKeyPem
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
      padding: constants.RSA_PKCS1_PADDING,
    }).toString("base64url");
    return input + "." + signature;
  } catch {
    throw new CoreAIRecoveryAuthorityDenied();
  }
}


export interface CoreAIRecoveryTarget {
  requestId: string;
  tenantId: string;
  unitId: string;
  evidenceId: string;
  requestsRevision: number;
  tokensRevision: number;
}

/** Send one governed Command recovery operation; never retry uncertain results. */
export async function sendGovernedCoreAIRecovery(
  target: CoreAIRecoveryTarget,
  actor: CoreAIRecoveryActor,
  config: CoreAIRecoveryJWTConfig & { coreOrigin: string },
  options: { http?: typeof fetch; now?: Date } = {},
): Promise<void> {
  let origin: URL;
  try {
    origin = new URL(config.coreOrigin);
  } catch {
    throw new CoreAIRecoveryAuthorityDenied();
  }
  if (
    origin.protocol !== "https:" || !origin.hostname ||
    origin.username || origin.password || origin.pathname !== "/" ||
    origin.search || origin.hash ||
    ![target.requestId, target.tenantId, target.unitId, target.evidenceId]
      .every((value) => validId.test(value)) ||
    !Number.isSafeInteger(target.requestsRevision) ||
    !Number.isSafeInteger(target.tokensRevision) ||
    target.requestsRevision < 1 || target.tokensRevision < 1
  ) {
    throw new CoreAIRecoveryAuthorityDenied();
  }
  const token = signCoreAIRecoveryAuthorization(actor, config, options);
  const body = JSON.stringify({
    request_id: target.requestId, tenant_id: target.tenantId,
    unit_id: target.unitId, evidence_id: target.evidenceId,
    requests_revision: target.requestsRevision,
    tokens_revision: target.tokensRevision,
  });
  try {
    const response = await (options.http ?? fetch)(
      origin.origin + CORE_AI_RECOVERY_PATH,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body, redirect: "manual", cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (response.status !== 204) throw new CoreAIRecoveryAuthorityDenied();
  } catch {
    // A timeout may mean the Core already settled. Never automatically retry.
    throw new CoreAIRecoveryAuthorityDenied();
  }
}
