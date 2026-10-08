import { describe, expect, it } from "vitest";
import { applyLicenseUpdate, mayServeDuringOutage, validateLicense, type CommercialLicense } from "../src/domain/billing-central/license";

const id = (last: string) => "018f51b2-78c4-7b32-8a11-" + last;
const license: CommercialLicense = {
  customerId: id("000000000001"), subscriptionId: id("000000000002"), licenseId: id("000000000003"),
  productCode: "ATENDEVENDEIA", planCode: "basic", version: 1, state: "active",
  validFrom: "2026-10-01T00:00:00.000Z", validUntil: "2026-11-01T00:00:00.000Z", graceEndsAt: null,
};
const update = (l: CommercialLicense, eventId = "evt-1") => ({ eventId, occurredAt: "2026-10-08T00:00:00.000Z", license: l });

describe("Billing Central license domain", () => {
  it("requires Command-issued UUIDv7-shaped identifiers", () => {
    expect(validateLicense(license)).toBeNull();
    expect(validateLicense({ ...license, customerId: "customer@example.com" })).toBe("invalid_command_id");
  });
  it("accepts a first valid version and newer state", () => {
    expect(applyLicenseUpdate(null, update(license), new Set()).outcome).toBe("applied");
    expect(applyLicenseUpdate(license, update({ ...license, version: 2, state: "suspended" }, "evt-2"), new Set()).outcome).toBe("applied");
  });
  it("does not apply duplicate or stale updates", () => {
    expect(applyLicenseUpdate(license, update(license), new Set(["evt-1"])).outcome).toBe("duplicate");
    expect(applyLicenseUpdate({ ...license, version: 3 }, update(license, "old"), new Set()).outcome).toBe("stale");
  });
  it("rejects cross-customer or cross-product reassignment", () => {
    expect(applyLicenseUpdate(license, update({ ...license, version: 2, customerId: id("000000000004") }), new Set()).outcome).toBe("rejected");
    expect(applyLicenseUpdate(license, update({ ...license, version: 2, productCode: "KORDENA" }), new Set()).outcome).toBe("rejected");
  });
  it("prevents revoked states from being reactivated by outage contingency", () => {
    for (const state of ["suspended", "canceled", "refunded", "expired"] as const) {
      expect(mayServeDuringOutage({ license: { ...license, state }, now: "2026-11-02T00:00:00Z", lastValidatedAt: "2026-10-30T00:00:00Z", contingencyStartedAt: "2026-11-01T00:00:00Z", contingencyUntil: "2026-11-04T00:00:00Z" })).toBe(false);
    }
  });
  it("limits persisted contingency to 72 hours without restart extension", () => {
    const base = { license, lastValidatedAt: "2026-10-30T00:00:00Z", contingencyStartedAt: "2026-11-01T00:00:00Z" };
    expect(mayServeDuringOutage({ ...base, now: "2026-11-03T00:00:00Z", contingencyUntil: "2026-11-04T00:00:00Z" })).toBe(true);
    expect(mayServeDuringOutage({ ...base, now: "2026-11-04T00:00:01Z", contingencyUntil: "2026-11-04T00:00:00Z" })).toBe(false);
    expect(mayServeDuringOutage({ ...base, now: "2026-11-03T00:00:00Z", contingencyUntil: "2026-11-05T00:00:00Z" })).toBe(false);
    expect(mayServeDuringOutage({ ...base, now: "2026-11-03T00:00:00Z", contingencyStartedAt: null, contingencyUntil: null })).toBe(false);
  });
});
