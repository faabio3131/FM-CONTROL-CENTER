import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/application/audit/record-audit-event";
import { buildCoreGateway } from "@/application/core/core-composition";
import { CoreArgumentError, CoreCapabilityDeniedError } from "@/application/core/core-gateway";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { AuthenticationRequiredError, TenantScopeRequiredError, type TenantContext } from "@/domain/security/tenant-context";
import { CanonicalCoreUnavailableError } from "@/infrastructure/core/http-core-client";

async function auditCoreQuery(context: TenantContext | null, result: "success" | "failure" | "denied", metadata: Record<string, unknown>) {
  if (!context) return;
  await recordAuditEvent(context, {
    action: "core.query",
    resourceType: "cognitive_core",
    result,
    metadata,
  });
}

export async function POST(request: Request) {
  let context: TenantContext | null = null;
  try {
    context = await resolveTenantContext(await headers());
    const body = await request.json() as { question?: unknown };
    if (typeof body.question !== "string") throw new CoreArgumentError();
    const answer = await buildCoreGateway().ask(context, body.question);
    await auditCoreQuery(context, "success", {
      question: body.question,
      answer: answer.answer,
      factualStatus: answer.factualStatus,
      evidenceRefs: answer.evidence.map((item) => item.ref),
    });
    return NextResponse.json(answer);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof TenantScopeRequiredError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof CoreCapabilityDeniedError) {
      await auditCoreQuery(context, "denied", { error: error.message });
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof CoreArgumentError) {
      await auditCoreQuery(context, "failure", { error: error.message });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof CanonicalCoreUnavailableError) {
      await auditCoreQuery(context, "failure", { error: error.message });
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
}
