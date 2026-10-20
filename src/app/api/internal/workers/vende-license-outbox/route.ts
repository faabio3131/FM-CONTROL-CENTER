import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { planProjectionConfigFromEnvironment } from "@/application/billing/assistant-plan-outbox-dispatcher";
import { assertVendeWorkerEnabled, runGovernedVendeLicenseWorker } from "@/application/billing/vende-license-worker";
import { db } from "@/infrastructure/db/client";
import { billingAuditEvents } from "@/infrastructure/db/billing-schema";

export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.FM_COMMAND_VENDE_LICENSE_WORKER_TOKEN ?? "";
  const bearer = request.headers.get("authorization") ?? "";
  if (secret.length < 40 || !bearer.startsWith("Bearer ") ||
      bearer.length !== secret.length + 7 ||
      bearer.includes(",")) return false;
  const actual = createHash("sha256").update(bearer.slice(7), "utf8").digest();
  const expected = createHash("sha256").update(secret, "utf8").digest();
  return timingSafeEqual(actual, expected);
}

/** Secure scheduler ingress. No actor/tenant/URL/limit accepted from callers.
 * OFF by default. Scheduler configuration, secrets, firewall and activation
 * belong to a separate, human-approved deployment/homologation gate.
 */
export async function POST(request: Request) {
  const noStore = { "Cache-Control": "no-store" };
  if (process.env.FM_COMMAND_VENDE_LICENSE_WORKER_ENABLED !== "true") {
    return NextResponse.json({error:"billing.worker_disabled"}, {status:503,headers:noStore});
  }
  if (!authorized(request)) {
    return NextResponse.json({error:"billing.worker_unauthorized"}, {status:401,headers:noStore});
  }
  if (request.headers.has("content-length") &&
      request.headers.get("content-length") !== "0") {
    return NextResponse.json({error:"billing.worker_input_forbidden"},{status:400,headers:noStore});
  }
  try {
    assertVendeWorkerEnabled();
    const config = planProjectionConfigFromEnvironment();
    const correlationId = randomUUID();
    // An audit outage MUST prevent any outbound license transmission.
    await db.insert(billingAuditEvents).values({
      tenantId:config.organizationId,actorId:"system-vende-worker",
      action:"vende.license.worker.requested",
      subjectId:config.organizationId,correlationId,
    });
    const result = await runGovernedVendeLicenseWorker(config,{limit:10});
    await db.insert(billingAuditEvents).values({
      tenantId:config.organizationId,actorId:"system-vende-worker",
      action:"vende.license.worker.completed",
      subjectId:config.organizationId,correlationId,
    });
    return NextResponse.json({result}, {headers:noStore});
  } catch {
    // A network error is ambiguous; the persistent outbox is source of truth.
    // No implicit retry and no secrets in the response or logs.
    return NextResponse.json({error:"billing.worker_unavailable"}, {status:503,headers:noStore});
  }
}
