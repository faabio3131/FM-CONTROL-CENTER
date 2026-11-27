import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { IronCommerceProvisioning, verifyIronCommerceBearer } from "@/application/billing/iron-commerce-provisioning";
import { pool } from "@/infrastructure/db/client";
import { BodyTooLargeError, readLimitedBody } from "@/infrastructure/http/read-limited-body";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const headers = { "cache-control": "private, no-store" };
const error = (status: number) => NextResponse.json({ error: "iron.change_unavailable" }, { status, headers });

export async function POST(request: Request) {
  if (!verifyIronCommerceBearer(request.headers.get("authorization"), process.env.FMCC_IRON_COMMERCE_S2S_TOKEN))
    return error(401);
  let body;
  try { body = JSON.parse(await readLimitedBody(request, 2048)); }
  catch (e) { return error(e instanceof BodyTooLargeError ? 413 : 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return error(400);
  const { gymId, expectedSubscriptionId, actorId, targetPlanCode, termsHash } = body;
  if (![gymId, expectedSubscriptionId, actorId].every(x => typeof x === "string" && uuid.test(x)) ||
      typeof targetPlanCode !== "string" || !/^[A-Z][A-Z0-9_]{1,63}$/.test(targetPlanCode) ||
      (termsHash !== undefined && (typeof termsHash !== "string" || !/^[0-9a-f]{64}$/.test(termsHash)))) return error(400);
  // Commercial rule (FM, 27/11/2026, revised): an upgrade is bought for the next
  // cycle through the regular Cakto checkout of the higher plan, inside the
  // window before renewal. The difference-payment flow below has no live Cakto
  // adapter; it runs only in the disposable sandbox and never persists otherwise.
  if (process.env.FMCC_IRON_DIFFERENCE_CHANGE_SANDBOX !== "true")
    return NextResponse.json({ error: "iron.change_at_renewal_checkout" }, { status: 409, headers });
  try {
    const result = await new IronCommerceProvisioning().current({ gymId, expectedSubscriptionId, targetPlanCode });
    const quote = result.changeQuote;
    if (!quote) return error(409);
    // Commercial rule (FM, 27/11/2026): only upgrades are offered; a downgrade
    // is refused before any quote is shown or persisted.
    if (quote.effectiveOn !== "DIFFERENCE_PAYMENT_CONFIRMED")
      return NextResponse.json({ error: "iron.change_downgrade_not_offered" }, { status: 409, headers });
    const terms = quote.targetRecurrence;
    const tenant = process.env.FMCC_IRON_BILLING_TENANT_ID;
    const product = process.env.FMCC_IRON_PRODUCT_ID;
    const hash = createHash("sha256").update(JSON.stringify([tenant, product, gymId, expectedSubscriptionId,
      quote.currentPlanCode, targetPlanCode, quote.amountDueNowMinor, quote.effectiveOn, quote.currency,
      terms.interval, terms.amountMinor, terms.firstChargeAt, quote.binding])).digest("hex");
    const review = { gymId, targetPlanCode, amountDueNowMinor: quote.amountDueNowMinor,
      renewalMinor: terms.amountMinor, interval: terms.interval, effectiveOn: quote.effectiveOn,
      renewalAt: terms.firstChargeAt, termsHash: hash };
    if (termsHash === undefined) return NextResponse.json(review, { headers });
    if (!terms.firstChargeAt || termsHash !== hash || Date.parse(terms.firstChargeAt) <= Date.now()) return error(409);
    const saved = await pool.query(`
      INSERT INTO fmcc_iron_plan_change_request
        (tenant_id,product_id,gym_id,source_subscription_id,requested_by,target_plan,renewal_at,terms_hash,quote)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (tenant_id,product_id,gym_id,source_subscription_id,renewal_at)
      DO UPDATE SET terms_hash=EXCLUDED.terms_hash
      WHERE fmcc_iron_plan_change_request.terms_hash=EXCLUDED.terms_hash
      RETURNING id,status`, [tenant, product, gymId, expectedSubscriptionId, actorId, targetPlanCode,
        terms.firstChargeAt, hash, quote]);
    if (!saved.rowCount) return error(409);
    return NextResponse.json({ ...review, requestId: saved.rows[0].id, status: saved.rows[0].status }, { headers });
  } catch (cause) {
    if ((cause as {constraint?:string})?.constraint === "fmcc_iron_plan_change_one_active_per_gym") return error(409);
    return error(503);
  }
}
