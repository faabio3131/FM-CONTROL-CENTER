import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/application/audit/record-audit-event";
import { AssistantPlanCatalogService, AssistantPlanAuthorityDenied } from "@/application/billing/assistant-plan-catalog-service";
import { ConsumptionPlanInvalid } from "@/domain/billing/assistant-consumption-plan";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { verifyPasswordStepUp, StepUpRequiredError } from "@/application/security/password-step-up";
import { AuthenticationRequiredError, TenantScopeRequiredError, PermissionDeniedError } from "@/domain/security/tenant-context";

type Ctx = {params:Promise<{productId:string}>};
const service = new AssistantPlanCatalogService();
function failure(error:unknown) {
  if (error instanceof AuthenticationRequiredError)
    return NextResponse.json({error:"security.authentication_required"},{status:401});
  if (error instanceof AssistantPlanAuthorityDenied ||
      error instanceof TenantScopeRequiredError ||
      error instanceof PermissionDeniedError ||
      error instanceof StepUpRequiredError)
    return NextResponse.json({error:"plans.fm_authority_required"},{status:403});
  if (error instanceof ConsumptionPlanInvalid)
    return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({error:"plans.catalog_unavailable"},{status:503});
}
export async function GET(_request:Request,{params}:Ctx) {
  try {
    const context=await resolveTenantContext(await headers());
    const {productId}=await params;
    const plans=await service.list(context,productId);
    return NextResponse.json({plans},{headers:{"Cache-Control":"no-store"}});
  } catch (error) {return failure(error);}
}

export async function POST(request:Request,{params}:Ctx) {
  try {
    const requestHeaders=await headers();
    const context=await resolveTenantContext(requestHeaders);
    // Require FM platform role + organization BEFORE attempting reauthentication.
    const corporate=process.env.FM_COMMAND_PLATFORM_ORGANIZATION_ID;
    if (!corporate || corporate!==context.tenantId || !["owner","admin"].includes(context.role))
      throw new AssistantPlanAuthorityDenied();
    const raw:unknown=await request.json().catch(()=>null);
    if (!raw || typeof raw!=="object" || Array.isArray(raw))
      throw new ConsumptionPlanInvalid("payload_invalid");
    const body=raw as Record<string,unknown>;
    if (typeof body.password!=="string" || body.password.length>128)
      throw new StepUpRequiredError();
    const proof=await verifyPasswordStepUp(requestHeaders,body.password);
    if (proof.userId!==context.userId) throw new StepUpRequiredError();
    const {productId}=await params;
    if (body.action==="create_draft") {
      // Audit intent is durable before mutation; failure means no plan created.
      await recordAuditEvent(context,{
        action:"assistant.plan_draft.requested",resourceType:"assistant_plan",
        resourceId:productId,result:"allowed",
        metadata:{productId, actorUserId:context.userId},
      });
      const result=await service.createDraft(context,productId,body.plan);
      await recordAuditEvent(context,{
        action:"assistant.plan_draft.created",resourceType:"assistant_plan",
        resourceId:result.id,result:"success",
        metadata:{productId,planCode:result.planCode,revision:result.revision},
      });
      return NextResponse.json({plan:result},{status:201});
    }
    if (body.action==="publish") {
      if (typeof body.revisionId!=="string")
        throw new ConsumptionPlanInvalid("revision_invalid");
      await recordAuditEvent(context,{
        action:"assistant.plan_publish.requested",resourceType:"assistant_plan",
        resourceId:body.revisionId,result:"allowed",
        metadata:{productId},
      });
      const result=await service.publish(context,productId,body.revisionId);
      await recordAuditEvent(context,{
        action:"assistant.plan_published",resourceType:"assistant_plan",
        resourceId:result.id,result:"success",
        metadata:{productId,planCode:result.planCode,revision:result.revision},
      });
      return NextResponse.json({plan:result});
    }
    throw new ConsumptionPlanInvalid("action_invalid");
  } catch(error) {return failure(error);}
}
