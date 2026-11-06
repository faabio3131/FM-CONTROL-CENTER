import { describe, expect, it } from "vitest";
import { comparableBars, countBars } from "@/domain/metrics/dashboard-visuals";

describe("Command V2 selective port — governable charts", () => {
  it("never turns absent health signals into zero", () => {
    const bars = countBars([{ id: "a", label: "Operacionais", count: 0 }], false);
    expect(bars).toEqual([{ id: "a", label: "Operacionais", valueText: null, widthPercent: "0" }]);
  });
  it("recognizes measured zero when an authoritative source exists", () => {
    const bars = countBars([
      { id: "a", label: "Operacionais", count: 0 },
      { id: "b", label: "Degradados", count: 4 },
    ], true);
    expect(bars.map((x) => [x.valueText, x.widthPercent])).toEqual([["0","0"],["4","100"]]);
  });
  it("rejects negative and impossible counts rather than fabricating widths", () => {
    expect(countBars([{id:"a",label:"A",count:-1}], true)[0]?.valueText).toBeNull();
    expect(countBars([{id:"a",label:"A",count:NaN}], true)[0]?.valueText).toBeNull();
  });
  const rows = [
    { product: { id: "p1", name: "NFCore" }, value: { value: "24", unit: "count" } },
    { product: { id: "p2", name: "IRON" }, value: { value: "48", unit: "count" } },
  ];
  it("compares numeric product values without modifying the authoritative text", () => {
    const bars = comparableBars(rows);
    expect(bars?.map((v) => [v.label,v.valueText,v.widthPercent])).toEqual([
      ["NFCore", "24", "50"], ["IRON", "48", "100"],
    ]);
  });
  it("refuses charts for missing or invalid values", () => {
    expect(comparableBars([{...rows[0],value:null}, rows[1]])).toBeNull();
    expect(comparableBars([{...rows[0],value:{value:"100.2x",unit:"count"}},rows[1]])).toBeNull();
    expect(comparableBars([{...rows[0],value:{value:"-4",unit:"count"}},rows[1]])).toBeNull();
    expect(comparableBars([{...rows[0],value:{value:"1e5",unit:"count"}},rows[1]])).toBeNull();
  });
});
