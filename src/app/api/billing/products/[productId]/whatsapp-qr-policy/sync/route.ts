import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/application/audit/record-audit-event";
import { WhatsAppQRPolicyService } from "@/application/integration/whatsapp-qr-policy-service";
import { projectWhatsAppQRPolicy } from "@/application/integration/whatsapp-qr-policy-projection";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { StepUpRequiredError, verifyPasswordStepUp } from "@/application/security/password-step-up";
import { requireFMPlanAuthority } from "@/application/billing/assistant-plan-catalog-service";

type Ctx={params:Promise<{productId:string}>};
const policies=new WhatsAppQRPolicyService();

/** Human step-up is mandatory even for an idempotent revision re-projection.
 * No client may provide target origin, actor, org, revision, or display cap.
 */
export async function POST(request:Request,{params}:Ctx){
  try {
    const requestHeaders=await headers();
    const context=await resolveTenantContext(requestHeaders);
    requireFMPlanAuthority(context,true);
    const raw:unknown=await request.json().catch(()=>null);
    if(!raw || typeof raw!=="object" || Array.isArray(raw))
      return NextResponse.json({error:"qr.sync_payload_invalid"},{status:400});
    const body=raw as Record<string,unknown>;
    if(Object.keys(body).length!==1 || typeof body.password!=="string" ||
        body.password.length<1 || body.password.length>128)
      return NextResponse.json({error:"qr.sync_payload_invalid"},{status:400});
    const proof=await verifyPasswordStepUp(requestHeaders,body.password);
    if(proof.userId!==context.userId)throw new StepUpRequiredError();
    const {productId}=await params;
    const revision=await policies.readForProjection(context,productId);
    // Pre-audit persists before any network contact; failure aborts.
    await recordAuditEvent(context,{
      action:"whatsapp.qr.policy_sync_requested",
      resourceType:"product",resourceId:productId,result:"allowed",
      metadata:{revision:revision.revision,displaySeconds:revision.displaySeconds},
    });
    try{
      const status=await projectWhatsAppQRPolicy(revision);
      await recordAuditEvent(context,{
        action:"whatsapp.qr.policy_sync_confirmed",
        resourceType:"product",resourceId:productId,result:"success",
        metadata:{revision:revision.revision,status},
      });
      return NextResponse.json({status,revision:revision.revision},{
        headers:{"Cache-Control":"no-store"},
      });
    }catch{
      await recordAuditEvent(context,{
        action:"whatsapp.qr.policy_sync_unconfirmed",
        resourceType:"product",resourceId:productId,result:"failure",
        metadata:{revision:revision.revision},
      });
      return NextResponse.json({error:"qr.sync_unconfirmed"},{status:503,
        headers:{"Cache-Control":"no-store"}});
    }
  }catch{
    // No upstream URL, key, org, actor, raw error or operation detail leakage.
    return NextResponse.json({error:"qr.sync_denied_or_unavailable"},{status:403,
      headers:{"Cache-Control":"no-store"}});
  }
}
