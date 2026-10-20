/** Command production license envelope used against Assistant real DB fixture. */
import { randomUUID } from "node:crypto";
import { signAssistantPlanBindingStatus, signAssistantPlanLicenseBind } from
  "../src/application/billing/assistant-plan-license-signer.ts";

const config = {
  assistantOrigin: "https://assistant.example.test",
  keyId: "fm-key",
  signingKey: "synthetic-command-license-signing-key-for-tests-12345",
  organizationId: "fm-corporate",
};
const nonce = randomUUID();
const grant = signAssistantPlanLicenseBind(config, {
  tenantId: "tenant-a",
  planCode: "PLAN_FULL", planRevision: 1,
  actorUserId: "fm-owner", approvedAt: new Date(),
}, new Date(), nonce);
const status = signAssistantPlanBindingStatus(config, {
  tenantId: "tenant-a", planCode: "PLAN_FULL", planRevision: 1,
  operationNonce: nonce,
});
process.stdout.write(JSON.stringify({ ...grant, status }));
