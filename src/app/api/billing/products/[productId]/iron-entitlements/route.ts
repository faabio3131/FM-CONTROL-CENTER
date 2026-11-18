import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/application/audit/record-audit-event";
import { ProductNotFoundError, ProductRegistryService } from "@/application/products/product-registry-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { StepUpRequiredError, verifyPasswordStepUp } from "@/application/security/password-step-up";
import { FMCC_IRON_PRODUCT_SLUG } from "@/domain/billing/iron-product-identity";
import { requirePermission } from "@/domain/security/tenant-context";
import {
  IRON_COMMERCIAL_SECRET_REF, IRON_COMMERCIAL_SOURCE_TYPE,
  IronCommercialConnector, environmentIronControlTenantId,
} from "@/infrastructure/integration/iron-commercial-connector";
import { PostgresSourceRepository } from "@/infrastructure/integration/postgres-repositories";
import { PostgresProductRepository } from "@/infrastructure/products/postgres-product-repository";

export const dynamic = "force-dynamic";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const FEATURE = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

async function authorizedSource(context: Awaited<ReturnType<typeof resolveTenantContext>>, productId: string) {
  const product = await new ProductRegistryService(new PostgresProductRepository()).get(context, productId);
  if (product.slug !== FMCC_IRON_PRODUCT_SLUG ||
      context.tenantId !== environmentIronControlTenantId()) {
    throw new Error("billing.iron_governance_scope_denied");
  }
  const sources = (await new PostgresSourceRepository().list(context.tenantId)).filter(source =>
    source.productId === productId && source.tenantId === context.tenantId &&
    source.name === "IRON FIT CORE Commercial" &&
    source.sourceType === IRON_COMMERCIAL_SOURCE_TYPE &&
    source.secretRef === IRON_COMMERCIAL_SECRET_REF &&
    source.authoritativeDomain === "commercial");
  if (sources.length !== 1) throw new Error("billing.iron_governance_source_unavailable");
  return sources[0];
}
function admin(role: string) { return role === "owner" || role === "admin"; }
function inputError() {
  return NextResponse.json({ error: "billing.iron_governance_input_invalid" }, { status: 400 });
}
function contextFor(context: Awaited<ReturnType<typeof resolveTenantContext>>) {
  return { tenantId: context.tenantId, correlationId: context.correlationId, timeoutMs: 8000 };
}

export async function GET(_request: Request, { params }: { params: Promise<{ productId: string }> }) {
  try {
    const context = await resolveTenantContext(await headers());
    requirePermission(context, "billing:read");
    if (!admin(context.role)) return NextResponse.json({ error: "billing.admin_required" }, { status: 403 });
    const { productId } = await params;
    const source = await authorizedSource(context, productId);
    return NextResponse.json(await new IronCommercialConnector().governanceCatalog(contextFor(context), source),
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ProductNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ error: "billing.iron_governance_unavailable" }, { status: 503 });
  }
}

/**
 * FM-controlled mutations must be reauthenticated (password step-up) AND
 * possess the dedicated plan-governance S2S secret. The browser never gets
 * either S2S credential. The IRON backend is the sole rule/persistence owner.
 */
export async function POST(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  let context: Awaited<ReturnType<typeof resolveTenantContext>> | undefined;
  let action = "";
  try {
    const requestHeaders = await headers();
    context = await resolveTenantContext(requestHeaders);
    requirePermission(context, "billing:write");
    if (!admin(context.role)) return NextResponse.json({ error: "billing.admin_required" }, { status: 403 });
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return inputError();
    const data = raw as Record<string, unknown>;
    if (typeof data.password !== "string" || !data.password.trim()) return inputError();
    if (typeof data.action !== "string") return inputError();
    action = data.action;
    if (!["createPlan", "createVersion", "setEntitlement", "publishVersion"].includes(action)) return inputError();

    // Reject unused/unknown fields rather than accidentally forwarding domain
    // authority from browser to S2S. Sensitive data never enters audit metadata.
    const actionFields: Record<string, readonly string[]> = {
      createPlan: ["action", "password", "code", "name", "description"],
      createVersion: ["action", "password", "planId", "version"],
      setEntitlement: ["action", "password", "planId", "version", "featureKey", "featureEnabled", "limitValue", "policyValues"],
      publishVersion: ["action", "password", "planId", "version", "confirm"],
    };
    if (Object.keys(data).some(key => !actionFields[action].includes(key))) return inputError();
    const planId = typeof data.planId === "string" && ID.test(data.planId) ? data.planId : undefined;
    const version = Number.isSafeInteger(data.version) && (data.version as number) >= 1
      ? data.version as number : undefined;
    if (action === "createPlan") {
      if (typeof data.code !== "string" || !CODE.test(data.code) ||
        typeof data.name !== "string" || data.name.trim().length < 2 ||
        data.name.length > 120 || data.description !== undefined &&
        (typeof data.description !== "string" || data.description.length > 500)) return inputError();
    } else if (!planId || !version) return inputError();

    if (action === "setEntitlement") {
      if (typeof data.featureKey !== "string" || !FEATURE.test(data.featureKey) ||
        data.featureKey.length > 160) return inputError();
      const values = [data.featureEnabled !== undefined, data.limitValue !== undefined, data.policyValues !== undefined];
      if (values.filter(Boolean).length !== 1) return inputError();
      if (data.featureEnabled !== undefined && typeof data.featureEnabled !== "boolean") return inputError();
      if (data.limitValue !== undefined && (!Number.isSafeInteger(data.limitValue) ||
        (data.limitValue as number) < 0)) return inputError();
      if (data.policyValues !== undefined && (!Array.isArray(data.policyValues) ||
        data.policyValues.length < 1 || data.policyValues.length > 50 ||
        !data.policyValues.every(v=>typeof v === "string" && CODE.test(v) && v.length <= 64) ||
        new Set(data.policyValues).size !== data.policyValues.length)) return inputError();
    }
    if (action === "publishVersion" && data.confirm !== "PUBLICAR_VERSAO_IMUTAVEL") return inputError();

    const stepUp = await verifyPasswordStepUp(requestHeaders, data.password);
    if (stepUp.userId !== context.userId) throw new StepUpRequiredError();
    const { productId } = await params;
    const source = await authorizedSource(context, productId);
    const payload: Record<string, unknown> = action === "createPlan"
      ? { code: data.code, name: data.name, ...(data.description === undefined ? {} : { description: data.description }) }
      : action === "createVersion" ? { version }
      : action === "setEntitlement" ? {
        featureKey: data.featureKey,
        ...(data.featureEnabled === undefined ? {} : { featureEnabled: data.featureEnabled }),
        ...(data.limitValue === undefined ? {} : { limitValue: data.limitValue }),
        ...(data.policyValues === undefined ? {} : { policyValues: data.policyValues }),
      } : {};
    await new IronCommercialConnector().governPlan(contextFor(context), source,
      action as "createPlan" | "createVersion" | "setEntitlement" | "publishVersion", planId, version, payload);
    await recordAuditEvent(context, {
      action: "billing.iron_plan_governance." + action,
      resourceType: "iron_product_plan", resourceId: planId,
      result: "success",
      metadata: { productId, planCode: action === "createPlan" ? data.code : undefined,
        version, featureKey: action === "setEntitlement" ? data.featureKey : undefined },
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (context) await recordAuditEvent(context, {
      action: "billing.iron_plan_governance." + (action || "unknown"),
      resourceType: "iron_product_plan", result: "failure",
      metadata: { errorType: error instanceof Error ? error.name : "unknown" },
    }).catch(() => undefined);
    if (error instanceof StepUpRequiredError) {
      return NextResponse.json({ error: "security.step_up_required" }, { status: 403 });
    }
    return NextResponse.json({ error: "billing.iron_governance_write_unavailable" }, { status: 503 });
  }
}
