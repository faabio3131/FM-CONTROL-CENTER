import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { buildCoreGateway } from "@/application/core/core-composition";
import { CoreArgumentError, CoreCapabilityDeniedError } from "@/application/core/core-gateway";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { AuthenticationRequiredError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { CanonicalCoreUnavailableError } from "@/infrastructure/core/http-core-client";

export async function POST(request: Request) {
  try {
    const context = await resolveTenantContext(await headers());
    const body = await request.json() as { question?: unknown };
    if (typeof body.question !== "string") throw new CoreArgumentError();
    const answer = await buildCoreGateway().ask(context, body.question);
    return NextResponse.json(answer);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof TenantScopeRequiredError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof CoreCapabilityDeniedError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof CoreArgumentError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof CanonicalCoreUnavailableError) return NextResponse.json({ error: error.message }, { status: 503 });
    throw error;
  }
}
