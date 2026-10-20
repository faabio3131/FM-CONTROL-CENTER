/** FM Command → Assistant: authenticated QR visual display policy projection.
 * This controls the browser display cap, NEVER provider QR token lifetime.
 * Shipping is opt-in; no live provider, WhatsApp or gateway dependency here.
 */
import { randomBytes } from "node:crypto";
import { planProjectionConfigFromEnvironment, type PlanProjectionConfig } from
  "@/application/billing/assistant-plan-outbox-dispatcher";
import { signCommandBridgeRequest } from "@/application/integration/fm-core-bridge-governance";
import { parseWhatsAppQRDisplaySeconds } from "@/domain/integration/whatsapp-qr-policy";

export const ASSISTANT_WHATSAPP_QR_POLICY_PATH =
  "/internal/v1/command/whatsapp-qr/policy";

export class WhatsAppQRProjectionUnavailable extends Error {
  constructor() { super("qr.policy_projection_unavailable"); }
}

export type WhatsAppQRProjectionRevision = Readonly<{
  displaySeconds: number;
  revision: number;
  actorId: string;
  approvedAt: Date;
}>;

export function signWhatsAppQRPolicyProjection(
  config: PlanProjectionConfig,
  revision: WhatsAppQRProjectionRevision,
  now: Date = new Date(),
) {
  const seconds=parseWhatsAppQRDisplaySeconds(revision.displaySeconds);
  const approvedAt=Math.floor(revision.approvedAt.getTime()/1000);
  const clock=Math.floor(now.getTime()/1000);
  if (!Number.isSafeInteger(revision.revision) || revision.revision < 1 ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(revision.actorId) ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(config.organizationId) ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(config.keyId) ||
      config.signingKey.length < 32 ||
      !Number.isSafeInteger(clock) || !Number.isSafeInteger(approvedAt) ||
      approvedAt > clock+15 || clock-approvedAt > 366*86400)
    throw new WhatsAppQRProjectionUnavailable();
  const body=JSON.stringify({
    product_code:"VENDEATENDEIA",
    organization_id:config.organizationId,
    actor_user_id:revision.actorId,
    approved_at:approvedAt,
    revision:revision.revision,
    display_seconds:seconds,
  });
  const timestamp=String(clock);
  const nonce=randomBytes(24).toString("base64url");
  const signature=signCommandBridgeRequest(
    config.signingKey,config.keyId,timestamp,nonce,
    Buffer.from(body,"utf8"),ASSISTANT_WHATSAPP_QR_POLICY_PATH,
  );
  return {body,headers:{
    "Content-Type":"application/json",
    "X-FM-Command-Key-ID":config.keyId,
    "X-FM-Command-Timestamp":timestamp,
    "X-FM-Command-Nonce":nonce,
    "X-FM-Command-Signature":signature,
  }};
}

/** Idempotent-by-revision remote mutation. On timeout the outcome is unknown;
 * operator may explicitly retry the identical persisted revision after step-up.
 * Assistant rechecks signature, nonce and monotonic version on every attempt.
 */
export async function projectWhatsAppQRPolicy(
  revision: WhatsAppQRProjectionRevision,
  http: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<"projected"|"already_projected"> {
  if (env.FM_COMMAND_VENDE_QR_POLICY_SYNC_ENABLED!=="true")
    throw new WhatsAppQRProjectionUnavailable();
  const config=planProjectionConfigFromEnvironment(env);
  const signed=signWhatsAppQRPolicyProjection(config,revision);
  try {
    const reply=await http(config.assistantOrigin+ASSISTANT_WHATSAPP_QR_POLICY_PATH,{
      method:"POST",headers:signed.headers,body:signed.body,
      cache:"no-store",redirect:"manual",signal:AbortSignal.timeout(5000),
    });
    if(reply.status!==200)throw new WhatsAppQRProjectionUnavailable();
    const result:unknown=await reply.json();
    if(!result || typeof result!=="object" || Array.isArray(result))throw new Error();
    const status=(result as Record<string,unknown>).status;
    if(status==="projected" || status==="already_projected")return status;
  }catch{throw new WhatsAppQRProjectionUnavailable();}
  throw new WhatsAppQRProjectionUnavailable();
}
