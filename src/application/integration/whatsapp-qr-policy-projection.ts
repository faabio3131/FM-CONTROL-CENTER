/** Governed remote QR projection. Pure envelope lives in qr-policy-signer.ts
 * and is executed byte-for-byte by the cross-runtime Node→FastAPI contract.
 */
import { planProjectionConfigFromEnvironment } from
  "@/application/billing/assistant-plan-outbox-dispatcher";
import {
  ASSISTANT_WHATSAPP_QR_POLICY_PATH,
  signWhatsAppQRPolicyProjection,
  WhatsAppQRProjectionUnavailable,
  type WhatsAppQRProjectionRevision,
} from "./whatsapp-qr-policy-signer";

export {
  ASSISTANT_WHATSAPP_QR_POLICY_PATH,
  signWhatsAppQRPolicyProjection,
  WhatsAppQRProjectionUnavailable,
};
export type { WhatsAppQRProjectionRevision };

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
