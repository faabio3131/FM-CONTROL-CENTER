import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { buildActivityFeedService } from "@/application/activity/activity-feed-composition";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import {
  AuthenticationRequiredError,
  PermissionDeniedError,
  TenantScopeRequiredError,
} from "@/domain/security/tenant-context";

function readLimit(request: Request): number | null {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null) return 20;
  if (!/^\d{1,3}$/.test(raw)) return null;
  const limit = Number(raw);
  return Number.isInteger(limit) && limit >= 1 && limit <= 100
    ? limit
    : null;
}

export async function GET(request: Request) {
  try {
    const context = await resolveTenantContext(await headers());
    const limit = readLimit(request);
    if (limit === null) {
      return NextResponse.json(
        { error: "activity.limit_invalid" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      await buildActivityFeedService().recent(context, limit),
    );
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (
      error instanceof TenantScopeRequiredError ||
      error instanceof PermissionDeniedError
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
