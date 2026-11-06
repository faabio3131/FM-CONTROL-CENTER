import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { LivePulseService } from "@/application/live/live-pulse-service";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import {
  AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError,
} from "@/domain/security/tenant-context";
import { PostgresLivePulseRepository } from "@/infrastructure/live/postgres-live-pulse-repository";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const context = await resolveTenantContext(await headers());
    const { token } = await new LivePulseService(new PostgresLivePulseRepository()).pulse(context);
    return NextResponse.json({ token }, {
      headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof TenantScopeRequiredError || error instanceof PermissionDeniedError) {
      return NextResponse.json({ error: "live.access_denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "live.unavailable" }, { status: 503 });
  }
}
