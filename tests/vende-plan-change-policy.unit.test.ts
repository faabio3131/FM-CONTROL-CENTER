import {describe,it,expect} from "vitest";
import {requireVendePlanChange} from "../src/domain/billing/vende-plan-change-policy";
const old=[
  {resource:"ai.requests",scope:"tenant" as const,limitUnits:100,windowSeconds:86400},
  {resource:"ai.total_tokens",scope:"tenant" as const,limitUnits:10000,windowSeconds:86400},
];
const increased=old.map(a=>({...a,limitUnits:a.limitUnits*2}));
const a={oldPlanCode:"BASE",newPlanCode:"PLUS",oldPriceMinor:10000,newPriceMinor:20000,
  oldInterval:"monthly",newInterval:"monthly",
  oldAllowances:old,newAllowances:increased};
describe("B1.16 directional FM quota and price dominance",()=>{
  it("allows strictly better quotas and higher FM price as upgrade",()=>{
    expect(requireVendePlanChange("APPLY_UPGRADE",a)).toBe(true);
  });
  it("allows strictly fewer quotas and lower FM price as downgrade",()=>{
    expect(requireVendePlanChange("APPLY_DOWNGRADE",{
      ...a,oldPlanCode:"PLUS",newPlanCode:"BASE",
      oldPriceMinor:20000,newPriceMinor:10000,
      oldAllowances:increased,newAllowances:old,
    })).toBe(true);
  });
  it("rejects incomparable quotas, same plan, price reversal, changed cycle and missing AI meter",()=>{
    for(const invalid of [
      {...a,newAllowances:[{...old[0],limitUnits:200},old[1]]},
      {...a,newAllowances:[{...old[0],limitUnits:200},{...old[1],limitUnits:5000}]},
      {...a,newPlanCode:"BASE"},{...a,newPriceMinor:9000},
      {...a,newInterval:"yearly"},{...a,newAllowances:old},
      {...a,newAllowances:[increased[0]]},
      {...a,newAllowances:[increased[0],increased[0]]},
    ])expect(()=>requireVendePlanChange("APPLY_UPGRADE",invalid)).toThrow();
  });
});
