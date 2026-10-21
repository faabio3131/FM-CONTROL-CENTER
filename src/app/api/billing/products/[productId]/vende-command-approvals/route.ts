import { and,asc,eq,isNull,lt,or } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/infrastructure/db/client";
import { productDefinitions } from "@/infrastructure/db/platform-schema";
import { vendeLifecycleCommands } from "@/infrastructure/db/vende-commercial-schema";
import { requireFMPlanAuthority } from "@/application/billing/assistant-plan-catalog-service";
import { reapproveVendeDelinquency } from "@/application/billing/vende-c06-delivery";
import { reapproveVendeReactivation } from "@/application/billing/vende-reactivation-delivery";
import { reapproveVendeFinalCancellation } from "@/application/billing/vende-final-cancellation-delivery";
import {fmLocalCivilDate} from "@/domain/billing/vende-commercial-policy-v1";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { verifyPasswordStepUp } from "@/application/security/password-step-up";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Params={params:Promise<{productId:string}>};
const reply=(body:unknown,status:number)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});

export async function GET(request:Request,{params}:Params){
  try{
    const context=await resolveTenantContext(await headers());requireFMPlanAuthority(context,false);
    const {productId}=await params;if(!UUID.test(productId))return reply({error:"approval.invalid"},400);
    const q=new URL(request.url).searchParams;
    if([...q.keys()].some(k=>k!=="action")||q.getAll("action").length>1)
      return reply({error:"approval.invalid"},400);
    const action=q.get("action")??"SUSPEND_DELINQUENCY";
    if(typeof action!=="string"||!["SUSPEND_DELINQUENCY","REACTIVATE_VERIFIED","SCHEDULE_CANCEL"].includes(action))
      return reply({error:"approval.invalid"},400);
    const [product]=await db.select({id:productDefinitions.id}).from(productDefinitions).where(and(
      eq(productDefinitions.tenantId,context.tenantId),eq(productDefinitions.id,productId),
      eq(productDefinitions.slug,"vendeatendeia"),eq(productDefinitions.status,"active"),
    )).limit(1);
    if(!product)return reply({error:"approval.unavailable"},403);
    const rows=await db.select({id:vendeLifecycleCommands.id,action:vendeLifecycleCommands.action,operationId:vendeLifecycleCommands.operationId,
      invoiceId:vendeLifecycleCommands.sourceInvoiceId,revision:vendeLifecycleCommands.revision,
      approvedAt:vendeLifecycleCommands.approvedAt,claimedAt:vendeLifecycleCommands.claimedAt,
      createdAt:vendeLifecycleCommands.createdAt,
    }).from(vendeLifecycleCommands).where(and(
      eq(vendeLifecycleCommands.tenantId,context.tenantId),eq(vendeLifecycleCommands.productId,productId),
      eq(vendeLifecycleCommands.action,action),eq(vendeLifecycleCommands.state,"pending"),
      ...(action==="SCHEDULE_CANCEL"?[lt(vendeLifecycleCommands.effectiveDate,fmLocalCivilDate(new Date()))]:[]),
      isNull(vendeLifecycleCommands.claimedAt),isNull(vendeLifecycleCommands.deliveredAt),
      or(isNull(vendeLifecycleCommands.approvedAt),lt(vendeLifecycleCommands.approvedAt,new Date(Date.now()-300_000))),
    )).orderBy(asc(vendeLifecycleCommands.createdAt),asc(vendeLifecycleCommands.id)).limit(51);
    return reply({items:rows.slice(0,50),truncated:rows.length>50},200);
  }catch{return reply({error:"approval.unavailable"},403);}
}

export async function POST(request:Request,{params}:Params){
  try{
    const h=await headers();const context=await resolveTenantContext(h);requireFMPlanAuthority(context,true);
    const {productId}=await params;if(!UUID.test(productId))return reply({error:"approval.invalid"},400);
    if(!request.body)return reply({error:"approval.invalid"},400);
    const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;let raw:unknown;
    try{
      for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
        if(size>2048){await reader.cancel();return reply({error:"approval.invalid"},400);}chunks.push(part.value);}
      raw=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }catch{return reply({error:"approval.invalid"},400);}finally{reader.releaseLock();}
    if(!raw||typeof raw!=="object"||Array.isArray(raw))return reply({error:"approval.invalid"},400);
    const b=raw as Record<string,unknown>;
    if(!["commandId,expectedApprovedAt,password","action,commandId,expectedApprovedAt,password"].includes(Object.keys(b).sort().join(","))||
       typeof b.commandId!=="string"||!UUID.test(b.commandId)||typeof b.password!=="string"||
       !b.password.trim()||b.password.length>128||
       (b.expectedApprovedAt!==null&&(typeof b.expectedApprovedAt!=="string"||b.expectedApprovedAt.length>30)))
      return reply({error:"approval.invalid"},400);
    const action=b.action??"SUSPEND_DELINQUENCY";
    if(!["SUSPEND_DELINQUENCY","REACTIVATE_VERIFIED","SCHEDULE_CANCEL"].includes(action))
      return reply({error:"approval.invalid"},400);
    const proof=await verifyPasswordStepUp(h,b.password);
    // The service validates the same actor and writes the complete approval
    // audit in its transaction; audit failure rolls back authorization.
    const input={productId,commandId:b.commandId,expectedApprovedAt:b.expectedApprovedAt as string|null};
    return reply(await (action==="REACTIVATE_VERIFIED"
      ?reapproveVendeReactivation(context,proof,input)
      :action==="SCHEDULE_CANCEL"?reapproveVendeFinalCancellation(context,proof,input)
      :reapproveVendeDelinquency(context,proof,input)),200);
  }catch{return reply({error:"approval.authority_or_state_denied"},403);}
}
