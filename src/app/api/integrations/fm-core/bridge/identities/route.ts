import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { recordAuditEvent } from "@/application/audit/record-audit-event";
import {
  commandBridgeConfigFromEnvironment,
  CoreBridgeGovernanceError,
  parseCommandBridgeTarget,
  sendGovernedCommandBridgeAction,
} from "@/application/integration/fm-core-bridge-governance";
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

export async function POST(request: Request) {
  let context: TenantContext | undefined;
  let action = "unknown";
  try {
    const requestHeaders = await headers();
    context = await resolveTenantContext(requestHeaders);
    const trustedOrganization = process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID;
    // Tenant owner/admin is NOT automatically a platform administrator.
    if (
      !trustedOrganization ||
      trustedOrganization !== context.tenantId ||
      (context.role !== "owner" && context.role !== "admin")
    ) {
      return NextResponse.json(
        { error: "fm_core.bridge_platform_admin_required" },
        { status: 403 },
      );
    }

    const raw: unknown = await request.json().catch(() => null);
    const target = parseCommandBridgeTarget(raw);
    const input = raw as Record<string, unknown> | null;
    const password = input?.password;
    if (!target || typeof password !== "string" ||
        !password || password.length > 128) {
      return NextResponse.json(
        { error: "fm_core.bridge_input_invalid" }, { status: 400 },
      );
    }
    action = target.action;
    const proof = await verifyPasswordStepUp(requestHeaders, password);
    if (proof.userId !== context.userId) throw new StepUpRequiredError();

    const config = commandBridgeConfigFromEnvironment();
    const result = await sendGovernedCommandBridgeAction(
      target,
      {
        actorUserId: context.userId,
        organizationId: context.tenantId,
        stepUpAt: proof.verifiedAt,
      },
      config,
    );
    await recordAuditEvent(context, {
      action: `fm_core.bridge.${action}`,
      resourceType: "fm_core_service_identity",
      resourceId: config.targetCoreKeyId,
      result: "success",
      metadata: {
        tenantId: target.tenantId,
        unitId: target.unitId,
        capability: target.capability,
        outcome: result,
      },
    });
    return NextResponse.json({ status: result }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof TenantScopeRequiredError || error instanceof StepUpRequiredError)
      return NextResponse.json({ error: "fm_core.bridge_authority_denied" }, { status: 403 });
    if (context) {
      try {
        await recordAuditEvent(context, {
          action: `fm_core.bridge.${action}`,
          resourceType: "fm_core_service_identity",
          result: "failure",
          metadata: { reason: "bridge_governance_unavailable" },
        });
      } catch {
        // Do not reveal operational audit/database details to HTTP clients.
      }
    }
    return NextResponse.json(
      { error: error instanceof CoreBridgeGovernanceError
        ? error.message : "fm_core.bridge_governance_unavailable" },
      { status: 503 },
    );
  }
}
