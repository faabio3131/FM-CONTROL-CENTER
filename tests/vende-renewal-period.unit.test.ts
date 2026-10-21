import {describe,it,expect} from "vitest";
import {nextVendePaidThrough} from "../src/domain/billing/vende-renewal-period";
import {fmPaidThroughExclusiveInstant} from "../src/domain/billing/vende-commercial-policy-v1";

describe("B1.14 renewal date calculator — FM civil calendar",()=>{
  it.each([
    ["2026-01-31","monthly","2026-02-28"],
    ["2024-01-31","monthly","2024-02-29"],
    ["2024-02-29","yearly","2025-02-28"],
    ["2026-11-15","monthly","2026-12-15"],
    ["2026-12-31","monthly","2027-01-31"],
    ["2026-02-28","monthly","2026-03-31"],
  ] as const)("rolls %s %s to %s without 30-day assumptions",(old,interval,expected)=>{
    const actual=nextVendePaidThrough(old,interval);
    expect(actual.paidThrough).toBe(expected);
    expect(actual.validUntil).toBe(fmPaidThroughExclusiveInstant(expected).getTime()/1000);
  });
  it("rejects impossible/corrupt dates and billing intervals",()=>{
    for(const date of ["2026-02-30","2026-00-15","2026-13-01","not-a-day",""]) 
      expect(()=>nextVendePaidThrough(date,"monthly")).toThrow();
    expect(()=>nextVendePaidThrough("2026-10-21","weekly" as "monthly")).toThrow();
  });
});
