import {describe,it,expect} from "vitest";
import {fmLocalCivilDate,fmPaidThroughExclusiveInstant} from "../src/domain/billing/vende-commercial-policy-v1";
describe("governed paid-through civil boundary",()=>{
  it("preserves the complete paid day across historical DST and normal offsets",()=>{
    for(const [day,end] of [["2026-10-21","2026-10-22T03:00:00.000Z"],
      ["2018-11-04","2018-11-05T02:00:00.000Z"],["2019-02-16","2019-02-17T03:00:00.000Z"],
      ["2024-02-29","2024-03-01T03:00:00.000Z"]]){
      const boundary=fmPaidThroughExclusiveInstant(day);
      expect(boundary.toISOString()).toBe(end);
      expect(fmLocalCivilDate(new Date(boundary.getTime()-1))).toBe(day);
      expect(fmLocalCivilDate(boundary)>day).toBe(true);
    }
  });
  it("rejects impossible or injected dates",()=>{
    for(const input of ["2026-02-29","2026-04-31","2026-01-00","2026-10-21T00:00:00Z","invalid"])
      expect(()=>fmPaidThroughExclusiveInstant(input)).toThrow();
  });
});
