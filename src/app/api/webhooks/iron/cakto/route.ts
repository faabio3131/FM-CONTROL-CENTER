import { NextResponse } from "next/server";
import { BodyTooLargeError, readLimitedBody } from "@/infrastructure/http/read-limited-body";
import { WebhookRejectedError } from "@/domain/billing/cakto-payment-provider-contract";
import { CaktoIronReadbackInbox } from "@/application/billing/cakto-iron-readback-inbox";

export const dynamic = "force-dynamic";
/** Payment authority is FM Command product ledger, never the IRON academy finance ledger. */
export async function POST(request: Request) {
  let raw: string;
  try { raw = await readLimitedBody(request, 65_536); }
  catch (e) {
    if (e instanceof BodyTooLargeError) return NextResponse.json({ error: "webhook.too_large" }, { status: 413 });
    return NextResponse.json({ error: "webhook.body_invalid" }, { status: 400 });
  }
  try {
    const result = await new CaktoIronReadbackInbox().accept("recurring",request.headers, raw);
    return NextResponse.json({ accepted: true, result }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof WebhookRejectedError) {
      // Fixed enum only. Never log a header value, secret, signature, buyer or raw body.
      console.warn("cakto.webhook_rejected", { scope:"recurring", reason:e.reason,
        timestampPresent:request.headers.has("x-cakto-timestamp"),
        signaturePresent:request.headers.has("x-cakto-signature") });
      return NextResponse.json({ error: e.code }, { status: 401 });
    }
    // Payment observations are never acknowledged if durable inbox storage failed.
    return NextResponse.json({ error: "webhook.persistence_unavailable" }, { status: 503 });
  }
}
