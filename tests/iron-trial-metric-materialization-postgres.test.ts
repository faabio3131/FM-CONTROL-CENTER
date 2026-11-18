import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/infrastructure/db/client";
import { canonicalFacts, metricValues } from "@/infrastructure/db/platform-schema";
import { IronTrialStartsMaterializer } from "@/infrastructure/metrics/iron-trial-starts-materializer";

describe.skipIf(process.env.FMCC_IRON_TRIAL_PG_TEST !== "YES")(
  "IRON trial starts materialization — PostgreSQL 18 real transactions", () => {
    it("upserts one monthly metric, respects tenant/source and fails closed on corrupted facts", async () => {
      const tenantId = "fmcc-pg-test-" + randomUUID();
      const otherTenant = "fmcc-pg-test-" + randomUUID();
      const productId = randomUUID();
      const sourceId = randomUUID();
      const foreignSourceId = randomUUID();
      const gymId = randomUUID();
      const subscriptionId = randomUUID();
      const requestId = "trial-e2e-" + randomUUID();
      const createdAt = new Date("2026-11-18T10:00:00.000Z");
      const startedAt = new Date("2026-11-17T10:00:00.000Z");
      const identity = "trial:" + requestId;
      const metric = new IronTrialStartsMaterializer();

      try {
        await db.insert(canonicalFacts).values([
          { tenantId, productId, sourceId, externalId: identity, factType:"iron.trial",
            payload: {
              external_id:requestId, tenant_id:gymId, subscription_id:subscriptionId,
              status:"active",started_at:startedAt.toISOString(),
              ends_at:"2026-12-17T10:00:00.000Z",created_at:createdAt.toISOString(),
            },
            mappingVersion:"iron-commercial-v1",sourceTimestamp:createdAt },
          { tenantId:otherTenant, productId, sourceId:foreignSourceId,
            externalId:"trial:"+randomUUID(),factType:"iron.trial",
            payload: { untrusted:"do not count" },
            mappingVersion:"iron-commercial-v1",sourceTimestamp:createdAt },
        ]);
        const input = {tenantId,productId,sourceId,mappingVersion:"iron-commercial-v1"};
        await Promise.all(Array.from({length:4},()=>metric.materialize(input)));
        const where = and(eq(metricValues.tenantId,tenantId),
          eq(metricValues.productId,productId),eq(metricValues.metricId,"trial.starts.count"),
          eq(metricValues.sourceAuthority,"IRON_CANONICAL_TRIAL"));
        let values = await db.select().from(metricValues).where(where);
        expect(values).toHaveLength(1);
        expect(values[0]).toMatchObject({
          value:"1",unit:"count",qualityStatus:"reconciled",
          freshnessStatus:"unknown",metricVersion:1,
        });
        expect(values[0]?.periodStart.toISOString()).toBe("2026-11-01T00:00:00.000Z");
        expect(values[0]?.periodEnd.toISOString()).toBe("2026-12-01T00:00:00.000Z");
        expect(values[0]?.provenanceRefs[0]).toMatch(/^iron\.trial:sha256:[0-9a-f]{64}$/);

        const requestTwo="trial-e2e-"+randomUUID();
        await db.insert(canonicalFacts).values({
          tenantId,productId,sourceId,externalId:"trial:"+requestTwo,
          factType:"iron.trial",mappingVersion:"iron-commercial-v1",
          sourceTimestamp:createdAt,
          payload:{
            external_id:requestTwo,tenant_id:gymId,subscription_id:subscriptionId,
            status:"expired",started_at:startedAt.toISOString(),
            ends_at:"2026-12-17T10:00:00.000Z",created_at:createdAt.toISOString(),
          },
        });
        await metric.materialize(input);
        values=await db.select().from(metricValues).where(where);
        expect(values).toHaveLength(1);
        expect(values[0]?.value).toBe("2");

        // A corrupt event stops materialization without erasing the last valid value.
        await db.insert(canonicalFacts).values({
          tenantId,productId,sourceId,externalId:"trial:"+randomUUID(),
          factType:"iron.trial",mappingVersion:"iron-commercial-v1",
          sourceTimestamp:createdAt,payload:{status:"PAID"},
        });
        await expect(metric.materialize(input)).rejects.toThrow(/metrics\.iron_trial_invalid/);
        values=await db.select().from(metricValues).where(where);
        expect(values).toHaveLength(1);
        expect(values[0]?.value).toBe("2");
        await expect(metric.materialize({...input,tenantId:otherTenant}))
          .resolves.toMatchObject({ materializedMonths:0 });
      } finally {
        await db.delete(metricValues).where(eq(metricValues.tenantId,tenantId));
        await db.delete(canonicalFacts).where(eq(canonicalFacts.tenantId,tenantId));
        await db.delete(canonicalFacts).where(eq(canonicalFacts.tenantId,otherTenant));
      }
    });
  },
);
