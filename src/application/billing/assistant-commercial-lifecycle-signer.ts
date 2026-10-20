/** Pure FM commercial-entitlement signer. Cannot call network or modify
 * billing itself. Delinquency is cryptographically distinct from security hold.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { PlanProjectionConfig } from "./assistant-plan-outbox-dispatcher";

export const ASSISTANT_COMMERCIAL_TRANSITION_PATH =
  "/internal/v1/command/assistant-plans/commercial-transition";

export type CommercialLicenseAction =
  | "SUSPEND_DELINQUENCY" | "REACTIVATE_VERIFIED"
  | "RENEW_VERIFIED" | "APPLY_UPGRADE"
  | "APPLY_DOWNGRADE" | "CANCEL_AT_PERIOD_END";
export class CommercialTransitionSigningDenied extends Error {
  constructor(){super("vende.commercial_lifecycle_signing_denied");}
}
export interface CommercialLicenseAssertion {
  readonly tenantId:string;
  readonly actorId:string;
  readonly operationId:string;
  readonly approvedAt:Date;
  readonly action:CommercialLicenseAction;
  readonly expectedStatus:"active"|"trial"|"suspended";
  readonly expectedPlanCode:string;
  readonly expectedPlanRevision:number;
  readonly expectedValidUntil:Date;
  readonly targetPlanCode:string;
  readonly targetPlanRevision:number;
  readonly targetValidUntil:Date;
  readonly effectiveAt:Date;
  readonly verifiedPaymentRef:string;
}
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const KEY=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const PAID=new Set<CommercialLicenseAction>([
  "REACTIVATE_VERIFIED","RENEW_VERIFIED","APPLY_UPGRADE","APPLY_DOWNGRADE",
]);
const ACTIONS=new Set<CommercialLicenseAction>([
  "SUSPEND_DELINQUENCY","REACTIVATE_VERIFIED","RENEW_VERIFIED",
  "APPLY_UPGRADE","APPLY_DOWNGRADE","CANCEL_AT_PERIOD_END",
]);
const time=(date:Date)=>{
  const value=Math.floor(date.getTime()/1000);
  if(!Number.isSafeInteger(value))throw new CommercialTransitionSigningDenied();
  return value;
};
export function signAssistantCommercialTransition(
  config:PlanProjectionConfig,
  intent:CommercialLicenseAssertion,now:Date=new Date(),
){
  const timestamp=time(now),approved=time(intent.approvedAt),
    until=time(intent.expectedValidUntil),to=time(intent.targetValidUntil),
    effective=time(intent.effectiveAt);
  if(!ACTIONS.has(intent.action) ||
     ![intent.tenantId,intent.actorId,intent.operationId,intent.expectedPlanCode,
       intent.targetPlanCode,intent.verifiedPaymentRef,config.organizationId].every(x=>ID.test(x)) ||
     !KEY.test(config.keyId) || config.signingKey.length<32 ||
     intent.expectedPlanCode.length>120 || intent.targetPlanCode.length>120 ||
     !Number.isSafeInteger(intent.expectedPlanRevision)||intent.expectedPlanRevision<1 ||
     !Number.isSafeInteger(intent.targetPlanRevision)||intent.targetPlanRevision<1 ||
     approved>timestamp+15 || timestamp-approved>300 ||
     effective>timestamp+15 || until<=0 || to<=0 ||
     (PAID.has(intent.action) && (intent.verifiedPaymentRef==="none" ||
       intent.verifiedPaymentRef.length<8)) ||
     (!PAID.has(intent.action) && intent.verifiedPaymentRef!=="none")
  )throw new CommercialTransitionSigningDenied();
  const body=JSON.stringify({
    product_code:"VENDEATENDEIA",organization_id:config.organizationId,
    tenant_id:intent.tenantId,actor_user_id:intent.actorId,
    command_request_id:intent.operationId,approved_at:approved,
    action:intent.action,expected_status:intent.expectedStatus,
    expected_plan_code:intent.expectedPlanCode,
    expected_plan_revision:intent.expectedPlanRevision,
    expected_valid_until:until,
    target_plan_code:intent.targetPlanCode,
    target_plan_revision:intent.targetPlanRevision,
    target_valid_until:to,effective_at:effective,
    verified_payment_ref:intent.verifiedPaymentRef,
  });
  const nonce=randomBytes(24).toString("base64url");
  const digest=createHash("sha256").update(body).digest("hex");
  const canonical=["POST",ASSISTANT_COMMERCIAL_TRANSITION_PATH,
    config.keyId,String(timestamp),nonce,digest].join("\n");
  return {body,headers:{
    "Content-Type":"application/json",
    "X-FM-Command-Key-ID":config.keyId,
    "X-FM-Command-Timestamp":String(timestamp),
    "X-FM-Command-Nonce":nonce,
    "X-FM-Command-Signature":
      createHmac("sha256",config.signingKey).update(canonical,"ascii").digest("hex"),
  }};
}


export const ASSISTANT_COMMERCIAL_STATUS_PATH =
  "/internal/v1/command/assistant-plans/commercial-status";

/** Read only, signed fresh nonce. Must never re-issue the mutation itself. */
export function signAssistantCommercialStatus(
  config:PlanProjectionConfig,
  request:{tenantId:string;operationId:string},
  now:Date=new Date(),
){
  const timestamp=time(now);
  if(![request.tenantId,request.operationId,config.organizationId]
    .every(x=>ID.test(x)) || !KEY.test(config.keyId) ||
    config.signingKey.length<32)
    throw new CommercialTransitionSigningDenied();
  const body=JSON.stringify({
    product_code:"VENDEATENDEIA",organization_id:config.organizationId,
    tenant_id:request.tenantId,command_request_id:request.operationId,
  });
  const nonce=randomBytes(24).toString("base64url");
  const digest=createHash("sha256").update(body).digest("hex");
  const canonical=["POST",ASSISTANT_COMMERCIAL_STATUS_PATH,
    config.keyId,String(timestamp),nonce,digest].join("\n");
  return {body,headers:{
    "Content-Type":"application/json",
    "X-FM-Command-Key-ID":config.keyId,
    "X-FM-Command-Timestamp":String(timestamp),
    "X-FM-Command-Nonce":nonce,
    "X-FM-Command-Signature":
      createHmac("sha256",config.signingKey).update(canonical,"ascii").digest("hex"),
  }};
}
