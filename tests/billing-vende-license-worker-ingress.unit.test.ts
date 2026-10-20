import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({
  audit:vi.fn(),enabled:vi.fn(),run:vi.fn(),config:vi.fn(),
}));
vi.mock("../src/infrastructure/db/client",()=>({
  db:{insert:()=>({values:mocks.audit})},
}));
vi.mock("../src/application/billing/assistant-plan-outbox-dispatcher",()=>({
  planProjectionConfigFromEnvironment:mocks.config,
}));
vi.mock("../src/application/billing/vende-license-worker",()=>({
  assertVendeWorkerEnabled:mocks.enabled,
  runGovernedVendeLicenseWorker:mocks.run,
}));

import { POST } from "../src/app/api/internal/workers/vende-license-outbox/route";
const token="synthetic-only-fm-worker-credential-000000000000000000";
const config={
  assistantOrigin:"https://assistant.example.test",keyId:"ci-worker",
  signingKey:"synthetic-only-secret-0000000000000000000000",
  organizationId:"fm-company",
};
function request(value?:string,body?:string) {
  return new Request("http://localhost/api/internal/workers/vende-license-outbox",{
    method:"POST",
    headers:{
      ...(value?{Authorization:"Bearer "+value}:{}),
      ...(body?{"Content-Type":"application/json"}:{}),
    },
    ...(body?{body}:{}),
  });
}
beforeEach(()=>{
  vi.clearAllMocks();
  process.env.FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED="false";
  process.env.FM_COMMAND_VENDE_LICENSE_WORKER_TOKEN=token;
  mocks.config.mockReturnValue(config);
  mocks.run.mockResolvedValue({quarantined:1,delivered:2,blocked:0,queue:{pending:0}});
  mocks.audit.mockResolvedValue(undefined);
});

describe("FM internal scheduled worker ingress",()=>{
  it("is disabled by default even with a valid bearer token",async()=>{
    const response=await POST(request(token));
    expect(response.status).toBe(503);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("rejects missing, wrong and malformed scheduler token before any DB",async()=>{
    process.env.FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED="true";
    for(const value of [undefined,"wrong-worker-secret",token+"x",token+",other"]) {
      const response=await POST(request(value));
      expect(response.status).toBe(401);
    }
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("rejects body fields so caller cannot choose tenant, target, limit or URL",async()=>{
    process.env.FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED="true";
    const response=await POST(request(token,JSON.stringify({
      tenantId:"external-org",limit:100,assistantOrigin:"https://attacker.invalid",
    })));
    expect(response.status).toBe(400);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("denies dispatch when corporate audit storage is offline",async()=>{
    process.env.FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED="true";
    mocks.audit.mockRejectedValueOnce(new Error("hidden-database-failure"));
    const response=await POST(request(token));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("hidden-database-failure");
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("runs a bounded batch only after recording persistent intent",async()=>{
    process.env.FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED="true";
    const response=await POST(request(token));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({result:{delivered:2,quarantined:1}});
    expect(mocks.audit).toHaveBeenCalledTimes(2);
    expect(mocks.run).toHaveBeenCalledExactlyOnceWith(config,{limit:10});
    expect(mocks.audit.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.run.mock.invocationCallOrder[0]);
  });
  it("sanitizes unexpected worker errors without implicit repeat",async()=>{
    process.env.FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED="true";
    mocks.run.mockRejectedValue(new Error("sensitive-provider-response"));
    const response=await POST(request(token));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("sensitive-provider-response");
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });
});
