import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/infrastructure/db/client";
import { productDefinitions } from "@/infrastructure/db/platform-schema";
import { vendeBusinessCalendars } from "@/infrastructure/db/vende-commercial-schema";
import { requireFMPlanAuthority } from "@/application/billing/assistant-plan-catalog-service";
import { GovernedVendeC06Service } from "@/application/billing/vende-c06-governed-execution";
import { recordAuditEvent } from "@/application/audit/record-audit-event";
import { verifyPasswordStepUp } from "@/application/security/password-step-up";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";

type RouteContext={params:Promise<{productId:string}>};
const service=new GovernedVendeC06Service();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status:number)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store"},
});
/** FM restricted read model of approved holiday versions. Never accept
 * a client-supplied tenant or calendar authority designation.
 */
export async function GET(_request:Request,{params}:RouteContext){
  try {
    const context=await resolveTenantContext(await headers());
    requireFMPlanAuthority(context,false);
    const {productId}=await params;
    if(!UUID.test(productId))return reply({error:"calendar.product_invalid"},400);
    const [product]=await db.select({slug:productDefinitions.slug}).from(productDefinitions).where(and(
      eq(productDefinitions.tenantId,context.tenantId),
      eq(productDefinitions.id,productId),
    )).limit(1);
    if(product?.slug!=="vendeatendeia")return reply({error:"calendar.product_unavailable"},403);
    const rows=await db.select({
      id:vendeBusinessCalendars.id,region:vendeBusinessCalendars.region,
      revision:vendeBusinessCalendars.revision,
      validFrom:vendeBusinessCalendars.validFrom,
      validThrough:vendeBusinessCalendars.validThrough,
      holidays:vendeBusinessCalendars.holidays,
      sourceRef:vendeBusinessCalendars.sourceRef,
      actorId:vendeBusinessCalendars.actorId,
      approvedAt:vendeBusinessCalendars.approvedAt,
    }).from(vendeBusinessCalendars).where(and(
      eq(vendeBusinessCalendars.tenantId,context.tenantId),
      eq(vendeBusinessCalendars.productId,productId),
    )).orderBy(desc(vendeBusinessCalendars.approvedAt)).limit(100);
    return reply({calendars:rows,version:"fm.vende.calendar.v1",truncated:rows.length===100},200);
  }catch{return reply({error:"calendar.read_unavailable"},403);}
}

/** Manual FM approval only. Writes require corporate RBAC, human password
 * step-up, pre-audit and immutable monotonic calendar revision.
 */
export async function POST(request:Request,{params}:RouteContext){
  try{
    const h=await headers();
    const context=await resolveTenantContext(h);
    requireFMPlanAuthority(context,true);
    const {productId}=await params;
    if(!UUID.test(productId))return reply({error:"calendar.payload_invalid"},400);
    const raw:unknown=await request.json().catch(()=>null);
    if(!raw || typeof raw!=="object" || Array.isArray(raw))
      return reply({error:"calendar.payload_invalid"},400);
    const body=raw as Record<string,unknown>;
    if(Object.keys(body).sort().join(",")!=="holidays,password,region,revision,sourceRef,validFrom,validThrough" ||
       typeof body.password!=="string" || body.password.length>128 ||
       typeof body.region!=="string" || typeof body.sourceRef!=="string" ||
       typeof body.validFrom!=="string" || typeof body.validThrough!=="string" ||
       !Array.isArray(body.holidays) || !body.holidays.every(x=>typeof x==="string") ||
       !Number.isSafeInteger(body.revision))return reply({error:"calendar.payload_invalid"},400);
    const proof=await verifyPasswordStepUp(h,body.password);
    if(proof.userId!==context.userId)return reply({error:"calendar.fm_authority_required"},403);
    await recordAuditEvent(context,{
      action:"vende.calendar.publish_requested",resourceType:"product",
      resourceId:productId,result:"allowed",
      metadata:{region:body.region,revision:body.revision,sourceRef:body.sourceRef},
    });
    const item=await service.publishCalendar(context,proof,{
      productId,region:body.region,revision:body.revision as number,
      validFrom:body.validFrom,validThrough:body.validThrough,
      holidays:body.holidays as string[],sourceRef:body.sourceRef,
    });
    await recordAuditEvent(context,{
      action:"vende.calendar.published",resourceType:"product",resourceId:productId,
      result:"success",metadata:{region:body.region,revision:item.revision},
    });
    return reply({id:item.id,revision:item.revision,state:"approved"},201);
  }catch{return reply({error:"calendar.authority_or_revision_denied"},403);}
}
