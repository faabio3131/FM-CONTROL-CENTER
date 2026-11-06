import { describe, expect, it } from "vitest";
import {
  projectOperationalUsage, quotaView,
} from "@/application/integration/universal-usage-projection";

describe("C07 universal SaaS operational reporting", () => {
  const bounded = { metricId:"fiscal.documents_authorized",unit:"count" as const,
    quantity: 90, limitStatus:"bounded" as const, limit:100 };
  it("retains the SaaS-supplied denominator and warns at 70%, critical at 100%", () => {
    expect(quotaView(bounded)).toMatchObject({percentage:90,severity:"warning"});
    expect(quotaView({...bounded,quantity:0})).toMatchObject({percentage:0,severity:"normal"});
    expect(quotaView({...bounded,quantity:100})).toMatchObject({percentage:100,severity:"critical"});
    expect(quotaView({...bounded,quantity:120})).toMatchObject({percentage:120,severity:"critical"});
  });
  it("never converts unknown or unlimited to a numeric percentage", () => {
    expect(quotaView({...bounded,limitStatus:"unknown",limit:null})).toMatchObject({
      percentage:null,severity:"unknown",
    });
    expect(quotaView({...bounded,limitStatus:"unlimited",limit:null})).toMatchObject({
      percentage:null,severity:"unknown",
    });
  });
  it("treats a zero quota as blocked rather than divide-by-zero", () => {
    expect(quotaView({...bounded,limit:0,quantity:1})).toMatchObject({
      percentage:null,severity:"critical",
    });
    expect(quotaView({...bounded,limit:0,quantity:0})).toMatchObject({
      percentage:null,severity:"warning",
    });
  });
  it("reads only explicitly approved non-financial properties", () => {
    const result=projectOperationalUsage({
      externalTenantRef:"customer-opaque",periodStart:"2026-11-01T00:00:00Z",
      periodEnd:"2026-11-30T23:59:59Z",metrics:[bounded],
      paymentCard:"SECRET",financialInvoice:430,price:190,
    });
    expect(result?.metrics[0]).toEqual(bounded);
    const text=JSON.stringify(result);
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("financialInvoice");
  });
  it("rejects invalid persisted counters, quota status and external tenant PII", () => {
    const base={externalTenantRef:"tenant-1",periodStart:"2026-11-01T00:00:00Z",
      periodEnd:"2026-11-30T00:00:00Z", metrics:[bounded]};
    expect(projectOperationalUsage({...base,externalTenantRef:"client@example.com"})).toBeNull();
    expect(projectOperationalUsage({...base,metrics:[{...bounded,quantity:-1}]})).toBeNull();
    expect(projectOperationalUsage({...base,metrics:[{...bounded,limitStatus:"unlimited",limit:100}]})).toBeNull();
    expect(projectOperationalUsage({...base,metrics:"untrusted"})).toBeNull();
  });
});
