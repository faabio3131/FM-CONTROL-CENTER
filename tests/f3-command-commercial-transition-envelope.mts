/** Execute actual TypeScript corporate commercial signer for Python contract. */
import { signAssistantCommercialTransition } from
  "../src/application/billing/assistant-commercial-lifecycle-signer.ts";

const previous=Number(process.env.FM_TEST_LICENSE_UNTIL??"");
const target=Number(process.env.FM_TEST_TARGET_UNTIL??"");
const action=process.env.FM_TEST_ACTION;
if(!Number.isSafeInteger(previous)||!Number.isSafeInteger(target)||
   !["SUSPEND_DELINQUENCY","REACTIVATE_VERIFIED"].includes(action??""))
  throw Error("synthetic_test_contract_invalid");
const now=new Date();
const request=signAssistantCommercialTransition({
  assistantOrigin:"https://assistant.example.test",
  keyId:"fm-test-key",
  signingKey:"synthetic-command-assistant-commercial-key-for-tests",
  organizationId:"fm-company",
},{
  tenantId:"tenant-cross",actorId:"fm-owner",operationId:"cross-"+action,
  approvedAt:now,action,
  expectedStatus:action==="SUSPEND_DELINQUENCY"?"active":"suspended",
  expectedPlanCode:"BASE",expectedPlanRevision:1,
  expectedValidUntil:new Date(previous*1000),
  targetPlanCode:"BASE",targetPlanRevision:1,
  targetValidUntil:new Date(target*1000),effectiveAt:now,
  verifiedPaymentRef:action==="REACTIVATE_VERIFIED"?
    "provider-receipt-verified-123":"none",
},now);
process.stdout.write(JSON.stringify(request));
