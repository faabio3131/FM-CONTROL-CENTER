import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/application/audit/record-audit-event";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { verifyPasswordStepUp, StepUpRequiredError } from "@/application/security/password-step-up";
import { WhatsAppQRPolicyService, WhatsAppQRPolicyUnavailable } from "@/application/integration/whatsapp-qr-policy-service";
import { WhatsAppQRPolicyInvalid } from "@/domain/integration/whatsapp-qr-policy";
import { AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError } from "@/domain/security/tenant-context";

type Ctx={params:Promise<{productId:string}>};
const service=new WhatsAppQRPolicyService();
function failure(error:unknown) {
  if(error instanceof AuthenticationRequiredError)
    return NextResponse.json({error:"security.authentication_required"},{status:401});
  if(error instanceof StepUpRequiredError || error instanceof PermissionDeniedError || error instanceof TenantScopeRequiredError)
    return NextResponse.json({error:"qr.fm_authority_required"},{status:403});
  if(error instanceof WhatsAppQRPolicyInvalid)
    return NextResponse.json({error:error.message},{status:400});
  if(error instanceof WhatsAppQRPolicyUnavailable)
    return NextResponse.json({error:error.message},{status:409});
  return NextResponse.json({error:"qr.policy_unavailable"},{status:503});
}

export async function GET(_request:Request,{params}:Ctx) {
  try {
    const context=await resolveTenantContext(await headers());
    const {productId}=await params;
    return NextResponse.json(await service.read(context,productId),{
      headers:{"Cache-Control":"no-store"},
    });
  } catch(error){return failure(error);}
}

export async function POST(request:Request,{params}:Ctx) {
  try {
    const requestHeaders=await headers();
    const context=await resolveTenantContext(requestHeaders);
    const corporate=process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID;
    if(!corporate || corporate!==context.tenantId || !["owner","admin"].includes(context.role))
      return NextResponse.json({error:"qr.fm_authority_required"},{status:403});
    const raw:unknown=await request.json().catch(()=>null);
    if(!raw || typeof raw!=="object" || Array.isArray(raw))
      return NextResponse.json({error:"qr.payload_invalid"},{status:400});
    const body=raw as Record<string,unknown>;
    if(typeof body.password!=="string" || body.password.length>128)
      throw new StepUpRequiredError();
    const proof=await verifyPasswordStepUp(requestHeaders,body.password);
    if(proof.userId!==context.userId) throw new StepUpRequiredError();
    const {productId}=await params;
    await recordAuditEvent(context,{
      action:"whatsapp.qr.policy_change_requested",resourceType:"product",resourceId:productId,
      result:"allowed",metadata:{displaySeconds:body.displaySeconds,actorUserId:context.userId},
    });
    const result=await service.update(context,productId,body.displaySeconds,body.expectedRevision);
    await recordAuditEvent(context,{
      action:"whatsapp.qr.policy_changed",resourceType:"product",resourceId:productId,
      result:"success",metadata:{displaySeconds:result.displaySeconds,revision:result.revision},
    });
    return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
  } catch(error){return failure(error);}
}
