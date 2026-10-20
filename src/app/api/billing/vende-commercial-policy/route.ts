/**
 * FM-only read of the human-approved VendeAtendeIA V1 commercial baseline.
 * No invoice, subscription or entitlement write and no customer-supplied
 * dates/holidays/payment evidence. It does not authorize execution.
 */
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { requirePermission } from "@/domain/security/tenant-context";
import { VENDE_COMMERCIAL_POLICY_V1 } from "@/domain/billing/vende-commercial-policy-v1";

export async function GET() {
  try {
    const context=await resolveTenantContext(await headers());
    requirePermission(context,"billing:read");
    if(!process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID ||
       context.tenantId!==process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID ||
       (context.role!=="owner" && context.role!=="admin"))
      return NextResponse.json({error:"billing.fm_authority_required"},
        {status:403,headers:{"Cache-Control":"no-store"}});
    return NextResponse.json({
      policy:VENDE_COMMERCIAL_POLICY_V1,
      lifecycleExecutorEnabled:false,
      externalSettlementHomologated:false,
      gracePeriodRequiresVerifiedCalendar:true,
      gracePeriodRequiresGatewayReconciliation:true,
    },{headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"billing.fm_authority_required"},
      {status:403,headers:{"Cache-Control":"no-store"}});
  }
}
