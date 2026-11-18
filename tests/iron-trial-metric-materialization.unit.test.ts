import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { projectIronTrialStarts, type IronTrialCanonicalFact } from "@/domain/metrics/iron-trial-starts";

const gymA = "e92886be-3254-41be-8492-bc00f959b359";
const subA = "80546676-4b11-4b29-bb99-2f8452896bcd";
const sourceFact = "9cf6e924-dcb9-4ac2-8daa-7951aaf0f915";

function trial(request: string, startedAt = "2026-11-05T12:00:00.000Z",
  overrides: Record<string, unknown> = {}): IronTrialCanonicalFact {
  const createdAt = "2026-11-05T12:10:00.000Z";
  return {
    id: sourceFact, externalId: "trial:" + request,
    sourceTimestamp: new Date(createdAt),
    payload: {
      external_id: request, tenant_id: gymA, subscription_id: subA,
      status: "expired", started_at: startedAt, created_at: createdAt,
      ends_at: "2026-12-05T12:00:00.000Z", ...overrides,
    },
  };
}

describe("IRON canonical trial starts materialization (F11)", () => {
  const asOf = new Date("2026-11-18T17:00:00.000Z");

  it("counts distinct actual trial requests in a UTC month, not status or paid subscriptions", () => {
    const first = trial("trial-a0b1c2d3");
    const second = {
      ...trial("trial-z9y8x7w6", "2026-10-19T10:00:00.000Z",
        { ends_at:"2026-11-19T10:00:00.000Z" }),
      id:"2efca182-39f5-4aaf-871f-50e28c8f115e",
      sourceTimestamp:new Date("2026-11-05T12:10:00.000Z"),
    };
    const result = projectIronTrialStarts([first, first, second], asOf);
    expect(result).toHaveLength(2);
    expect(result.map(r=>[r.periodStart.toISOString(),r.count])).toEqual([
      ["2026-10-01T00:00:00.000Z",1],
      ["2026-11-01T00:00:00.000Z",1],
    ]);
    expect(result[0]?.periodEnd.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(result[1]?.sourceTimestamp).toEqual(new Date("2026-11-05T12:00:00.000Z"));
    expect(result[1]?.provenanceRefs[0]).toMatch(/^iron\.trial:sha256:[0-9a-f]{64}$/);
    expect(result[1]?.provenanceRefs).toContain(sourceFact);
  });

  it("never converts unobserved trials into numeric zero", () => {
    expect(projectIronTrialStarts([], asOf)).toEqual([]);
  });

  it("prevents double-count and rejects conflicting cross-gym replay under same trial ID", () => {
    const first = trial("trial-a0b1c2d3");
    const changed = { ...first, payload:{ ...first.payload, tenant_id:"ce976409-a72f-4cca-b76a-08d5dcbd64e7" } };
    expect(()=>projectIronTrialStarts([first,changed],asOf)).toThrow("metrics.iron_trial_duplicate_conflict");
    const result=projectIronTrialStarts([first,first],asOf);
    expect(result).toHaveLength(1);
    expect(result[0]?.count).toBe(1);
  });

  it("fails closed on future, cross-source, malformed dates and inconsistent provenance", () => {
    for(const invalid of [
      trial("trial-a0b1c2d3","2027-01-01T00:00:00.000Z",{ends_at:"2027-02-01T00:00:00.000Z"}),
      trial("trial-a0b1c2d3","not-date"),
      trial("trial-a0b1c2d3",undefined,{created_at:"2026-11-04T12:00:00.000Z"}),
      trial("trial-a0b1c2d3",undefined,{tenant_id:"OTHER-TENANT"}),
      trial("trial-a0b1c2d3",undefined,{subscription_id:null}),
      trial("trial-a0b1c2d3",undefined,{status:"PAID"}),
      {...trial("trial-a0b1c2d3"),externalId:"invoice:fake"},
    ]) expect(()=>projectIronTrialStarts([invalid],asOf)).toThrow();
  });

  it("materializer is scoped by source+tenant+product, idempotent and invoked before sync.complete", () => {
    const dbSource = readFileSync("src/infrastructure/metrics/iron-trial-starts-materializer.ts","utf8");
    const run = readFileSync("src/application/integration/connector-runtime.ts","utf8");
    const comp = readFileSync("src/application/integration/connector-composition.ts","utf8");
    expect(dbSource).toContain('eq(canonicalFacts.tenantId, input.tenantId)');
    expect(dbSource).toContain('eq(canonicalFacts.productId, input.productId)');
    expect(dbSource).toContain('eq(canonicalFacts.sourceId, input.sourceId)');
    expect(dbSource).toContain('eq(canonicalFacts.factType, "iron.trial")');
    expect(dbSource).toContain("pg_advisory_xact_lock");
    expect(dbSource).toContain("tx.update(metricValues)");
    expect(dbSource).toContain("tx.insert(metricValues)");
    expect(run.indexOf("await this.afterCanonicalSync(context, source)")).toBeLessThan(run.indexOf("await this.syncs.complete({"));
    expect(comp).toContain("new IronTrialStartsMaterializer().materialize({");
  });
});
