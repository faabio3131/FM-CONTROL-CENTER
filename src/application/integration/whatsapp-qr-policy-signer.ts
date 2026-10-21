/** Pure FM QR policy signer. No DB, network adapter or Next.js import here.
 * Byte-for-byte executable under Node 24 for isolated Python receiver E2E.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

export const ASSISTANT_WHATSAPP_QR_POLICY_PATH =
  "/internal/v1/command/whatsapp-qr/policy";

export class WhatsAppQRProjectionUnavailable extends Error {
  constructor() { super("qr.policy_projection_unavailable"); }
}
export type QRSigningConfig = Readonly<{
  assistantOrigin:string; keyId:string; signingKey:string; organizationId:string;
}>;
export type WhatsAppQRProjectionRevision = Readonly<{
  displaySeconds:number;revision:number;actorId:string;approvedAt:Date;
}>;

export function signWhatsAppQRPolicyProjection(
  config:QRSigningConfig,revision:WhatsAppQRProjectionRevision,now:Date=new Date(),
) {
  const seconds=revision.displaySeconds;
  const approvedAt=Math.floor(revision.approvedAt.getTime()/1000);
  const clock=Math.floor(now.getTime()/1000);
  if (typeof seconds!=="number" || !Number.isSafeInteger(seconds) ||
      seconds<15 || seconds>120 ||
      !Number.isSafeInteger(revision.revision) || revision.revision<1 ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(revision.actorId) ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(config.organizationId) ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(config.keyId) ||
      config.signingKey.length<32 || !Number.isSafeInteger(clock) ||
      !Number.isSafeInteger(approvedAt) ||
      approvedAt>clock+15 || clock-approvedAt>366*86400)
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
  const digest=createHash("sha256").update(Buffer.from(body,"utf8")).digest("hex");
  const canonical=[
    "POST",ASSISTANT_WHATSAPP_QR_POLICY_PATH,config.keyId,
    timestamp,nonce,digest,
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
