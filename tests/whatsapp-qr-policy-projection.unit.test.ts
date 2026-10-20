import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ASSISTANT_WHATSAPP_QR_POLICY_PATH,
  projectWhatsAppQRPolicy,
  signWhatsAppQRPolicyProjection,
} from "../src/application/integration/whatsapp-qr-policy-projection";

const config={
  assistantOrigin:"https://assistant.example.test",
  organizationId:"fm-org",
  keyId:"fm-key",
  signingKey:"synthetic-secret-for-testing-corporate-qr-policy-signing",
};
const approvedAt=new Date("2026-10-20T12:00:00.000Z");
const now=new Date("2026-10-20T12:00:02.000Z");
const revision={
  displaySeconds:30,revision:4,actorId:"fm-admin",approvedAt,
};
const env={
  FM_COMMAND_VENDE_QR_POLICY_SYNC_ENABLED:"true",
  FM_COMMAND_CORE_BRIDGE_ASSISTANT_URL:config.assistantOrigin,
  FM_COMMAND_CORE_BRIDGE_CONTROL_KEY_ID:config.keyId,
  FM_COMMAND_CORE_BRIDGE_CONTROL_SIGNING_KEY:config.signingKey,
  FM_COMMAND_PLATFORM_ORGANIZATION_ID:config.organizationId,
};

describe("FM-signed QR policy projection contract",()=>{
  it("pins exact product, revision, actor and signature path using unique nonces",()=>{
    const first=signWhatsAppQRPolicyProjection(config,revision,now);
    const second=signWhatsAppQRPolicyProjection(config,revision,now);
    expect(first.headers["X-FM-Command-Nonce"]).not.toBe(second.headers["X-FM-Command-Nonce"]);
    expect(JSON.parse(first.body)).toEqual({
      product_code:"VENDEATENDEIA",
      organization_id:"fm-org",actor_user_id:"fm-admin",
      approved_at:Math.floor(approvedAt.getTime()/1000),
      revision:4,display_seconds:30,
    });
    const digest=createHash("sha256").update(first.body).digest("hex");
    const canonical=[
      "POST",ASSISTANT_WHATSAPP_QR_POLICY_PATH,config.keyId,
      first.headers["X-FM-Command-Timestamp"],first.headers["X-FM-Command-Nonce"],digest,
    ].join("\n");
    expect(first.headers["X-FM-Command-Signature"]).toBe(
      createHmac("sha256",config.signingKey).update(canonical,"ascii").digest("hex"),
    );
  });
  it.each([14,121,45.5,0])("never signs invalid corporate duration %s",seconds=>{
    expect(()=>signWhatsAppQRPolicyProjection(config,{...revision,displaySeconds:seconds},now))
      .toThrow();
  });
  it("rejects wrong FM organization, actor, revision, or stale approval",()=>{
    expect(()=>signWhatsAppQRPolicyProjection({...config,organizationId:"other org"},revision,now))
      .toThrow();
    expect(()=>signWhatsAppQRPolicyProjection(config,{...revision,actorId:"bad actor"},now))
      .toThrow();
    expect(()=>signWhatsAppQRPolicyProjection(config,{...revision,revision:0},now)).toThrow();
    expect(()=>signWhatsAppQRPolicyProjection(config,{...revision,approvedAt:new Date("2020-01-01")},now))
      .toThrow();
  });
  it("refuses network calls when corporate feature is OFF",async()=>{
    let sends=0;
    const http=(async()=>{sends++;return new Response();}) as typeof fetch;
    await expect(projectWhatsAppQRPolicy(revision,http,{
      ...env,FM_COMMAND_VENDE_QR_POLICY_SYNC_ENABLED:"false",
    })).rejects.toThrow();
    expect(sends).toBe(0);
  });
  it.each(["projected","already_projected"] as const)(
    "accepts only exact Assistant acknowledgement %s",async status=>{
      let count=0;
      const http=(async(input:RequestInfo|URL,init?:RequestInit)=>{
        count++;
        expect(String(input)).toBe(config.assistantOrigin+ASSISTANT_WHATSAPP_QR_POLICY_PATH);
        expect(init?.method).toBe("POST");
        expect(init?.redirect).toBe("manual");
        expect(init?.cache).toBe("no-store");
        const headers=new Headers(init?.headers);
        expect(headers.get("X-FM-Command-Signature")).toMatch(/^[0-9a-f]{64}$/);
        return new Response(JSON.stringify({status}),{status:200});
      }) as typeof fetch;
      expect(await projectWhatsAppQRPolicy(revision,http,env)).toBe(status);
      expect(count).toBe(1);
    },
  );
  it("keeps bad response and ambiguous network failures unconfirmed",async()=>{
    for(const response of [
      new Response(JSON.stringify({status:"unknown"}),{status:200}),
      new Response(JSON.stringify({status:"projected"}),{status:401}),
      new Response("<html>redirect</html>",{status:302}),
    ]){
      await expect(projectWhatsAppQRPolicy(revision,
        (async()=>response) as typeof fetch,env)).rejects.toThrow();
    }
    await expect(projectWhatsAppQRPolicy(revision,
      (async()=>{throw new Error("network timeout");}) as typeof fetch,env))
      .rejects.toThrow("qr.policy_projection_unavailable");
  });
});
