import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), stepUp: vi.fn(), configure: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("../src/application/security/resolve-tenant-context", () => ({ resolveTenantContext: mocks.context }));
vi.mock("../src/application/security/password-step-up", () => ({
  verifyPasswordStepUp: mocks.stepUp, StepUpRequiredError: class extends Error {},
}));
vi.mock("../src/infrastructure/billing/postgres-iron-cakto-route", () => ({ configureIronCaktoRoute: mocks.configure }));

import { POST } from "../src/app/api/billing/products/[productId]/iron-cakto-route/route";

const TENANT = "fm-tenant", PRODUCT = "784c4ad0-7d31-40c4-8160-91261e486b04";
const call = (body: unknown, productId = PRODUCT) => POST(new Request("http://localhost/x", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ productId }) });
const valid = { approval: "VINCULAR_CAKTO_IRON", password: "senha-forte" };

describe("IRON Cakto receiving account route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, { FMCC_IRON_BILLING_TENANT_ID: TENANT, FMCC_IRON_PRODUCT_ID: PRODUCT,
      FMCC_CAKTO_READ_CLIENT_ID: "id", FMCC_CAKTO_READ_CLIENT_SECRET: "secret", FMCC_CAKTO_CHECKOUTS_JSON: "{}",
      FMCC_CAKTO_WEBHOOK_SECRET: "w".repeat(32) });
    mocks.context.mockResolvedValue({ tenantId: TENANT, userId: "u1", role: "owner", permissions: ["billing:write"],
      correlationId: "c1" });
    mocks.stepUp.mockResolvedValue({ userId: "u1" });
    mocks.configure.mockResolvedValue({ provider: "cakto", environment: "production", status: "enabled",
      accountCreated: true, routeChanged: true, paymentExecuted: false });
  });

  it("configures the route only with explicit approval and the same actor's password", async () => {
    const ok = await call(valid);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ provider: "cakto", paymentExecuted: false });
    expect(mocks.configure).toHaveBeenCalledTimes(1);
  });

  it("refuses missing approval, extra fields, other products and other tenants before any write", async () => {
    expect((await call({ password: "x" })).status).toBe(400);
    expect((await call({ ...valid, gatewayAccountId: "x" })).status).toBe(400);
    expect((await call(valid, "11111111-2222-4333-8444-555555555555")).status).toBe(403);
    mocks.context.mockResolvedValueOnce({ tenantId: "other", userId: "u1", role: "owner", permissions: ["billing:write"] });
    expect((await call(valid)).status).toBe(403);
    expect(mocks.configure).not.toHaveBeenCalled();
  });

  it("refuses when the step-up belongs to another user or Cakto runtime is not configured", async () => {
    mocks.stepUp.mockResolvedValueOnce({ userId: "intruder" });
    expect((await call(valid)).status).toBe(403);
    delete process.env.FMCC_CAKTO_READ_CLIENT_SECRET;
    const res = await call(valid);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "billing.iron_cakto_runtime_not_configured" });
    expect(mocks.configure).not.toHaveBeenCalled();
  });

  it("never echoes unexpected internal errors", async () => {
    mocks.configure.mockRejectedValueOnce(new Error("duplicate key value violates unique constraint secret"));
    const res = await call(valid);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "billing.iron_cakto_route_unavailable" });
  });
});
