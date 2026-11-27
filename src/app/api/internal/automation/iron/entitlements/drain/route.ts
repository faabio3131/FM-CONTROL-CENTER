import { NextResponse } from "next/server";
import { alertAutomationEnv } from "@/config/env";
import { verifyScheduledWorkerBearer } from "@/application/security/verify-scheduled-worker-bearer";
import { IronEntitlementOutboxWorker } from "@/application/billing/iron-entitlement-outbox-worker";
import { IronSupersededCancelWorker } from "@/application/billing/iron-superseded-cancel-worker";
import { pool } from "@/infrastructure/db/client";

/**
 * Existing FM Command internal scheduler authority. This job is safe to repeat:
 * the DB leases one canonical entitlement event at a time and the IRON
 * control plane independently deduplicates the immutable delivery key.
 */
export async function POST(request: Request) {
  let secret: string;
  try { secret = alertAutomationEnv().schedulerSecret; }
  catch { return NextResponse.json({ error: "automation.scheduler_not_configured" }, { status: 503 }); }
  if (!verifyScheduledWorkerBearer(request.headers.get("authorization"), secret))
    return NextResponse.json({ error: "automation.unauthorized" }, { status: 401 });
  const worker = new IronEntitlementOutboxWorker(pool, process.env);
  const outcome = { delivered: 0, retry: 0, blocked: 0, idle: 0 };
  try {
    for (let i = 0; i < 5; i += 1) {
      const result = await worker.processOne();
      outcome[result] += 1;
      if (result === "idle") break;
    }
    // Stop the Cakto recurrence of plans replaced by a paid upgrade (no license effect).
    const superseded = { cancelled: 0, retry: 0, failed: 0, not_configured: 0, idle: 0 };
    const canceller = new IronSupersededCancelWorker(pool, process.env);
    for (let i = 0; i < 3; i += 1) {
      const result = await canceller.processOne();
      superseded[result] += 1;
      if (result === "idle" || result === "not_configured") break;
    }
    return NextResponse.json({ ...outcome, superseded }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "iron.entitlement_worker_unavailable" }, { status: 503 });
  }
}
