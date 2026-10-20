import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({
  aggregate:vi.fn(),quarantine:vi.fn(),drain:vi.fn(),
}));
vi.mock("../src/infrastructure/db/client",()=>({
  db:{select:()=>({from:()=>({where:mocks.aggregate})})},
}));
vi.mock("../src/application/billing/assistant-paid-license-outbox",()=>({
  quarantineStaleVendeLicenseClaims:mocks.quarantine,
  drainVerifiedVendePaidLicenses:mocks.drain,
}));

import {
  assertVendeWorkerEnabled,readVendeQueueHealth,runGovernedVendeLicenseWorker,
} from "../src/application/billing/vende-license-worker";

const config={
  assistantOrigin:"https://assistant.example.test", keyId:"ci-key",
  signingKey:"a-synthetic-test-only-secret-that-is-over-32-characters",
  organizationId:"fm-company",
};
beforeEach(()=>{
  vi.clearAllMocks();
  process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID="fm-company";
  process.env.FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED="false";
  mocks.aggregate.mockResolvedValue([{
    pending:3,processing:1,blocked:2,delivered:8,staleProcessing:1,
    oldestPendingAt:new Date("2026-10-20T10:00:00.000Z"),
  }]);
  mocks.quarantine.mockResolvedValue(1);
  mocks.drain.mockResolvedValue({delivered:2,blocked:1});
});

describe("FM Vende worker governance and queue observability",()=>{
  it("is OFF by default and denies unscoped worker activation",async()=>{
    expect(()=>assertVendeWorkerEnabled()).toThrow();
    await expect(runGovernedVendeLicenseWorker(config)).rejects.toThrow();
    expect(mocks.quarantine).not.toHaveBeenCalled();
    process.env.FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED="true";
    await expect(runGovernedVendeLicenseWorker({...config,organizationId:"customer"}))
      .rejects.toThrow();
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it("reports complete row counts and oldest pending age, not page totals",async()=>{
    const health=await readVendeQueueHealth("fm-company",new Date("2026-10-20T10:10:00.000Z"));
    expect(health).toEqual({
      pending:3,processing:1,blocked:2,delivered:8,staleProcessing:1,
      oldestPendingAgeSeconds:600,alert:"critical",
    });
    expect(mocks.aggregate).toHaveBeenCalledOnce();
  });

  it("treats empty queue as healthy and aging entries as attention",async()=>{
    mocks.aggregate.mockResolvedValueOnce([{
      pending:0,processing:0,blocked:0,delivered:10,
      staleProcessing:0,oldestPendingAt:null,
    }]);
    expect(await readVendeQueueHealth("fm-company")).toMatchObject({
      alert:"healthy",oldestPendingAgeSeconds:null,
    });
    mocks.aggregate.mockResolvedValueOnce([{
      pending:1,processing:0,blocked:0,delivered:0,
      staleProcessing:0,oldestPendingAt:new Date("2026-10-20T10:00:00.000Z"),
    }]);
    expect(await readVendeQueueHealth("fm-company",new Date("2026-10-20T10:06:00.000Z")))
      .toMatchObject({alert:"attention",oldestPendingAgeSeconds:360});
  });

  it("denies foreign tenant metrics without querying the database",async()=>{
    await expect(readVendeQueueHealth("customer")).rejects.toThrow();
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it("processes one strictly bounded batch, quarantines crashes before dispatch",async()=>{
    process.env.FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED="true";
    const now=new Date("2026-10-20T10:10:00.000Z");
    const result=await runGovernedVendeLicenseWorker(config,{limit:2,now});
    expect(mocks.quarantine).toHaveBeenCalledExactlyOnceWith("fm-company",now);
    expect(mocks.drain).toHaveBeenCalledExactlyOnceWith(config,2,undefined);
    expect(result).toMatchObject({
      quarantined:1,delivered:2,blocked:1,queue:{alert:"critical"},
    });
  });

  it("rejects oversized, empty and fractional batches before any I/O",async()=>{
    process.env.FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED="true";
    for(const limit of [0,-1,21,1.5,Number.POSITIVE_INFINITY]) {
      await expect(runGovernedVendeLicenseWorker(config,{limit})).rejects.toThrow();
    }
    expect(mocks.quarantine).not.toHaveBeenCalled();
    expect(mocks.drain).not.toHaveBeenCalled();
  });

  it("does not invoke the dispatcher if crash quarantine fails",async()=>{
    process.env.FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED="true";
    mocks.quarantine.mockRejectedValue(new Error("database-unavailable"));
    await expect(runGovernedVendeLicenseWorker(config)).rejects.toThrow();
    expect(mocks.drain).not.toHaveBeenCalled();
  });
});
