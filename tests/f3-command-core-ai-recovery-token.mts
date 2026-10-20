/** Actual Command RS256 recovery signer invoked by Python integration tests.
 * Ephemeral test-only RSA key. Never writes or exports a production secret.
 */
import { generateKeyPairSync } from "node:crypto";
import { signCoreAIRecoveryAuthorization } from
  "../src/application/integration/fm-core-ai-recovery-jwt.ts";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKeyPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const token = signCoreAIRecoveryAuthorization({
  userId: "corporate-admin-1",
  sessionId: "command-session-1",
  organizationId: "fm-company",
  role: "platform_admin",
  approved: true,
  stepUpAt: new Date(),
}, {
  privateKeyPem,
  issuer: "fm-command-synthetic",
  audience: "fm-core-ai-recovery",
  corporateOrganizationId: "fm-company",
});
process.stdout.write(JSON.stringify({ token, public_key_pem: publicKeyPem }));
