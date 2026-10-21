import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/application/audit/record-audit-event";
import { requireFMPlanAuthority } from "@/application/billing/assistant-plan-catalog-service";
import { VendePaymentReadbackService } from "@/application/billing/vende-payment-readback-service";
import { verifyPasswordStepUp } from "@/application/security/password-step-up";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";

type RouteContext={params:Promise<{productId:string}>};
const service=new VendePaymentReadbackService();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status:number)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
async function bodyOf(request:Request):Promise<unknown>{
  if(!request.body)return null;
  const reader=request.body.getReader();const parts:Uint8Array[]=[];let size=0;
  try{
    for(;;){const next=await reader.read();if(next.done)break;
      size+=next.value.byteLength;
      if(size>4096){await reader.cancel();return null;}
      parts.push(next.value);
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
  }catch{return null;}finally{reader.releaseLock();}
}

export async function GET(request:Request,{params}:RouteContext){
  try{
    const context=await resolveTenantContext(await headers());requireFMPlanAuthority(context,false);
    const {productId}=await params;const query=new URL(request.url).searchParams;
    const invoiceId=query.get("invoiceId")??"";
    if(!UUID.test(productId)||!UUID.test(invoiceId)||[...query.keys()].join(",")!=="invoiceId")
      return reply({error:"readback.payload_invalid"},400);
    return reply(await service.inspect(context,{productId,invoiceId}),200);
  }catch{return reply({error:"readback.read_unavailable"},403);}
}

/** Browser supplies operation intent only; payment evidence and configuration
 * are server-owned. No public payload can assert a provider outcome. */
export async function POST(request:Request,{params}:RouteContext){
  try{
    const h=await headers();const context=await resolveTenantContext(h);requireFMPlanAuthority(context,true);
    const {productId}=await params;const raw=await bodyOf(request);
    if(!UUID.test(productId)||!raw||typeof raw!=="object"||Array.isArray(raw))
      return reply({error:"readback.payload_invalid"},400);
    const b=raw as Record<string,unknown>;
    const fields=b.action==="bind"?["action","password","invoiceId","providerCustomerRef","sourceRef"]:
      b.action==="observe"?["action","password","invoiceId","observationId"]:
      b.action==="quarantine"?["action","password","invoiceId"]:[];
    if(fields.length===0||Object.keys(b).sort().join(",")!==fields.sort().join(",")||
       typeof b.password!=="string"||!b.password.trim()||b.password.length>128||
       typeof b.invoiceId!=="string"||!UUID.test(b.invoiceId)||
       (b.action==="observe"&&(typeof b.observationId!=="string"||!UUID.test(b.observationId)))||
       (b.action==="bind"&&(typeof b.providerCustomerRef!=="string"||
        !/^cus_[A-Za-z0-9_-]{1,128}$/.test(b.providerCustomerRef)||typeof b.sourceRef!=="string"||
        !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{3,127}$/.test(b.sourceRef))))
      return reply({error:"readback.payload_invalid"},400);
    if(b.action==="observe"&&process.env.FM_COMMAND_VENDE_PAYMENT_READBACK_ENABLED!=="true")
      return reply({error:"readback.disabled"},403);
    const proof=await verifyPasswordStepUp(h,b.password);
    if(proof.userId!==context.userId)return reply({error:"readback.authority_denied"},403);
    await recordAuditEvent(context,{action:"vende.readback.requested",resourceType:"invoice",
      resourceId:b.invoiceId,result:"allowed",metadata:{operation:b.action,productId}});
    const identity={productId,invoiceId:b.invoiceId};
    const result=b.action==="bind"
      ?await service.bindPayer(context,proof,{...identity,providerCustomerRef:b.providerCustomerRef as string,sourceRef:b.sourceRef as string})
      :b.action==="observe"?await service.observe(context,proof,{...identity,observationId:b.observationId as string})
      :await service.quarantine(context,proof,identity);
    // The service commits its result and audit atomically. Never add a separate
    // fallible post-audit which could disguise an already committed operation.
    return reply({result,financialStateChanged:false},200);
  }catch{return reply({error:"readback.authority_or_state_denied"},403);}
}
