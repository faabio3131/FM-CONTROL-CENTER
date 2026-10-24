import {describe,expect,it} from "vitest";
import {parseRequestReconciliation} from
  "@/application/billing/vende-core-request-reconciliation";

const safe=()=>{
  const first={
    attempt_id:"attempt-a",provider:"vendor-a",model:"model-a",
    outcome:"error",fallback:false,source_ref:"provider-source-a",
    export_status:"needs_attention",usage_matches:true,
    cost_matches:false,needs_attention:true,
  };
  const second={
    attempt_id:"attempt-b",provider:"vendor-b",model:"model-b",
    outcome:"success",fallback:true,source_ref:"provider-source-b",
    export_status:"observational_match",usage_matches:true,
    cost_matches:true,needs_attention:false,
  };
  return {
    tenant_id:"tenant-a",unit_id:"unit-a",request_id:"request-1",
    attempts_observed:2,fallback_attempts:1,needs_attention:true,
    all_observational_matches:false,
    provider_invoice_verified:false,quota_recovery_authorized:false,
    real_provider_charges_certified:false,
    per_provider:[
      {provider:"vendor-a",attempts:1,fallback_attempts:0,
        missing_exports:0,uncertain_attempts:1,cost_disagreements:1,
        internal_unknown_costs:0,reported_unknown_costs:0,
        internal_known_cost_usd:"0.003",reported_known_cost_usd:"0.300"},
      {provider:"vendor-b",attempts:1,fallback_attempts:1,
        missing_exports:0,uncertain_attempts:0,cost_disagreements:0,
        internal_unknown_costs:0,reported_unknown_costs:0,
        internal_known_cost_usd:"0.009",reported_known_cost_usd:"0.009"},
    ],attempts:[first,second],
  };
};
const parse=(d:unknown)=>parseRequestReconciliation(
  d,"tenant-a","unit-a","request-1",
);

describe("Core provider request reconciliation: strictly private, fail-closed",()=>{
  it("accepts multi-provider fallback while keeping discrepancy and disabled quota recovery",()=>{
    const record=parse({...safe(),admin_secret:"must-not-be-forwarded"});
    expect(record.attempts_observed).toBe(2);
    expect(record.per_provider.map(p=>p.provider)).toEqual(["vendor-a","vendor-b"]);
    expect(record.needs_attention).toBe(true);
    expect(record.provider_invoice_verified).toBe(false);
    expect(record.quota_recovery_authorized).toBe(false);
    expect(record).not.toHaveProperty("admin_secret");
  });
  it.each([
    ["foreign tenant",{tenant_id:"foreign"}],
    ["foreign unit",{unit_id:"other"}],
    ["foreign request",{request_id:"other"}],
    ["forged invoice",{provider_invoice_verified:true}],
    ["forged recovery",{quota_recovery_authorized:true}],
    ["forged provider charge",{real_provider_charges_certified:true}],
    ["inconsistent totals",{attempts_observed:3}],
    ["false green",{all_observational_matches:true}],
    ["invalid fallback count",{fallback_attempts:0}],
  ])("rejects %s",(_label,mutation)=>{
    expect(()=>parse({...safe(),...mutation})).toThrow();
  });
  it("rejects duplicate attempt identities, provider count mismatch and fake money",()=>{
    const a=safe();
    expect(()=>parse({...a,attempts:[a.attempts[0],a.attempts[0]]})).toThrow();
    expect(()=>parse({...a,per_provider:[{
      ...a.per_provider[0],attempts:2,
    },a.per_provider[1]]})).toThrow();
    expect(()=>parse({...a,per_provider:[{
      ...a.per_provider[0],reported_known_cost_usd:"NaN",
    },a.per_provider[1]]})).toThrow();
    expect(()=>parse({...a,attempts:[{
      ...a.attempts[0],source_ref:"Bearer secret",
    },a.attempts[1]]})).toThrow();
  });
});
