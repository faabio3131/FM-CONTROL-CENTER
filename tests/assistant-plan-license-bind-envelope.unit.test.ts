import { describe, expect, it } from "vitest";
import {
  signAssistantPlanLicenseBind,
  ASSISTANT_PLAN_LICENSE_BIND_PATH,
  type PlanProjectionConfig,
} from "../src/application/billing/assistant-plan-outbox-dispatcher";
import {
  signAssistantPlanBindingStatus,
  ASSISTANT_PLAN_BINDING_STATUS_PATH,
} from "../src/application/billing/assistant-plan-license-signer";
import { signCommandBridgeRequest } from "../src/application/integration/fm-core-bridge-governance";

const config:PlanProjectionConfig = {
  assistantOrigin:"https://assistant.invalid",
  keyId:"fm-key", signingKey:"a-very-long-synthetic-command-key-for-contract-tests",
  organizationId:"fm-corporate",
};
const now=new Date("2026-10-18T12:00:00.000Z");
const grant={
  tenantId:"tenant-a",planCode:"VENDE_FULL",planRevision:3,
  actorUserId:"fm-owner",approvedAt:now,
};

describe("Corporate VendeAtendeIA license binding envelope",()=>{
  it("binds product, tenant, revision and approval to the exact signed body",()=>{
    const signed=signAssistantPlanLicenseBind(config,grant,now);
    const body=JSON.parse(signed.body);
    expect(body.product_code).toBe("VENDEATENDEIA");
    expect(body.organization_id).toBe("fm-corporate");
    expect(body.tenant_id).toBe("tenant-a");
    expect(body.plan_code).toBe("VENDE_FULL");
    expect(body.plan_revision).toBe(3);
    expect(body).not.toHaveProperty("subscriptionStatus");
    expect(body).not.toHaveProperty("period_end");
    expect(signed.headers["X-FM-Command-Signature"]).toBe(
      signCommandBridgeRequest(
        config.signingKey, config.keyId,
        signed.headers["X-FM-Command-Timestamp"],
        signed.headers["X-FM-Command-Nonce"],
        Buffer.from(signed.body,"utf8"),
        ASSISTANT_PLAN_LICENSE_BIND_PATH,
      ),
    );
    expect(signed.headers["X-FM-Command-Signature"]).not.toBe(
      signCommandBridgeRequest(
        config.signingKey, config.keyId,
        signed.headers["X-FM-Command-Timestamp"],
        signed.headers["X-FM-Command-Nonce"],
        Buffer.from(signed.body,"utf8"),
        "/internal/v1/command/assistant-plans/project",
      ),
    );
  });
  it("rejects malformed revisions and unapproved or expired proposals",()=>{
    expect(()=>signAssistantPlanLicenseBind(config,{...grant,planRevision:0},now)).toThrow();
    expect(()=>signAssistantPlanLicenseBind(config,{...grant,tenantId:"../../other"},now)).toThrow();
    expect(()=>signAssistantPlanLicenseBind(config,{
      ...grant,approvedAt:new Date("2023-01-01T00:00:00Z"),
    },now)).toThrow();
    expect(()=>signAssistantPlanLicenseBind(config,{
      ...grant,approvedAt:new Date("2026-10-19T00:00:00Z"),
    },now)).toThrow();
  });

  it("correlates signed status to the exact original binding operation nonce", () => {
    const nonce="f3-outbox-attempt-correlation-123456789";
    const bind=signAssistantPlanLicenseBind(config,grant,now,nonce);
    expect(bind.headers["X-FM-Command-Nonce"]).toBe(nonce);
    const status=signAssistantPlanBindingStatus(config,{
      tenantId:grant.tenantId,planCode:grant.planCode,
      planRevision:grant.planRevision,operationNonce:nonce,
    },now);
    expect(JSON.parse(status.body).operation_nonce).toBe(nonce);
    expect(status.headers["X-FM-Command-Signature"]).toBe(
      signCommandBridgeRequest(
        config.signingKey,config.keyId,
        status.headers["X-FM-Command-Timestamp"],
        status.headers["X-FM-Command-Nonce"],
        Buffer.from(status.body,"utf8"),ASSISTANT_PLAN_BINDING_STATUS_PATH,
      ),
    );
    expect(() => signAssistantPlanBindingStatus(config,{
      tenantId:grant.tenantId,planCode:grant.planCode,
      planRevision:grant.planRevision,operationNonce:"short",
    },now)).toThrow();
  });

});
