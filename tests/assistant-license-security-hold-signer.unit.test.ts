import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ASSISTANT_LICENSE_SECURITY_HOLD_PATH,
  signAssistantLicenseSecurityHold,
} from "../src/application/billing/assistant-license-security-hold-signer";

const now=new Date("2026-10-20T18:00:00Z");
const config={
  assistantOrigin:"https://assistant.example.test",
  keyId:"fm-test",signingKey:"synthetic-fm-license-security-test-key-32-characters",
  organizationId:"fm-corporate",
};
const intent={
  tenantId:"t1",actorUserId:"fm-owner",
  commandRequestId:"hold-1",
  approvedAt:now,stepUpAt:now,
  planCode:"PLAN",planRevision:1,
  expectedValidUntil:new Date("2026-10-22T18:00:00Z"),
};
describe("signed FM security-only license hold",()=>{
  it("uses exact Assistant cryptographic domain and unique nonce",()=>{
    const first=signAssistantLicenseSecurityHold(config,intent,now);
    const second=signAssistantLicenseSecurityHold(config,intent,now);
    expect(first.headers["X-FM-Command-Nonce"]).not.toBe(second.headers["X-FM-Command-Nonce"]);
    const body=JSON.parse(first.body);
    expect(body).toEqual({
      product_code:"VENDEATENDEIA",
      organization_id:"fm-corporate",tenant_id:"t1",
      actor_user_id:"fm-owner",command_request_id:"hold-1",
      approved_at:Math.floor(now.getTime()/1000),
      step_up_at:Math.floor(now.getTime()/1000),
      plan_code:"PLAN",plan_revision:1,
      expected_valid_until:Math.floor(intent.expectedValidUntil.getTime()/1000),
      reason:"security_hold",
    });
    const canonical=[
      "POST",ASSISTANT_LICENSE_SECURITY_HOLD_PATH,config.keyId,
      first.headers["X-FM-Command-Timestamp"],first.headers["X-FM-Command-Nonce"],
      createHash("sha256").update(first.body).digest("hex"),
    ].join("\n");
    expect(first.headers["X-FM-Command-Signature"]).toBe(
      createHmac("sha256",config.signingKey).update(canonical,"ascii").digest("hex"),
    );
  });
  it("rejects stale step-up, future/reversed expiry and spoofed actor",()=>{
    expect(()=>signAssistantLicenseSecurityHold(config,{
      ...intent,stepUpAt:new Date("2026-10-20T17:50:00Z"),
    },now)).toThrow();
    expect(()=>signAssistantLicenseSecurityHold(config,{
      ...intent,expectedValidUntil:new Date("2026-10-19"),
    },now)).toThrow();
    expect(()=>signAssistantLicenseSecurityHold(config,{
      ...intent,actorUserId:"foreign actor",
    },now)).toThrow();
    expect(()=>signAssistantLicenseSecurityHold(config,{
      ...intent,planRevision:0,
    },now)).toThrow();
  });
});
