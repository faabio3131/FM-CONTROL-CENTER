/** Pure Command→Assistant signed security-hold contract.
 * NOT a financial cancellation. Must only be invoked after FM owner/admin
 * role, fresh step-up, current scoped-license read, pre-audit and opt-in.
 * This helper alone sends nothing and cannot be called by a tenant endpoint.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { PlanProjectionConfig } from "@/application/billing/assistant-plan-outbox-dispatcher";

export const ASSISTANT_LICENSE_SECURITY_HOLD_PATH =
  "/internal/v1/command/assistant-plans/security-hold";

export class LicenseSecurityHoldUnavailable extends Error {
  constructor(){super("license.security_hold_unavailable");}
}

export type LicenseSecurityHoldIntent = Readonly<{
  tenantId:string; actorUserId:string; commandRequestId:string;
  approvedAt:Date;stepUpAt:Date;planCode:string;planRevision:number;
  expectedValidUntil:Date;
}>;

const ID=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
export function signAssistantLicenseSecurityHold(
  config:PlanProjectionConfig,
  intent:LicenseSecurityHoldIntent,
  now:Date=new Date(),
) {
  const epoch=Math.floor(now.getTime()/1000);
  const approvedAt=Math.floor(intent.approvedAt.getTime()/1000);
  const stepUpAt=Math.floor(intent.stepUpAt.getTime()/1000);
  const expiry=Math.floor(intent.expectedValidUntil.getTime()/1000);
  if(
    ![intent.tenantId,intent.actorUserId,intent.commandRequestId,
      intent.planCode,config.organizationId].every(value=>ID.test(value)) ||
    intent.planCode.length>120 ||
    !ID.test(config.keyId) || config.keyId.length>64 ||
    config.signingKey.length<32 ||
    !Number.isSafeInteger(intent.planRevision) || intent.planRevision<1 ||
    ![epoch,approvedAt,stepUpAt,expiry].every(Number.isSafeInteger) ||
    approvedAt>epoch+15 || epoch-approvedAt>300 ||
    stepUpAt>epoch+15 || epoch-stepUpAt>300 ||
    expiry<=epoch
  )throw new LicenseSecurityHoldUnavailable();
  const body=JSON.stringify({
    product_code:"VENDEATENDEIA",
    organization_id:config.organizationId,
    tenant_id:intent.tenantId,
    actor_user_id:intent.actorUserId,
    command_request_id:intent.commandRequestId,
    approved_at:approvedAt,
    step_up_at:stepUpAt,
    plan_code:intent.planCode,
    plan_revision:intent.planRevision,
    expected_valid_until:expiry,
    reason:"security_hold",
  });
  const timestamp=String(epoch);
  const nonce=randomBytes(24).toString("base64url");
  const canonical=[
    "POST",ASSISTANT_LICENSE_SECURITY_HOLD_PATH,config.keyId,
    timestamp,nonce,createHash("sha256").update(body).digest("hex"),
  ].join("\n");
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
