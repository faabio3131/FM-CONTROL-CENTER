import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {verifyPasswordStepUp} from "@/application/security/password-step-up";
import {
  prepareVendeCorrectionIntent,secondReviewVendeCorrectionIntent,
} from "@/application/billing/vende-compensation-correction-intent";

type Params={params:Promise<{productId:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const response=(body:unknown,status:number)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store"},
});
export async function POST(request:Request,{params}:Params){
  try{
    const {productId}=await params;
    if(!UUID.test(productId)||new URL(request.url).search||
       request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json"||
       !request.body)return response({error:"correction.invalid"},400);
    const reader=request.body.getReader();
    let size=0;const chunks:Uint8Array[]=[];
    try{
      for(;;){
        const part=await reader.read();if(part.done)break;
        size+=part.value.byteLength;
        if(size>1024){await reader.cancel();return response({error:"correction.invalid"},400);}
        chunks.push(part.value);
      }
    }finally{reader.releaseLock();}
    const value:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(!value||typeof value!=="object"||Array.isArray(value))
      return response({error:"correction.invalid"},400);
    const data=value as Record<string,unknown>;
    if(!["prepare","second_review"].includes(String(data.action))||
       typeof data.commandId!=="string"||!UUID.test(data.commandId)||
       typeof data.expectedReviewVersion!=="number"||
       !Number.isSafeInteger(data.expectedReviewVersion)||data.expectedReviewVersion<1||
       typeof data.password!=="string"||!data.password.trim()||data.password.length>128)
      return response({error:"correction.invalid"},400);
    const keys=Object.keys(data).sort().join(",");
    if(data.action==="prepare"&&keys!=="action,commandId,expectedReviewVersion,password")
      return response({error:"correction.invalid"},400);
    if(data.action==="second_review"&&(keys!=="action,commandId,expectedReviewVersion,intentId,password"||
       typeof data.intentId!=="string"||!UUID.test(data.intentId)))
      return response({error:"correction.invalid"},400);
    const h=await headers();
    const context=await resolveTenantContext(h);
    const proof=await verifyPasswordStepUp(h,data.password);
    const common={
      productId,commandId:data.commandId,
      expectedReviewVersion:data.expectedReviewVersion,
    };
    const result=data.action==="prepare"
      ?await prepareVendeCorrectionIntent(context,proof,common)
      :await secondReviewVendeCorrectionIntent(context,proof,{
        ...common,intentId:data.intentId as string,
      });
    return response(result,200);
  }catch{
    return response({error:"correction.authority_or_evidence_denied"},403);
  }
}
