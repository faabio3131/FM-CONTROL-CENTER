import {createHmac} from "node:crypto";
import {describe,expect,it} from "vitest";
import {
  commandCoreFinopsConfig,CORE_FINOPS_REPORT_PATH,
  CORE_FINOPS_REPORT_SCHEMA,parseCoreFinopsReport,signCommandCoreFinops,
  validateFinopsPeriod,
} from "../src/application/billing/vende-core-finops-reader";

const expected={tenantId:"customer-a",unitId:"unit-a",from:"2026-10-01",to:"2026-10-22"};
const bucket={
  day:"2026-10-21",provider:"gemini",model:"synthetic",
  capability:"atendimento_interpretacao",outcome:"success",currency:"USD",
  attempts:2,fallback_attempts:1,input_tokens_observed:145,
  output_tokens_observed:20,cached_tokens_observed:10,
  token_counters_complete:false,latency_ms_total:250,latency_ms_max:170,
  known_cost_events:1,unknown_cost_events:1,
  known_cost_subtotal:"0.00120",actual_provider_spend_verified:false,
};
const report={
  schema:CORE_FINOPS_REPORT_SCHEMA,tenant_id:expected.tenantId,unit_id:expected.unitId,
  start_date:expected.from,end_date:expected.to,buckets:[bucket],
  known_attempts:1,unknown_attempts:1,coverage:"partial_unknown_costs",
  internal_fm_cost_only:true,actual_provider_spend_verified:false,
  commercial_revenue_included:false,
};
describe("FM F9 read-only Core FinOps bridge",()=>{
  it("signs exact method/path/body with SHA256 and no customer secret",()=>{
    const key="synthetic-finops-transport-secret-32-plus-characters";
    const body='{"schema":"fm.core.finops.read.v1"}';
    expect(signCommandCoreFinops(key,body)).toBe(createHmac("sha256",key)
      .update("POST\n"+CORE_FINOPS_REPORT_PATH+"\n"+body).digest("hex"));
  });
  it("rejects enabled status with missing credentials or unsafe URLs",()=>{
    expect(()=>commandCoreFinopsConfig({FM_COMMAND_CORE_FINOPS_ENABLED:"false"})).toThrow();
    for(const origin of ["http://core.test/","https://operator:secret@core.test/",
      "https://core.test/path","https://core.test/?token=x"]){
      expect(()=>commandCoreFinopsConfig({
        FM_COMMAND_CORE_FINOPS_ENABLED:"true",
        FM_COMMAND_CORE_FINOPS_ORIGIN:origin,
        FM_COMMAND_CORE_FINOPS_SECRET:"x".repeat(32),
      })).toThrow();
    }
    expect(commandCoreFinopsConfig({
      FM_COMMAND_CORE_FINOPS_ENABLED:"true",
      FM_COMMAND_CORE_FINOPS_ORIGIN:"https://core.example.test/",
      FM_COMMAND_CORE_FINOPS_SECRET:"x".repeat(32),
    }).origin).toBe("https://core.example.test");
  });
  it("rejects wrong date, future period and overlong windows",()=>{
    const now=new Date("2026-10-22T12:00:00Z");
    expect(()=>validateFinopsPeriod("2026-10-01","2026-10-22",now)).not.toThrow();
    for(const [start,end] of [
      ["2026-09-01","2026-10-22"],["2026-10-23","2026-10-23"],
      ["2026-10-22","2026-10-21"],["2026-02-30","2026-03-01"],
      ["2026-10-20","2026-10-23"],
    ])expect(()=>validateFinopsPeriod(start,end,now)).toThrow();
  });
  it("preserves known subtotal, unknown attempts and trustworthy scope",()=>{
    const parsed=parseCoreFinopsReport(report,expected);
    expect(parsed.known_attempts).toBe(1);
    expect(parsed.unknown_attempts).toBe(1);
    expect(parsed.coverage).toBe("partial_unknown_costs");
    expect(parsed.buckets[0].known_cost_subtotal).toBe("0.00120");
    expect(parsed.actual_provider_spend_verified).toBe(false);
  });
  it("strips untrusted provider metadata from an otherwise valid response",()=>{
    const parsed=parseCoreFinopsReport({
      ...report,buckets:[{...bucket,externalCustomerSecret:"LEAK-SECRET"}],
      arbitraryApiToken:"SHOULD-NOT-APPEAR",
    },expected);
    expect(JSON.stringify(parsed)).not.toContain("LEAK-SECRET");
    expect(JSON.stringify(parsed)).not.toContain("SHOULD-NOT-APPEAR");
  });
  it("never trusts contradictory scope, spend, currency or totals",()=>{
    const invalid=[
      {...report,tenant_id:"other-tenant"},
      {...report,unit_id:"other-unit"},
      {...report,actual_provider_spend_verified:true},
      {...report,internal_fm_cost_only:false},
      {...report,commercial_revenue_included:true},
      {...report,known_attempts:2},
      {...report,unknown_attempts:0},
      {...report,coverage:"priced_internal_observations"},
      {...report,buckets:[{...bucket,currency:"constructor"}]},
      {...report,buckets:[{...bucket,known_cost_subtotal:"-1"}]},
      {...report,buckets:[{...bucket,known_cost_subtotal:"NaN"}]},
      {...report,buckets:[{...bucket,token_counters_complete:true}]},
      {...report,buckets:[{...bucket,cached_tokens_observed:160}]},
      {...report,buckets:[{...bucket,attempts:1}]},
      {...report,buckets:[{...bucket,fallback_attempts:3}]},
      {...report,buckets:[{...bucket,day:"2026-11-01"}]},
      {...report,buckets:[{...bucket,day:"2026-10-21",unknown_cost_events:-1}]},
      null,[],0,
    ];
    for(const candidate of invalid)
      expect(()=>parseCoreFinopsReport(candidate,expected)).toThrow("vende.finops.unavailable");
  });
  it("does not assert a certified zero on empty ledger",()=>{
    const empty=parseCoreFinopsReport({
      ...report,known_attempts:0,unknown_attempts:0,buckets:[],
      coverage:"no_observations",
    },expected);
    expect(empty.coverage).toBe("no_observations");
    expect(empty.actual_provider_spend_verified).toBe(false);
  });
});
