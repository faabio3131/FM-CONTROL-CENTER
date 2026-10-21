import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/application/audit/record-audit-event";
import { requireFMPlanAuthority } from "@/application/billing/assistant-plan-catalog-service";
import { GovernedVendeC06Service } from "@/application/billing/vende-c06-governed-execution";
import { verifyPasswordStepUp } from "@/application/security/password-step-up";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";

const service=new GovernedVendeC06Service();
const respond=(body:unknown,status:number)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store"},
});
async function limitedBody(request:Request):Promise<unknown>{
  if(!request.body)return null;
  const stream=request.body.getReader();
  const parts:Uint8Array[]=[];
  let size=0;
  try{
    while(true){
      const next=await stream.read();
      if(next.done)break;
      size+=next.value.byteLength;
      if(size>8192)throw Error("oversize");
      parts.push(next.value);
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
  }finally{stream.releaseLock();}
}
/** FM-only supervised contract enrollment and *pending* delinquency intent.
 * No customer may pass tenant, actor, provider URL, gateway status or decision.
 * Even successful suspension preparation DOES NOT change Assistant entitlement.
 */
export async function POST(request:Request){
  try{
    const h=await headers();
    const context=await resolveTenantContext(h);
    requireFMPlanAuthority(context,true);
    const raw=await limitedBody(request);
    if(!raw || typeof raw!=="object" || Array.isArray(raw))
      return respond({error:"vende.c06_payload_invalid"},400);
    const body=raw as Record<string,unknown>;
    const requested=body.action;
    if(!["enroll_paid_term","request_delinquency_suspension",
          "schedule_cancellation","request_regularization"].includes(String(requested)))
      return respond({error:"vende.c06_payload_invalid"},400);
    const allowed=requested==="enroll_paid_term"
      ?["action","password","productId","subscriptionId","invoiceId","effectiveFrom",
        "paidThrough","dueDate","calendarRegion","sourceRef","operationId","autoRenew"]
      :requested==="schedule_cancellation"
      ?["action","password","productId","subscriptionId","expectedRevision",
        "customerConsentRef","operationId"]
      :requested==="request_regularization"
      ?["action","password","productId","subscriptionId","paidInvoiceId",
        "expectedRevision","sourceRef","operationId"]
      :["action","password","productId","subscriptionId","invoiceId",
        "expectedRevision","sourceRef","operationId"];
    if(Object.keys(body).sort().join(",")!==allowed.sort().join(",") ||
       typeof body.password!=="string"||body.password.length>128||
       typeof body.productId!=="string"||typeof body.subscriptionId!=="string"||
       typeof body.operationId!=="string"||
       (requested==="schedule_cancellation"
         ? typeof body.customerConsentRef!=="string"
         : typeof body.sourceRef!=="string") ||
       (requested==="enroll_paid_term"||requested==="request_delinquency_suspension"
         ? typeof body.invoiceId!=="string"
         : requested==="request_regularization"
         ? typeof body.paidInvoiceId!=="string" : false))
      return respond({error:"vende.c06_payload_invalid"},400);
    if(requested==="enroll_paid_term" && (
      typeof body.effectiveFrom!=="string"||typeof body.paidThrough!=="string"||
      typeof body.dueDate!=="string"||typeof body.calendarRegion!=="string"||
      typeof body.autoRenew!=="boolean"))
      return respond({error:"vende.c06_payload_invalid"},400);
    if(requested!=="enroll_paid_term" &&
       (!Number.isSafeInteger(body.expectedRevision) ||
         (body.expectedRevision as number)<1))
      return respond({error:"vende.c06_payload_invalid"},400);
    const proof=await verifyPasswordStepUp(h,body.password);
    if(proof.userId!==context.userId)return respond({error:"vende.c06_authority_denied"},403);
    await recordAuditEvent(context,{
      action:"vende.c06.execution_requested",resourceType:"subscription",
      resourceId:body.subscriptionId,result:"allowed",
      metadata:{action:requested,operationId:body.operationId},
    });
    const result=requested==="enroll_paid_term"
      ?await service.enrollPaidTerm(context,proof,{
        productId:body.productId,subscriptionId:body.subscriptionId,
        invoiceId:body.invoiceId as string,effectiveFrom:body.effectiveFrom as string,
        paidThrough:body.paidThrough as string,dueDate:body.dueDate as string,
        calendarRegion:body.calendarRegion as string,sourceRef:body.sourceRef as string,
        operationId:body.operationId,autoRenew:body.autoRenew as boolean,
      })
      :requested==="schedule_cancellation"
      ?await service.scheduleCancellation(context,proof,{
        productId:body.productId,subscriptionId:body.subscriptionId,
        expectedRevision:body.expectedRevision as number,
        operationId:body.operationId,customerConsentRef:body.customerConsentRef as string,
      })
      :requested==="request_regularization"
      ?await service.requestRegularization(context,proof,{
        productId:body.productId,subscriptionId:body.subscriptionId,
        paidInvoiceId:body.paidInvoiceId as string,
        expectedRevision:body.expectedRevision as number,
        operationId:body.operationId,sourceRef:body.sourceRef as string,
      })
      :await service.requestSuspension(context,proof,{
        productId:body.productId,subscriptionId:body.subscriptionId,
        invoiceId:body.invoiceId as string,expectedRevision:body.expectedRevision as number,
        operationId:body.operationId,sourceRef:body.sourceRef as string,
      });
    await recordAuditEvent(context,{
      action:"vende.c06.execution_recorded",resourceType:"subscription",
      resourceId:body.subscriptionId,result:"success",
      metadata:{action:requested,operationId:body.operationId},
    });
    return respond({result,deliveryConfirmed:false},202);
  }catch{
    return respond({error:"vende.c06_authority_or_evidence_denied"},403);
  }
}
