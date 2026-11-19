import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { verifyPasswordStepUp, StepUpRequiredError } from "@/application/security/password-step-up";
import { CaktoIronReadbackInbox } from "@/application/billing/cakto-iron-readback-inbox";
import { BodyTooLargeError, readLimitedBody } from "@/infrastructure/http/read-limited-body";
import { AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError, requirePermission } from "@/domain/security/tenant-context";
import { environmentIronControlTenantId } from "@/infrastructure/integration/iron-commercial-connector";

export const dynamic="force-dynamic";

export async function POST(request:Request,{params}:{params:Promise<{productId:string}>}){
  if(process.env.FMCC_IRON_OUTBOX_MANUAL_OPERATIONS_ENABLED!=="YES")
    return NextResponse.json({error:"cakto.readback_recovery_disabled"},{status:503});
  try {
    const h=await headers();
    const context=await resolveTenantContext(h);
    requirePermission(context,"billing:write");
    const {productId}=await params;
    if(context.role!=="owner" || context.tenantId!==environmentIronControlTenantId() ||
      context.tenantId!==process.env.FMCC_IRON_BILLING_TENANT_ID ||
      productId!==process.env.FMCC_IRON_PRODUCT_ID)
      return NextResponse.json({error:"cakto.readback_recovery_scope_denied"},{status:403});
    let raw:unknown;
    try {raw=JSON.parse(await readLimitedBody(request,4096));}
    catch(e){return NextResponse.json({error:"cakto.readback_recovery_input_invalid"},{status:e instanceof BodyTooLargeError?413:400});}
    if(!raw||typeof raw!=="object"||Array.isArray(raw))
      return NextResponse.json({error:"cakto.readback_recovery_input_invalid"},{status:400});
    const body=raw as Record<string,unknown>;
    if(Object.keys(body).length!==3||body.approval!=="REQUEUE_BLOCKED_CAKTO"||
      typeof body.inboxId!=="string"||typeof body.password!=="string"||!body.password.trim())
      return NextResponse.json({error:"cakto.readback_recovery_input_invalid"},{status:400});
    const proof=await verifyPasswordStepUp(h,body.password);
    if(proof.userId!==context.userId)
      return NextResponse.json({error:"security.step_up_required"},{status:403});
    const result=await new CaktoIronReadbackInbox().requeue(context,body.inboxId);
    return NextResponse.json(result,{headers:{"cache-control":"no-store"}});
  }catch(e){
    if(e instanceof AuthenticationRequiredError) return NextResponse.json({error:"security.authentication_required"},{status:401});
    if(e instanceof PermissionDeniedError||e instanceof TenantScopeRequiredError||e instanceof StepUpRequiredError)
      return NextResponse.json({error:"security.step_up_required"},{status:403});
    const code=e instanceof Error?e.message:"";
    if(code==="cakto.readback_scope_denied") return NextResponse.json({error:code},{status:403});
    if(code==="cakto.readback_not_blocked") return NextResponse.json({error:code},{status:409});
    return NextResponse.json({error:"cakto.readback_recovery_unavailable"},{status:503});
  }
}

export async function GET(_request:Request,{params}:{params:Promise<{productId:string}>}){
  if(process.env.FMCC_IRON_OUTBOX_MANUAL_OPERATIONS_ENABLED!=="YES")return NextResponse.json({error:"cakto.readback_recovery_disabled"},{status:503});
  try{
    const context=await resolveTenantContext(await headers());
    const {productId}=await params;
    if(context.role!=="owner"||context.tenantId!==environmentIronControlTenantId()||
      productId!==process.env.FMCC_IRON_PRODUCT_ID)return NextResponse.json({error:"cakto.readback_scope_denied"},{status:403});
    return NextResponse.json({items:await new CaktoIronReadbackInbox().listBlocked(context)},{headers:{"cache-control":"no-store"}});
  }catch{return NextResponse.json({error:"cakto.readback_recovery_unavailable"},{status:403});}
}
