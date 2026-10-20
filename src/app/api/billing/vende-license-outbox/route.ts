import { desc, eq, inArray, and } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { recordAuditEvent } from "@/application/audit/record-audit-event";
import { reconcileBlockedVendePaidLicense } from "@/application/billing/assistant-paid-license-outbox";
import { planProjectionConfigFromEnvironment } from "@/application/billing/assistant-plan-outbox-dispatcher";
import { assertVendeWorkerEnabled, readVendeQueueHealth, runGovernedVendeLicenseWorker } from "@/application/billing/vende-license-worker";
import { StepUpRequiredError, verifyPasswordStepUp } from "@/application/security/password-step-up";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import {
  AuthenticationRequiredError, TenantScopeRequiredError,
  type TenantContext,
} from "@/domain/security/tenant-context";
import { db } from "@/infrastructure/db/client";
import { billingVendeLicenseOutbox } from "@/infrastructure/db/billing-schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authorize(context: TenantContext): void {
  if (!process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID ||
      context.tenantId !== process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID ||
      (context.role !== "owner" && context.role !== "admin")) {
    throw new TenantScopeRequiredError();
  }
}
function failure(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json({error:"security.authentication_required"},{status:401});
  }
  if (error instanceof TenantScopeRequiredError || error instanceof StepUpRequiredError) {
    return NextResponse.json({error:"billing.fm_authority_required"},{status:403});
  }
  return NextResponse.json({error:"billing.vende_reconciliation_unavailable"},{status:503});
}

/** Operator visibility only. No tenant headers, public tokens or untrusted URLs
 * can select a billing authority or a downstream Assistant instance.
 */
export async function GET() {
  try {
    const context = await resolveTenantContext(await headers());
    authorize(context);
    const items = await db.select({
      outboxId: billingVendeLicenseOutbox.id,
      invoiceId: billingVendeLicenseOutbox.invoiceId,
      externalTenantId: billingVendeLicenseOutbox.externalTenantId,
      planCode: billingVendeLicenseOutbox.planCode,
      planRevision: billingVendeLicenseOutbox.planRevision,
      state: billingVendeLicenseOutbox.state,
      attempts: billingVendeLicenseOutbox.attempts,
      createdAt: billingVendeLicenseOutbox.createdAt,
      claimedAt: billingVendeLicenseOutbox.claimedAt,
    }).from(billingVendeLicenseOutbox).where(and(
      eq(billingVendeLicenseOutbox.tenantId, context.tenantId),
      inArray(billingVendeLicenseOutbox.state, ["pending","processing","blocked"]),
    )).orderBy(desc(billingVendeLicenseOutbox.createdAt)).limit(50);
    const health = await readVendeQueueHealth(context.tenantId);
    await recordAuditEvent(context, {
      action:"billing.vende_license.outbox_viewed", resourceType:"vende_license_outbox",
      result:"success", metadata:{count:items.length},
    });
    return NextResponse.json({items,health,workerEnabled:process.env.FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED==="true"}, {headers:{"Cache-Control":"no-store"}});
  } catch (error) {return failure(error);}
}

/** Manually authorized, read-only remote lookup for ONE blocked attempt.
 * This action can acknowledge existing proof but NEVER sends a new bind.
 * The pre-audit is fail-closed; lack of remote proof leaves the row blocked.
 */
export async function POST(request: Request) {
  try {
    const requestHeaders = await headers();
    const context = await resolveTenantContext(requestHeaders);
    authorize(context);
    const raw: unknown = await request.json().catch(() => null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return NextResponse.json({error:"billing.reconciliation_input_invalid"},{status:400});
    }
    const body = raw as Record<string, unknown>;
    const reconcile = body.action === "reconcile";
    const runOnce = body.action === "run_once";
    if ((!reconcile && !runOnce) ||
        Object.keys(body).some(key=>!["action","outboxId","password","limit"].includes(key)) ||
        (reconcile && (typeof body.outboxId !== "string" || !UUID.test(body.outboxId) ||
          body.limit !== undefined)) ||
        (runOnce && (body.outboxId !== undefined ||
          !Number.isSafeInteger(body.limit) || (body.limit as number) < 1 ||
          (body.limit as number) > 20)) ||
        typeof body.password !== "string" ||
        !body.password.trim() || body.password.length > 128) {
      return NextResponse.json({error:"billing.reconciliation_input_invalid"},{status:400});
    }
    const proof = await verifyPasswordStepUp(requestHeaders, body.password);
    if (proof.userId !== context.userId) throw new StepUpRequiredError();

    if (runOnce) {
      // An operator can request a bounded batch, but cannot turn on the
      // production worker using the API. FM must activate its deployment flag.
      assertVendeWorkerEnabled();
      await recordAuditEvent(context, {
        action:"billing.vende_license.worker_requested",
        resourceType:"vende_license_outbox",result:"allowed",
        metadata:{limit:body.limit},
      });
      const config = planProjectionConfigFromEnvironment();
      const result = await runGovernedVendeLicenseWorker(config,{limit:body.limit as number});
      await recordAuditEvent(context, {
        action:"billing.vende_license.worker_completed",
        resourceType:"vende_license_outbox",result:"success",
        metadata:{limit:body.limit,delivered:result.delivered,blocked:result.blocked,quarantined:result.quarantined},
      });
      return NextResponse.json({result},{headers:{"Cache-Control":"no-store"}});
    }
    if (typeof body.outboxId !== "string" || !UUID.test(body.outboxId)) {
      return NextResponse.json({error:"billing.reconciliation_input_invalid"},{status:400});
    }
    const outboxId = body.outboxId;
    // Write the intent before the external request, or do not transmit.
    await recordAuditEvent(context, {
      action:"billing.vende_license.reconciliation_requested",
      resourceType:"vende_license_outbox", resourceId:outboxId,
      result:"allowed", metadata:{outboxId:outboxId},
    });
    const config = planProjectionConfigFromEnvironment();
    const status = await reconcileBlockedVendePaidLicense(outboxId,config);
    await recordAuditEvent(context, {
      action:"billing.vende_license.reconciliation_checked",
      resourceType:"vende_license_outbox", resourceId:outboxId,
      result:"success", metadata:{outboxId:outboxId,status},
    });
    return NextResponse.json(
      {outboxId:outboxId,status},
      {headers:{"Cache-Control":"no-store"}},
    );
  } catch (error) {return failure(error);}
}
