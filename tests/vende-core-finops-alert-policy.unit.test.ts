import {describe,expect,it} from "vitest";
import {commandCoreFinopsAlertPolicyConfig}
  from "../src/application/billing/vende-core-finops-policy";

const valid={
  FM_COMMAND_CORE_ALERT_POLICY_ENABLED:"true",
  FM_COMMAND_CORE_ALERT_POLICY_ORIGIN:"https://core.fm.example/",
  FM_COMMAND_CORE_ALERT_POLICY_READER_KEY:"read-".repeat(9),
  FM_COMMAND_CORE_ALERT_POLICY_TRANSPORT_KEY:"write-".repeat(9),
  FM_COMMAND_CORE_ALERT_POLICY_PRIVATE_KEY_PEM:"synthetic-config-only-"+"x".repeat(100),
  FM_COMMAND_CORE_ALERT_POLICY_ISSUER:"fm-command",
  FM_COMMAND_CORE_ALERT_POLICY_AUDIENCE:"fm-core-recovery",
  FM_COMMAND_PLATFORM_ORGANIZATION_ID:"fm-corporate",
};

describe("FM FinOps alert policies require explicit, segregated configuration",()=>{
  it("defaults OFF and rejects incomplete, unsafe or reused authentication",()=>{
    expect(()=>commandCoreFinopsAlertPolicyConfig({
      FM_COMMAND_CORE_ALERT_POLICY_ENABLED:"false",
    })).toThrow();
    for(const changed of [
      {FM_COMMAND_CORE_ALERT_POLICY_ORIGIN:"http://core.fm.example/"},
      {FM_COMMAND_CORE_ALERT_POLICY_ORIGIN:"https://core.fm.example/path"},
      {FM_COMMAND_CORE_ALERT_POLICY_ORIGIN:"https://user:secret@core.fm.example/"},
      {FM_COMMAND_CORE_ALERT_POLICY_ORIGIN:"https://core.fm.example/?a=1"},
      {FM_COMMAND_CORE_ALERT_POLICY_READER_KEY:"weak"},
      {FM_COMMAND_CORE_ALERT_POLICY_TRANSPORT_KEY:valid.FM_COMMAND_CORE_ALERT_POLICY_READER_KEY},
      {FM_COMMAND_CORE_ALERT_POLICY_PRIVATE_KEY_PEM:"x"},
      {FM_COMMAND_CORE_ALERT_POLICY_ISSUER:"wrong issuer"},
      {FM_COMMAND_PLATFORM_ORGANIZATION_ID:""},
    ])expect(()=>commandCoreFinopsAlertPolicyConfig({...valid,...changed})).toThrow();
    expect(commandCoreFinopsAlertPolicyConfig(valid).origin)
      .toBe("https://core.fm.example");
  });
});
