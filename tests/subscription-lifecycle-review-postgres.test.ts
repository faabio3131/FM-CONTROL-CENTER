import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresSubscriptionLifecycleReviewRepository } from "../src/infrastructure/billing/postgres-subscription-lifecycle-review-repository";
import type { TenantContext } from "../src/domain/security/tenant-context";

const enabled=process.env.FMCC_LIFECYCLE_REVIEW_PG_TEST==="YES";
const tenantId="ci-review-"+randomUUID();
const ctx:TenantContext={tenantId,userId:"ci-owner",role:"owner",correlationId:"ci-review"};
let pool:pg.Pool;
let repo:PostgresSubscriptionLifecycleReviewRepository;
async function seed() {
  const result=await pool.query<{id:string}>(
    "INSERT INTO fmcc_audit_event (tenant_id,actor_id,actor_type,action,resource_type,resource_id,result,correlation_id,metadata) "+
    "VALUES($1,$2,'user','billing.lifecycle.intent_recorded','billing_subscription',$3,'success',$4,$5::jsonb) RETURNING id",
    [tenantId,"requester",randomUUID(),ctx.correlationId,JSON.stringify({
      state:"awaiting_policy",policyVersion:"fmcc.c06.lifecycle-intent.v1",productId:randomUUID(),action:"cancel",
    })]);
  return result.rows[0].id;
}
describe.skipIf(!enabled)("C06 PostgreSQL review decisions: idempotency and tenant isolation",()=>{
  beforeAll(async()=>{
    const url=process.env.DATABASE_URL?new URL(process.env.DATABASE_URL):null;
    if(!url||process.env.NODE_ENV!=="test"||!["localhost","127.0.0.1"].includes(url.hostname)||
       url.port!=="5432"||url.pathname!=="/fmcc_billing_ci"||url.username!=="fmcc_restore_test")
      throw new Error("billing.lifecycle_review_requires_disposable_db");
    pool=new pg.Pool({connectionString:url.toString(),max:6});
    repo=new PostgresSubscriptionLifecycleReviewRepository(pool);
  });
  afterAll(async()=>{
    if(!pool)return;
    try{await pool.query("DELETE FROM fmcc_audit_event WHERE tenant_id=$1",[tenantId]);}
    finally{await pool.end();}
  });
  it("rejects once, same idempotency replays, conflicting requests are denied",async()=>{
    const id=await seed();
    const a=await repo.reject(ctx,id,"policy_unavailable","a".repeat(64));
    expect(a).toMatchObject({state:"review_rejected",idempotentReplay:false,executionAuthorized:false});
    const b=await repo.reject(ctx,id,"policy_unavailable","a".repeat(64));
    expect(b).toMatchObject({decisionId:a.decisionId,idempotentReplay:true});
    await expect(repo.reject(ctx,id,"duplicate_request","a".repeat(64)))
      .rejects.toThrow("billing.lifecycle_review_idempotency_conflict");
    await expect(repo.reject(ctx,id,"policy_unavailable","b".repeat(64)))
      .rejects.toThrow("billing.lifecycle_intent_already_reviewed");
    expect((await repo.list(tenantId,51)).find(x=>x.intentId===id)?.state).toBe("review_rejected");
  });
  it("serializes competing administrators and records only one decision",async()=>{
    const id=await seed();
    const requests=await Promise.allSettled([
      repo.reject(ctx,id,"duplicate_request","c".repeat(64)),
      repo.reject(ctx,id,"duplicate_request","d".repeat(64)),
    ]);
    expect(requests.filter(x=>x.status==="fulfilled")).toHaveLength(1);
    expect(requests.filter(x=>x.status==="rejected")).toHaveLength(1);
    const count=await pool.query<{count:string}>(
      "SELECT count(*)::text AS count FROM fmcc_audit_event WHERE tenant_id=$1 "+
      "AND action='billing.lifecycle.intent_review_rejected' AND resource_id=$2",[tenantId,id]);
    expect(Number(count.rows[0].count)).toBe(1);
  });
  it("denies other tenant and nonexistent request without leaking records",async()=>{
    const id=await seed();
    await expect(repo.reject({...ctx,tenantId:"other-tenant"},id,"operator_declined","e".repeat(64)))
      .rejects.toThrow("billing.lifecycle_intent_not_found");
    await expect(repo.reject(ctx,randomUUID(),"operator_declined","f".repeat(64)))
      .rejects.toThrow("billing.lifecycle_intent_not_found");
    expect(await repo.list("other-tenant",51)).toEqual([]);
    expect((await repo.list(tenantId,51)).find(x=>x.intentId===id)?.state).toBe("awaiting_policy");
  });
});
