/** Executes the production Command signer against the Assistant SQL fixture. */
import { signAssistantLicenseSecurityHold } from
  "../src/application/billing/assistant-license-security-hold-signer.ts";

const cutoff=Number(process.env.FM_TEST_LICENSE_UNTIL ?? "");
if(!Number.isSafeInteger(cutoff) || cutoff<1)throw Error("fixture cutoff missing");
const now=new Date();
const request=signAssistantLicenseSecurityHold({
  assistantOrigin:"https://assistant.example.test",
  keyId:"fm-key",signingKey:"synthetic-fm-license-security-test-key-32-characters",
  organizationId:"fm-corporate",
},{
  tenantId:"t1",actorUserId:"fm-owner",commandRequestId:"hold-cross-runtime-1",
  approvedAt:now,stepUpAt:now,
  planCode:"PLAN",planRevision:1,expectedValidUntil:new Date(cutoff*1000),
},now);
process.stdout.write(JSON.stringify(request));
