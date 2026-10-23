import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {verifyPasswordStepUp} from "@/application/security/password-step-up";
import {planProjectionConfigFromEnvironment}
  from "@/application/billing/assistant-plan-outbox-dispatcher";
import {closeVendeCommercialCompensationCase}
  from "@/application/billing/vende-compensation-closure";

type Params={params:Promise<{productId:string;intentId:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNIT=/^[A-Za-z0-9_.-]{1,128}$/;
const respond=(body:unknown,status:number)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store"},
});
export async function POST(request:Request,{params}:Params){
  try{
    const {productId,intentId}=await params;
    if(!UUID.test(productId)||!UUID.test(intentId)||
       new URL(request.url).search||
       request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json"||
       !request.body)return respond({error:"closure.invalid"},400);
    const reader=request.body.getReader();const chunks:Uint8Array[]=[];
    let bytes=0;
    try{
      for(;;){
        const chunk=await reader.read();if(chunk.done)break;
        bytes+=chunk.value.byteLength;
        if(bytes>1024){await reader.cancel();return respond({error:"closure.invalid"},400);}
        chunks.push(chunk.value);
      }
    }finally{reader.releaseLock();}
    const raw:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(!raw||typeof raw!=="object"||Array.isArray(raw))
      return respond({error:"closure.invalid"},400);
    const input=raw as Record<string,unknown>;
    if(Object.keys(input).sort().join(",")!==
         "closureId,expectedRevision,password,unitId"||
       typeof input.closureId!=="string"||!UUID.test(input.closureId)||
       typeof input.unitId!=="string"||!UNIT.test(input.unitId)||
       !Number.isSafeInteger(input.expectedRevision)||
       (input.expectedRevision as number)<1||
       typeof input.password!=="string"||!input.password.trim()||
       input.password.length>128)return respond({error:"closure.invalid"},400);
    const h=await headers();
    const context=await resolveTenantContext(h);
    const proof=await verifyPasswordStepUp(h,input.password);
    const result=await closeVendeCommercialCompensationCase(context,proof,{
      productId,intentId,closureId:input.closureId,
      unitId:input.unitId,expectedRevision:input.expectedRevision as number,
    },planProjectionConfigFromEnvironment());
    return respond(result,200);
  }catch{
    return respond({error:"closure.authorization_or_evidence_denied"},403);
  }
}
