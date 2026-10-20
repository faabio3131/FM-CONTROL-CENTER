/** Pure, runtime-independent corporate license binding signer.
 * No database, webhook or provider network import is permitted in this module.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { PlanProjectionConfig } from "./assistant-plan-outbox-dispatcher";

export const ASSISTANT_PLAN_LICENSE_BIND_PATH =
  "/internal/v1/command/assistant-plans/bind";

export type GovernedLicenseBind = Readonly<{
  tenantId: string; planCode: string; planRevision: number;
  actorUserId: string; approvedAt: Date;
}>;

export class LicenseBindingSigningDenied extends Error {
  constructor() { super("plans.delivery_unavailable"); }
}

export function signAssistantPlanLicenseBind(
  config: PlanProjectionConfig, grant: GovernedLicenseBind,
  now: Date = new Date(),
) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(grant.tenantId) ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(grant.planCode) ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(grant.actorUserId) ||
      !Number.isSafeInteger(grant.planRevision) || grant.planRevision < 1 ||
      Number.isNaN(grant.approvedAt.getTime()) ||
      !Number.isFinite(now.getTime()) ||
      grant.approvedAt.getTime() > now.getTime() + 15000 ||
      now.getTime() - grant.approvedAt.getTime() > 366 * 86400 * 1000 ||
      config.signingKey.length < 32 ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(config.keyId)
  ) throw new LicenseBindingSigningDenied();
  const body=JSON.stringify({
    product_code:"VENDEATENDEIA",
    organization_id:config.organizationId,
    actor_user_id:grant.actorUserId,
    approved_at:Math.floor(grant.approvedAt.getTime()/1000),
    tenant_id:grant.tenantId,
    plan_code:grant.planCode,
    plan_revision:grant.planRevision,
  });
  const timestamp=String(Math.floor(now.getTime()/1000));
  const nonce=randomBytes(24).toString("base64url");
  const digest=createHash("sha256").update(Buffer.from(body,"utf8")).digest("hex");
  const canonical=["POST",ASSISTANT_PLAN_LICENSE_BIND_PATH,
    config.keyId,timestamp,nonce,digest].join("\n");
  const signature=createHmac("sha256",config.signingKey)
    .update(canonical,"ascii").digest("hex");
  return {body,headers:{
    "Content-Type":"application/json",
    "X-FM-Command-Key-ID":config.keyId,
    "X-FM-Command-Timestamp":timestamp,
    "X-FM-Command-Nonce":nonce,
    "X-FM-Command-Signature":signature,
  }};
}


export const ASSISTANT_PLAN_BINDING_STATUS_PATH =
  "/internal/v1/command/assistant-plans/binding-status";

/** Cryptographically authenticated read-only proof, never a resend. */
export function signAssistantPlanBindingStatus(
  config: PlanProjectionConfig,
  grant: Pick<GovernedLicenseBind, "tenantId"|"planCode"|"planRevision">,
  now: Date = new Date(),
) {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(grant.tenantId) ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(grant.planCode) ||
    !Number.isSafeInteger(grant.planRevision) || grant.planRevision < 1 ||
    !Number.isFinite(now.getTime()) ||
    config.signingKey.length < 32 ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(config.keyId)
  ) throw new LicenseBindingSigningDenied();
  const body = JSON.stringify({
    product_code: "VENDEATENDEIA",
    organization_id: config.organizationId,
    tenant_id: grant.tenantId, plan_code: grant.planCode,
    plan_revision: grant.planRevision,
  });
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const nonce = randomBytes(24).toString("base64url");
  const digest = createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex");
  const canonical = [
    "POST", ASSISTANT_PLAN_BINDING_STATUS_PATH,
    config.keyId, timestamp, nonce, digest,
  ].join("\n");
  const signature = createHmac("sha256", config.signingKey)
    .update(canonical, "ascii").digest("hex");
  return { body, headers: {
    "Content-Type": "application/json",
    "X-FM-Command-Key-ID": config.keyId,
    "X-FM-Command-Timestamp": timestamp,
    "X-FM-Command-Nonce": nonce,
    "X-FM-Command-Signature": signature,
  }};
}
