import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { verifyPasswordStepUp, StepUpRequiredError } from "@/application/security/password-step-up";
import { requirePermission, AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { BodyTooLargeError, readLimitedBody } from "@/infrastructure/http/read-limited-body";
import { configureIronCaktoRoute } from "@/infrastructure/billing/postgres-iron-cakto-route";

export const dynamic = "force-dynamic";
const IRON_CAKTO_ROUTE_APPROVAL = "VINCULAR_CAKTO_IRON";

/** Cakto runtime must already hold the seller READ credentials, catalog and webhook secret. */
function caktoRuntimeConfigured(env: NodeJS.ProcessEnv) {
  return Boolean(env.FMCC_CAKTO_READ_CLIENT_ID?.trim() && env.FMCC_CAKTO_READ_CLIENT_SECRET?.trim() &&
    env.FMCC_CAKTO_CHECKOUTS_JSON?.trim() && (env.FMCC_CAKTO_WEBHOOK_SECRET?.trim().length ?? 0) >= 24);
}

export async function POST(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  try {
    const requestHeaders = await headers();
    const context = await resolveTenantContext(requestHeaders);
    requirePermission(context, "billing:write");
    const { productId } = await params;
    if ((context.role !== "owner" && context.role !== "admin") ||
        context.tenantId !== process.env.FMCC_IRON_BILLING_TENANT_ID || productId !== process.env.FMCC_IRON_PRODUCT_ID)
      return NextResponse.json({ error: "billing.iron_cakto_scope_denied" }, { status: 403 });
    let raw: unknown;
    try { raw = JSON.parse(await readLimitedBody(request, 2048)); }
    catch (error) { return NextResponse.json({ error: "billing.iron_cakto_input_invalid" }, { status: error instanceof BodyTooLargeError ? 413 : 400 }); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return NextResponse.json({ error: "billing.iron_cakto_input_invalid" }, { status: 400 });
    const body = raw as Record<string, unknown>;
    if (Object.keys(body).length !== 2 || body.approval !== IRON_CAKTO_ROUTE_APPROVAL ||
        typeof body.password !== "string" || !body.password.trim())
      return NextResponse.json({ error: "billing.iron_cakto_approval_required" }, { status: 400 });
    if (!caktoRuntimeConfigured(process.env))
      return NextResponse.json({ error: "billing.iron_cakto_runtime_not_configured" }, { status: 409 });
    const proof = await verifyPasswordStepUp(requestHeaders, body.password);
    if (proof.userId !== context.userId)
      return NextResponse.json({ error: "security.step_up_required" }, { status: 403 });
    const outcome = await configureIronCaktoRoute(context, productId);
    return NextResponse.json(outcome, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return NextResponse.json({ error: "security.authentication_required" }, { status: 401 });
    if (error instanceof PermissionDeniedError || error instanceof TenantScopeRequiredError || error instanceof StepUpRequiredError)
      return NextResponse.json({ error: "security.step_up_required" }, { status: 403 });
    const code = error instanceof Error ? error.message : "";
    const allowed = ["billing.iron_cakto_scope_denied", "billing.iron_cakto_account_ambiguous",
      "billing.iron_cakto_account_not_enabled", "billing.iron_cakto_route_conflict"];
    return NextResponse.json({ error: allowed.includes(code) ? code : "billing.iron_cakto_route_unavailable" }, { status: 409 });
  }
}
