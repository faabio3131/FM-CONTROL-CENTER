import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    {
      service: "fm-control-center",
      environment: process.env.RENDER === "true" ? "render" : "unknown",
      gitCommit: process.env.RENDER_GIT_COMMIT?.trim() || null,
      gitBranch: process.env.RENDER_GIT_BRANCH?.trim() || null,
    },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    },
  );
}
