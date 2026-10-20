/** Actual production FM signer executed by the isolated Assistant contract test. */
import { signWhatsAppQRPolicyProjection } from
  "../src/application/integration/whatsapp-qr-policy-signer.ts";

const signed=signWhatsAppQRPolicyProjection({
  assistantOrigin:"https://assistant.example.test",
  organizationId:"fm-org",
  keyId:"fm-qr-key",
  signingKey:"synthetic-corporate-qr-sync-key-of-sufficient-entropy",
},{
  actorId:"fm-owner",revision:3,displaySeconds:30,approvedAt:new Date(),
});
process.stdout.write(JSON.stringify(signed));
