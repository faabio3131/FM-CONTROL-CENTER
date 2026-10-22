import {describe,expect,it} from "vitest";
import {verifyVendeRemoteStatus} from "../src/application/billing/vende-c06-delivery";

const scope="tenant-a";
const valid={
  tenant_id:scope,operation_status:"applied",
  applied_action:"SUSPEND_DELINQUENCY",license_status:"suspended",
  plan_code:"BASE",plan_revision:5,valid_until:1780000000,
};
const checked=(value:unknown)=>verifyVendeRemoteStatus(value,scope);

describe("P01 C06 commercial readback must fail closed on forged status",()=>{
  it("accepts correctly scoped applied and not-applied reports",()=>{
    expect(checked(valid)).toEqual(valid);
    expect(checked({...valid,operation_status:"not_applied",applied_action:null,
      license_status:"active"}).operation_status).toBe("not_applied");
    for(const action of [
      "REACTIVATE_VERIFIED","RENEW_VERIFIED","APPLY_UPGRADE",
      "APPLY_DOWNGRADE","CANCEL_AT_PERIOD_END",
    ])expect(checked({...valid,applied_action:action}).applied_action).toBe(action);
  });
  it.each([
    null,undefined,true,[],1,"applied",
    {...valid,tenant_id:"tenant-b"},
    {...valid,tenant_id:12},
    {...valid,operation_status:"applied",applied_action:null},
    {...valid,operation_status:"not_applied",applied_action:"SUSPEND_DELINQUENCY"},
    {...valid,operation_status:"applied",applied_action:"REFUND_EXECUTED"},
    {...valid,license_status:"ACTIVE"},
    {...valid,license_status:0},
    {...valid,plan_code:""},
    {...valid,plan_code:"../internal"},
    {...valid,plan_code:"A".repeat(129)},
    {...valid,plan_code:null},
    {...valid,plan_revision:true},
    {...valid,plan_revision:1.5},
    {...valid,plan_revision:0},
    {...valid,plan_revision:-1},
    {...valid,plan_revision:"5"},
    {...valid,valid_until:0},
    {...valid,valid_until:-1},
    {...valid,valid_until:1.5},
    {...valid,valid_until:true},
    {...valid,valid_until:"1780000000"},
    {...valid,valid_until:Number.MAX_SAFE_INTEGER+1},
  ])("rejects untrusted Assistant C06 readback %#",value=>{
    expect(()=>checked(value)).toThrow("vende.commercial_delivery_unavailable");
  });
});
