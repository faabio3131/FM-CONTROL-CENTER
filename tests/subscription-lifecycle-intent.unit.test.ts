import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BillingSubscriptionTraceService, type SubscriptionTraceRepository } from "../src/application/billing/billing-subscription-trace-service";
import { SubscriptionLifecycleIntentService, type LifecycleIntentStore, type LifecycleIntentEnvelope } from "../src/application/billing/subscription-lifecycle-intent-service";
import type { TenantContext } from "../src/domain/security/tenant-context";

const id="11111111-1111-4111-8111-111111111111";
const ctx: TenantContext={tenantId:"fm",userId:"owner-1",role:"owner",correlationId:"c"};
const subscription={
  subscriptionId:id,productId:"product",customerId:"customer",externalTenantId:"gym",
  planCode:"PLAN",status:"active",createdAt:new Date("2026-10-20"),
};
function fixture(status="active", invoiceStatus="paid") {
  const repository: SubscriptionTraceRepository={
    getSubscription:vi.fn(async()=>({...subscription,status})),
    listInvoices:vi.fn(async()=>[{
      invoiceId:"invoice",invoiceStatus,amountMinor:10000,currency:"BRL",
      createdAt:new Date("2026-10-20"),gatewayAccountId:"gateway",
      recordedPaymentStatus:invoiceStatus==="refunded"?"refunded":"received",
      paymentRecordedAt:new Date("2026-10-20"),
    }]),
  };
  const store: LifecycleIntentStore={
    issue:vi.fn(async()=>{}),
    record:vi.fn(async()=>({intentId:"intent",state:"awaiting_policy" as const,
      idempotentReplay:false,executionAuthorized:false as const})),
  };
  return {repository,store,service:new SubscriptionLifecycleIntentService(
    new BillingSubscriptionTraceService(repository),store)};
}
describe("C06 governed intent registration — no financial executor",()=>{
  it("binds an expiring proof to actor/tenant/subscription/snapshot/action",async()=>{
    const {store,service}=fixture();
    const issued=await service.issue(ctx,id,"cancel","active");
    expect(issued.token.length).toBeGreaterThanOrEqual(40);
    expect(Date.parse(issued.expiresAt)).toBeGreaterThan(Date.now());
    expect(store.issue).toHaveBeenCalledTimes(1);
    const [who, envelope,hash] = vi.mocked(store.issue).mock.calls[0];
    expect(who).toEqual(ctx);
    expect(envelope).toMatchObject({subscriptionId:id,productId:"product",customerId:"customer",
      recordedStatus:"active",action:"cancel"});
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(issued.token);
  });
  it("records awaiting_policy without granting changes and with the same scoped fingerprint",async()=>{
    const {store,service}=fixture();
    const proof=await service.issue(ctx,id,"cancel","active");
    const recorded=await service.record(ctx,id,{action:"cancel",expectedStatus:"active",
      token:proof.token,idempotencyKey:"intent-key-001"});
    expect(recorded).toEqual({intentId:"intent",state:"awaiting_policy",
      idempotentReplay:false,executionAuthorized:false});
    const envelope=vi.mocked(store.record).mock.calls[0][1] as LifecycleIntentEnvelope;
    expect(envelope.fingerprint).toBe(vi.mocked(store.issue).mock.calls[0][1].fingerprint);
  });
  it("refuses changed status, bad role, missing tenant and inapplicable/refunded action",async()=>{
    const {store,service}=fixture();
    await expect(service.issue(ctx,id,"cancel","pending"))
      .rejects.toThrow("billing.lifecycle_snapshot_changed_or_incomplete");
    await expect(service.issue({...ctx,role:"viewer"},id,"cancel","active"))
      .rejects.toThrow("security.permission_denied:billing:write");
    await expect(service.issue({...ctx,tenantId:" "},id,"cancel","active"))
      .rejects.toThrow("billing.lifecycle_scope_denied");
    await expect(service.issue(ctx,id,"convert_trial","active"))
      .rejects.toThrow("billing.lifecycle_action_not_applicable");
    await expect(service.issue(ctx,id,"invalid-action","active"))
      .rejects.toThrow("billing.lifecycle_input_invalid");
    await expect(fixture("active","refunded").service.issue(ctx,id,"renew","active"))
      .rejects.toThrow("billing.lifecycle_action_not_applicable");
    expect(store.issue).not.toHaveBeenCalled();
  });
  it("denies malformed replay parameters and does not reach storage",async()=>{
    const {store,service}=fixture();
    await expect(service.record(ctx,id,{action:"cancel",expectedStatus:"active",
      token:"short",idempotencyKey:"short"})).rejects.toThrow("billing.lifecycle_input_invalid");
    expect(store.record).not.toHaveBeenCalled();
  });
  it("keeps idempotency and preview single use serialized by PostgreSQL with actor/tenant fences",()=>{
    const src=(path:string)=>readFileSync(resolve(path),"utf8");
    const store=src("src/infrastructure/billing/postgres-subscription-lifecycle-intent-store.ts");
    const api=src("src/app/api/billing/subscriptions/[subscriptionId]/lifecycle-intents/route.ts");
    expect(store).toContain("pg_advisory_xact_lock");
    expect(store).toContain("idempotencyHash");
    expect(store).toContain("billing.lifecycle.intent_preview_issued");
    expect(store).toContain("billing.lifecycle.intent_recorded");
    expect(store).toContain("billing.lifecycle_preview_expired");
    expect(store).toContain("billing.lifecycle_preview_already_used");
    expect(store).toContain("tenant_id=$1 AND actor_id=$2");
    expect(store).toContain('await client.query("COMMIT")');
    expect(store).toContain('await client.query("ROLLBACK")');
    expect(store).not.toContain("UPDATE fmcc_billing_subscription");
    expect(store).not.toContain("fmcc_billing_iron_entitlement_outbox");
    expect(api).toContain("verifyPasswordStepUp");
    expect(api).toContain('result.idempotentReplay ? 200 : 201');
    expect(api).not.toContain("GET");
  });
});
