import { describe, expect, it, vi } from "vitest";
import { LivePulseService } from "@/application/live/live-pulse-service";
import { nextDelayMs, pulseSource, shouldRefresh } from "@/domain/live/pulse";
import type { TenantContext } from "@/domain/security/tenant-context";

const context = (tenantId: string, role: TenantContext["role"] = "owner"): TenantContext => ({
  tenantId, userId: "user-1", role, correlationId: "test-1",
});

describe("Command V2 selective port — Live Pulse isolation", () => {
  it("returns an opaque, deterministic token without raw dates or tenant id", async () => {
    const repo = { latestForTenant: vi.fn(async () => ({ metricsLatest: 1234, auditLatest: 2345 })) };
    const service = new LivePulseService(repo);
    const t1 = await service.pulse(context("org-a"));
    const t2 = await service.pulse(context("org-a"));
    const t3 = await service.pulse(context("org-b"));
    expect(t1).toEqual(t2);
    expect(t1.token).toMatch(/^[0-9a-f]{24}$/);
    expect(t1.token).not.toContain("org-a");
    expect(t3.token).not.toEqual(t1.token);
    expect(repo.latestForTenant).toHaveBeenNthCalledWith(1, "org-a", true);
    expect(repo.latestForTenant).toHaveBeenNthCalledWith(3, "org-b", true);
  });
  it("does not even request audit data for viewer/member roles", async () => {
    const repo = { latestForTenant: vi.fn(async (_tenant: string, includeAudit: boolean) => ({
      metricsLatest: 111, auditLatest: includeAudit ? 444 : null,
    })) };
    const service = new LivePulseService(repo);
    const viewer = await service.pulse(context("org-a", "viewer"));
    const owner = await service.pulse(context("org-a", "owner"));
    expect(repo.latestForTenant).toHaveBeenNthCalledWith(1, "org-a", false);
    expect(repo.latestForTenant).toHaveBeenNthCalledWith(2, "org-a", true);
    expect(viewer.token).not.toBe(owner.token);
  });
  it("does not refresh on the first observation and uses capped backoff", () => {
    expect(shouldRefresh(null, "abc")).toBe(false);
    expect(shouldRefresh("abc", "abc")).toBe(false);
    expect(shouldRefresh("abc", "def")).toBe(true);
    expect(nextDelayMs(0)).toBe(5000);
    expect(nextDelayMs(1)).toBe(10000);
    expect(nextDelayMs(25)).toBe(60000);
    expect(pulseSource({metricsLatest:null,auditLatest:null})).toBe("m:-|a:-");
  });
  it("changes token when an authorized timestamp advances", async () => {
    let timestamp = 100;
    const service = new LivePulseService({
      async latestForTenant() { return {metricsLatest:timestamp, auditLatest:null}; },
    });
    const earlier = (await service.pulse(context("org-a"))).token;
    timestamp = 101;
    const later = (await service.pulse(context("org-a"))).token;
    expect(later).not.toEqual(earlier);
  });
});
