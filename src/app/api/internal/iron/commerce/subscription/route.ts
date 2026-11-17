import { NextResponse } from "next/server";
import { IronCommerceProvisioning, verifyIronCommerceBearer } from "@/application/billing/iron-commerce-provisioning";

export const dynamic = "force-dynamic";

/**
 * IRON-only readback of its own authenticated academy.
 * No provider credentials, card data, raw webhook or cross-tenant queries.
 */
export async function GET(request: Request) {
  if (!verifyIronCommerceBearer(request.headers.get("authorization"), process.env.FMCC_IRON_COMMERCE_S2S_TOKEN))
    return NextResponse.json({ error: "iron.commerce_unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const gymId = url.searchParams.get("gymId") || "";
  const expectedSubscriptionId = url.searchParams.get("expectedSubscriptionId") || "";
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  if (!uuid.test(gymId) || !uuid.test(expectedSubscriptionId))
    return NextResponse.json({ error: "iron.commerce_input_invalid" }, { status: 400 });

  try {
    const result = await new IronCommerceProvisioning().current({ gymId, expectedSubscriptionId });
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch {
    // Do not reveal tenant existence or control-plane/provider state.
    return NextResponse.json({ error: "iron.commerce_readback_unavailable" }, { status: 503 });
  }
}
