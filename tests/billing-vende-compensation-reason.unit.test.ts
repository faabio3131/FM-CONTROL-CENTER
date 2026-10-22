import {describe,expect,it} from "vitest";
import {knownVendeRiskReason} from "../src/application/billing/vende-compensation-review";

describe("Vende compensation risk presentation",()=>{
  it("keeps documented audit incident categories",()=>{
    expect(knownVendeRiskReason("delinquency_paid_after_delivery"))
      .toBe("delinquency_paid_after_delivery");
    expect(knownVendeRiskReason("reactivation_payment_reversed_after_delivery"))
      .toBe("reactivation_payment_reversed_after_delivery");
    expect(knownVendeRiskReason("suspension_unconfirmed"))
      .toBe("suspension_unconfirmed");
  });
  it("does not surface arbitrary audit strings or unknown shapes",()=>{
    expect(knownVendeRiskReason("<script>alert(1)</script>"))
      .toBe("unspecified");
    expect(knownVendeRiskReason("unrecognized_psp_details_and_identifiers"))
      .toBe("unspecified");
    expect(knownVendeRiskReason(null)).toBe("unspecified");
    expect(knownVendeRiskReason({reason:"suspension_unconfirmed"}))
      .toBe("unspecified");
  });
});
