import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/application/audit/record-audit-event";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { StepUpRequiredError, verifyPasswordStepUp } from "@/application/security/password-step-up";
import { AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { requirePermission } from "@/domain/security/tenant-context";
import {
  IronCommercialPlanActivationError,
  parseIronPlanActivationInput,
} from "@/domain/billing/iron-commercial-plan-activation";
import { IronPlanMappingError } from "@/domain/billing/iron-versioned-plan-mapping";
import { PostgresIronPlanMappingRepository } from "@/infrastructure/billing/postgres-iron-plan-mapping-repository";
import { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import { IronCommercialConnector } from "@/infrastructure/integration/iron-commercial-connector";

export const dynamic = "force-dynamic";

/**
 * Human-approved change of the FM price catalog only. Billing FM->academy
 * remains in Command, while IRON retains its canonical plan/entitlement model.
 */
export async function POST(
  request: Request, { params }: { params: Promise<{ productId: string }> },
) {
  let context: Awaited<ReturnType<typeof resolveTenantContext>> | undefined;
  try {
    const requestHeaders = await headers();
    context = await resolveTenantContext(requestHeaders);
    requirePermission(context, "billing:write");
    if (context.role !== "owner" && context.role !== "admin") {
      return NextResponse.json({ error: "billing.admin_required" }, { status: 403 });
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "billing.iron_activation_input_invalid" }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;
    if (payload.approval !== "ATIVAR" || typeof payload.password !== "string" ||
        !payload.password.trim()) {
      return NextResponse.json({ error: "billing.iron_activation_explicit_approval_required" }, { status: 400 });
    }
    const input = parseIronPlanActivationInput(payload);
    const proof = await verifyPasswordStepUp(requestHeaders, payload.password);
    if (proof.userId !== context.userId) {
      return NextResponse.json({ error: "security.step_up_required" }, { status: 403 });
    }

    const { productId } = await params;
    const sources = (await new PostgresSourceRepository().list(context.tenantId)).filter(
      source => source.productId === productId &&
        source.sourceType === "iron-commercial-v1" &&
        source.name === "IRON FIT CORE Commercial" &&
        source.authoritativeDomain === "commercial",
    );
    if (sources.length !== 1) {
      return NextResponse.json({ error: "billing.iron_activation_source_ambiguous" }, { status: 409 });
    }
    const source = sources[0];
    const catalog = await new IronCommercialConnector().publishedPlanVersions({
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      timeoutMs: 8000,
    }, source);
    const asOf = Date.parse(catalog.asOf);
    if (catalog.truncated || !Number.isFinite(asOf) ||
        asOf < Date.now() - 300_000 || asOf > Date.now() + 30_000) {
      return NextResponse.json({ error: "billing.iron_activation_catalog_unverifiable" }, { status: 409 });
    }
    const published = catalog.plans.find(plan =>
      plan.planCode === input.expectedIronPlanCode &&
      plan.version === input.expectedIronPlanVersion,
    );
    if (!published) {
      return NextResponse.json({ error: "billing.iron_activation_version_not_published" }, { status: 409 });
    }

    const outcome = await new PostgresIronPlanMappingRepository().activateCommercialPlan(
      context.tenantId, productId, source.id, input, published,
    );
    await recordAuditEvent(context, {
      action: "billing.iron_commercial_plan.activate",
      resourceType: "billing_product_plan",
      resourceId: outcome.plan.id,
      result: "success",
      metadata: {
        productId, commercialPlanCode: outcome.plan.planCode,
        amountMinor: outcome.plan.amountMinor, ironPlanCode: published.planCode,
        ironPlanVersion: published.version,
        mappingRevision: input.expectedMappingRevision,
        changed: outcome.changed,
      },
    });
    return NextResponse.json(outcome, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (context) {
      await recordAuditEvent(context, {
        action: "billing.iron_commercial_plan.activate",
        resourceType: "billing_product_plan",
        result: "failure",
        metadata: { errorType: error instanceof Error ? error.name : "unknown" },
      }).catch(() => undefined);
    }
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "security.authentication_required" }, { status: 401 });
    }
    if (error instanceof PermissionDeniedError ||
        error instanceof TenantScopeRequiredError ||
        error instanceof StepUpRequiredError) {
      return NextResponse.json({ error: "security.activation_access_denied" }, { status: 403 });
    }
    if (error instanceof IronCommercialPlanActivationError ||
        error instanceof IronPlanMappingError) {
      return NextResponse.json({ error: error.message }, {
        status: error.message === "billing.iron_activation_input_invalid" ? 400 : 409,
      });
    }
    // No payment/provider action is retried implicitly on ambiguous failures.
    return NextResponse.json({ error: "billing.iron_activation_denied_or_unavailable" }, { status: 503 });
  }
}
