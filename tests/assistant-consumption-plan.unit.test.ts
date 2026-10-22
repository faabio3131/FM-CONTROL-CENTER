import { describe, expect, it } from "vitest";
import { parseConsumptionPlanDraft } from "../src/domain/billing/assistant-consumption-plan";
const good = {
  planCode:"ATENDE_V1", label:"Plano FM",
  billingInterval:"monthly", amountMinor:17990,
  allowances:[
    {resource:"ai.requests",scope:"tenant",limitUnits:100,windowSeconds:2592000},
    {resource:"ai.total_tokens",scope:"tenant",limitUnits:500000,windowSeconds:2592000},
  ],
};
describe("FM-administered plans: all features, consumption only",()=>{
  it("accepts unlimited types of functionality without gating any feature",()=>{
    const value=parseConsumptionPlanDraft(good);
    expect(value.planCode).toBe("ATENDE_V1");
    expect(value.allowances).toHaveLength(2);
    expect(value).not.toHaveProperty("features");
    expect(value).not.toHaveProperty("entitlements");
  });
  it("blocks invented feature tier switches or arbitrary metrics",()=>{
    expect(()=>parseConsumptionPlanDraft({...good,features:{crm:false}})).toThrow("plans.feature_gating_forbidden");
    expect(()=>parseConsumptionPlanDraft({...good,allowances:[...good.allowances,{resource:"crm.enabled",scope:"tenant",limitUnits:1,windowSeconds:2592000}]})).toThrow("plans.metric_invalid");
    expect(()=>parseConsumptionPlanDraft({...good,allowances:[...good.allowances,{...good.allowances[0],enabled:false}]})).toThrow("plans.feature_gating_forbidden");
  });
  it("rejects underdefined AI allowances and cross-tenant duplicate keys",()=>{
    expect(()=>parseConsumptionPlanDraft({...good,allowances:[good.allowances[0]]})).toThrow("plans.ai_limits_required");
    expect(()=>parseConsumptionPlanDraft({...good,allowances:[...good.allowances,good.allowances[0]]})).toThrow("plans.duplicate_allowance");
  });
  it.each([0,-1,1.23,NaN,Infinity])("rejects price %s",amountMinor=>{
    expect(()=>parseConsumptionPlanDraft({...good,amountMinor})).toThrow("plans.price_invalid");
  });
  it("limits all Core-signed metrics to interoperable signed-grant bounds",()=>{
    const coreMetrics=["ai.requests","ai.total_tokens","ai.input_tokens",
      "ai.output_tokens","ai.cached_tokens"] as const;
    for(const resource of coreMetrics){
      const allowances=good.allowances.map(a=>
        a.resource===resource?{...a,limitUnits:2_000_000_001}:a,
      );
      if(!allowances.some(a=>a.resource===resource))
        allowances.push({resource,scope:"tenant",limitUnits:2_000_000_001,
          windowSeconds:2_592_000});
      expect(()=>parseConsumptionPlanDraft({...good,allowances}))
        .toThrow("plans.core_quota_limit_invalid");
      const badWindow=good.allowances.map(a=>
        a.resource===resource?{...a,windowSeconds:31_536_001}:a,
      );
      if(!badWindow.some(a=>a.resource===resource))
        badWindow.push({resource,scope:"tenant",limitUnits:100,
          windowSeconds:31_536_001});
      expect(()=>parseConsumptionPlanDraft({...good,allowances:badWindow}))
        .toThrow("plans.core_quota_window_invalid");
    }
  });
  it("allows Core boundary values and larger non-Core storage allowances",()=>{
    const a=parseConsumptionPlanDraft({...good,allowances:[
      {...good.allowances[0],limitUnits:2_000_000_000,windowSeconds:31_536_000},
      {...good.allowances[1],limitUnits:2_000_000_000,windowSeconds:31_536_000},
      {resource:"storage.bytes",scope:"tenant",limitUnits:5_000_000_000,
        windowSeconds:366*86400},
    ]});
    expect(a.allowances).toHaveLength(3);
    expect(a.allowances[2].limitUnits).toBe(5_000_000_000);
  });
  it("rejects invalid windows, limits and forbidden override fields",()=>{
    expect(()=>parseConsumptionPlanDraft({...good,allowances:[
      {...good.allowances[0],limitUnits:0},good.allowances[1],
    ]})).toThrow("plans.limit_invalid");
    expect(()=>parseConsumptionPlanDraft({...good,allowances:[
      {...good.allowances[0],windowSeconds:0},good.allowances[1],
    ]})).toThrow("plans.window_invalid");
    expect(()=>parseConsumptionPlanDraft({...good,providerKey:"secret"})).toThrow("plans.feature_gating_forbidden");
  });
});
