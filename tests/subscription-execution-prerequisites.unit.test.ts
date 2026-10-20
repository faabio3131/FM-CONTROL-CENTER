import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessLifecycleExecutionPrerequisites, type TrustedLifecycleEvidence } from "../src/domain/billing/subscription-execution-prerequisites";
import type { SubscriptionFinancialTrace } from "../src/application/billing/billing-subscription-trace-service";

const trace: SubscriptionFinancialTrace = {
  authority: "fmcc_billing_invoice_and_provider_payment",
  subscription: {
    subscriptionId: "11111111-1111-4111-8111-111111111111",
    productId: "22222222-2222-4222-8222-222222222222",
    customerId: "33333333-3333-4333-8333-333333333333",
    externalTenantId: "academy-1", planCode: "IRON_BASIC", status: "active",
    createdAt: new Date("2026-10-20T11:00:00Z"),
  },
  invoices: [{ invoiceId:"invoice-1", invoiceStatus:"pending", amountMinor:10000,
    currency:"BRL", gatewayAccountId:"gateway", createdAt:new Date("2026-10-20T11:00:00Z"),
    recordedPaymentStatus:null, paymentRecordedAt:null,
  }],
  limit:50, truncated:false, settlementConfirmedByThisView:false,
};
const now=new Date("2026-10-20T12:00:00Z");
function proof(kind: TrustedLifecycleEvidence["kind"], action: TrustedLifecycleEvidence["action"],
               authority: TrustedLifecycleEvidence["authority"]):TrustedLifecycleEvidence {
  return {kind,action,authority,tenantId:"fm",productId:trace.subscription.productId,
    subscriptionId:trace.subscription.subscriptionId,contractRevision:"v1-approved",
    sourceReference:"source:fmcc:v1",verifiedAt:"2026-10-20T11:00:00Z",
    validUntil:"2026-10-20T13:00:00Z"};
}
describe("C06 source-of-truth execution prerequisite contract (not an executor)",()=>{
  it("lists missing specific authorities and blocks all six actions by default",()=>{
    for(const action of ["cancel","suspend","reactivate","renew","migrate_plan","convert_trial"] as const) {
      const x=assessLifecycleExecutionPrerequisites(trace,action,"fm",[],now);
      expect(x.contractVersion).toBe("fmcc.c06.execution-prerequisites.v1");
      expect(x.gates.length).toBeGreaterThanOrEqual(5);
      expect(x.gates.every(g=>g.status==="missing_authority")).toBe(true);
      expect(x.executionAuthorized).toBe(false);
      expect(x.executableCommandAvailable).toBe(false);
      expect(x.blockReasons).toContain("billing.lifecycle_missing_approved_commercial_policy");
    }
  });
  it("rejects unapproved, cross-tenant, wrong-product and expired evidence",()=>{
    const wrong=proof("approved_commercial_policy","cancel","fmcc_governed_policy");
    for(const mutation of [
      {...wrong,tenantId:"other"}, {...wrong,productId:"other"},
      {...wrong,action:"renew" as const}, {...wrong,authority:"untrusted" as TrustedLifecycleEvidence["authority"]},
      {...wrong,validUntil:"2026-10-19T00:00:00Z"},
    ]) {
      expect(assessLifecycleExecutionPrerequisites(trace,"cancel","fm",[mutation],now)
        .gates.find(g=>g.kind==="approved_commercial_policy")?.status).toBe("missing_authority");
    }
  });
  it("even synthetically complete attestations cannot authorize an action",()=>{
    const initial=assessLifecycleExecutionPrerequisites(trace,"cancel","fm",[],now);
    const attestations=initial.gates.map(g=>proof(g.kind,"cancel",g.authority));
    const x=assessLifecycleExecutionPrerequisites(trace,"cancel","fm",attestations,now);
    expect(x.gates.every(g=>g.status==="verified_by_authority")).toBe(true);
    expect(x.blockReasons).toEqual([]);
    expect(x.executionAuthorized).toBe(false);
    expect(x.executableCommandAvailable).toBe(false);
  });
  it("flags incomplete invoice history, missing vertical binding and refund conflict",()=>{
    const partial={...trace,truncated:true,subscription:{...trace.subscription,externalTenantId:null}};
    const x=assessLifecycleExecutionPrerequisites(partial,"cancel","fm",[],now);
    expect(x.blockReasons).toContain("billing.lifecycle_history_incomplete");
    expect(x.blockReasons).toContain("billing.lifecycle_tenant_binding_unavailable");
    const refunded={...trace,invoices:[{...trace.invoices[0],invoiceStatus:"refunded"}]};
    const y=assessLifecycleExecutionPrerequisites(refunded,"migrate_plan","fm",[],now);
    expect(y.blockReasons).toContain("billing.lifecycle_state_not_applicable");
  });
  it("keeps API readonly, tenant sourced from session and no client evidence",()=>{
    const src=readFileSync(resolve("src/app/api/billing/subscriptions/[subscriptionId]/execution-prerequisites/route.ts"),"utf8");
    expect(src).toContain("resolveTenantContext(await headers())");
    expect(src).toContain("context.tenantId");
    expect(src).toContain('"Cache-Control": "no-store"');
    expect(src).not.toContain("export async function POST");
    expect(src).not.toContain("verified: true");
    expect(src).not.toContain("JSON.parse");
  });
});
