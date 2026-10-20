import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { recordAuditEvent } from "@/application/audit/record-audit-event";
import {
  commandBridgeConfigFromEnvironment,
  CoreBridgeGovernanceError,
  parseCommandBridgeTarget,
} from "@/application/integration/fm-core-bridge-governance";
import { lookupCommandBridgeOutcome } from "@/application/integration/fm-core-bridge-reconciliation";
import {
  StepUpRequiredError,
  verifyPasswordStepUp,
} from "@/application/security/password-step-up";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import {
  AuthenticationRequiredError,
  TenantScopeRequiredError,
  type TenantContext,
} from "@/domain/security/tenant-context";
import { db } from "@/infrastructure/db/client";
import { auditEvents } from "@/infrastructure/db/foundation-schema";

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Human-authorized, read-only reconciliation of a PREVIOUSLY preaudited request.
 * It never retries, grants, revokes or provisions an identity.
 */
export async function POST(request: Request) {
  let context: TenantContext | undefined;
  try {
    const requestHeaders = await headers();
    context = await resolveTenantContext(requestHeaders);
    if (
      !process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID ||
      context.tenantId !== process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID ||
      (context.role !== "owner" && context.role !== "admin")
    ) {
      return NextResponse.json(
        { error: "fm_core.bridge_platform_admin_required" }, { status: 403 },
      );
    }

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "fm_core.bridge_input_invalid" }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const requestId = input.commandRequestId;
    const password = input.password;
    if (
      typeof requestId !== "string" || !REQUEST_ID.test(requestId) ||
      typeof password !== "string" || !password || password.length > 128
    ) {
      return NextResponse.json({ error: "fm_core.bridge_input_invalid" }, { status: 400 });
    }
    const proof = await verifyPasswordStepUp(requestHeaders, password);
    if (proof.userId !== context.userId) throw new StepUpRequiredError();

    // A caller may ONLY resolve a request previously authorized by this human
    // in the canonical FM organization, never an arbitrary Assistant row.
    const intents = await db.select({
      action: auditEvents.action,
      actorId: auditEvents.actorId,
      resourceId: auditEvents.resourceId,
      metadata: auditEvents.metadata,
    }).from(auditEvents).where(and(
      eq(auditEvents.tenantId, context.tenantId),
      eq(auditEvents.actorId, context.userId),
      eq(auditEvents.result, "allowed"),
      sql`${auditEvents.metadata} ->> 'commandRequestId' = ${requestId}`,
    )).limit(2);
    if (intents.length !== 1) {
      return NextResponse.json(
        { error: "fm_core.bridge_request_unavailable" }, { status: 404 },
      );
    }
    const intent = intents[0];
    const prefix = "fm_core.bridge.";
    const suffix = ".requested";
    if (!intent.action.startsWith(prefix) || !intent.action.endsWith(suffix)) {
      return NextResponse.json(
        { error: "fm_core.bridge_request_unavailable" }, { status: 404 },
      );
    }
    const action = intent.action.slice(prefix.length, -suffix.length);
    const target = parseCommandBridgeTarget({
      action,
      tenantId: intent.metadata.tenantId,
      unitId: intent.metadata.unitId,
      capability: intent.metadata.capability,
    });
    const config = commandBridgeConfigFromEnvironment();
    if (!target || intent.resourceId !== config.targetCoreKeyId) {
      return NextResponse.json(
        { error: "fm_core.bridge_request_unavailable" }, { status: 404 },
      );
    }

    const outcome = await lookupCommandBridgeOutcome(
      target,
      {
        actorUserId: context.userId,
        organizationId: context.tenantId,
        stepUpAt: proof.verifiedAt,
      },
      requestId,
      config,
    );
    await recordAuditEvent(context, {
      action: "fm_core.bridge.status_checked",
      resourceType: "fm_core_service_identity",
      resourceId: config.targetCoreKeyId,
      result: "success",
      metadata: { commandRequestId: requestId, status: outcome.status },
    });
    return NextResponse.json(
      { commandRequestId: requestId, status: outcome.status, outcome: outcome.outcome },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "fm_core.bridge_authentication_required" }, { status: 401 });
    }
    if (error instanceof TenantScopeRequiredError || error instanceof StepUpRequiredError) {
      return NextResponse.json({ error: "fm_core.bridge_authority_denied" }, { status: 403 });
    }
    if (context) {
      try {
        await recordAuditEvent(context, {
          action: "fm_core.bridge.status_lookup_failed",
          resourceType: "fm_core_service_identity",
          result: "failure",
          metadata: { reason: "bridge_governance_unavailable" },
        });
      } catch {
        // Do not expose unavailable audit storage, service responses, or secrets.
      }
    }
    return NextResponse.json(
      { error: error instanceof CoreBridgeGovernanceError
        ? error.message : "fm_core.bridge_governance_unavailable" },
      { status: 503 },
    );
  }
}
