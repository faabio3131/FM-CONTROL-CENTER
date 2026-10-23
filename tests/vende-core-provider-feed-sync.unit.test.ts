import {describe,expect,it} from "vitest";
import {validateProviderFeedSyncRequest}
  from "@/application/billing/vende-core-provider-exports";

const input={
  provider:"openai",accountRef:"fm-provider-account",
  startDate:"2026-10-01",endDate:"2026-10-23",page:0,limit:25,
};
describe("F3 governed provider report sync admission",()=>{
  it("permits bounded collection by configured source",()=>{
    expect(()=>validateProviderFeedSyncRequest(input)).not.toThrow();
    expect(()=>validateProviderFeedSyncRequest({...input,page:20000,limit:50}))
      .not.toThrow();
  });
  it.each([
    {provider:"https://evil.example"},
    {accountRef:"../secret"},
    {startDate:"2026-02-30"},
    {startDate:"2026-10-24"},
    {endDate:"2027-12-25"},
    {page:-1},
    {page:20001},
    {page:0.1},
    {limit:0},
    {limit:51},
    {limit:NaN},
  ])("rejects malformed or unbounded scope %j",change=>{
    expect(()=>validateProviderFeedSyncRequest({...input,...change}))
      .toThrow("vende.finops.provider_export_unavailable");
  });
});
