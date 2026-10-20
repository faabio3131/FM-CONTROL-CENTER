/** Command production license envelope used against Assistant real DB fixture. */
import { signAssistantPlanLicenseBind } from
  "../src/application/billing/assistant-plan-license-signer.ts";

const grant = signAssistantPlanLicenseBind({
  assistantOrigin: "https://assistant.example.test",
  keyId: "fm-key",
  signingKey: "synthetic-command-license-signing-key-for-tests-12345",
  organizationId: "fm-corporate",
}, {
  tenantId: "tenant-a",
  planCode: "PLAN_FULL", planRevision: 1,
  actorUserId: "fm-owner", approvedAt: new Date(),
});
process.stdout.write(JSON.stringify(grant));
