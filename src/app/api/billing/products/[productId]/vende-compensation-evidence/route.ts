import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {verifyPasswordStepUp} from "@/application/security/password-step-up";
import {planProjectionConfigFromEnvironment} from "@/application/billing/assistant-plan-outbox-dispatcher";
import {observeVendeCompensationEvidence} from "@/application/billing/vende-compensation-evidence-review";
type Params={params:Promise<{productId:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status:number)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:Request,{params}:Params){
  try{
    const h=await headers();const context=await resolveTenantContext(h);
    const {productId}=await params;
    if(!UUID.test(productId)||!request.body)return reply({error:"evidence.invalid"},400);
    let size=0;const chunks:Uint8Array[]=[];
    const reader=request.body.getReader();
    try{
      for(;;){const part=await reader.read();if(part.done)break;
        size+=part.value.byteLength;if(size>1024){await reader.cancel();return reply({error:"evidence.invalid"},400);}
        chunks.push(part.value);
      }
    }finally{reader.releaseLock();}
    const raw:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(!raw||typeof raw!=="object"||Array.isArray(raw))return reply({error:"evidence.invalid"},400);
    const o=raw as Record<string,unknown>;
    if(Object.keys(o).sort().join(",")!=="commandId,expectedReviewVersion,password"||
       typeof o.commandId!=="string"||!UUID.test(o.commandId)||
       !Number.isSafeInteger(o.expectedReviewVersion)||(o.expectedReviewVersion as number)<1||
       typeof o.password!=="string"||!o.password.trim()||o.password.length>128)
      return reply({error:"evidence.invalid"},400);
    const proof=await verifyPasswordStepUp(h,o.password);
    const result=await observeVendeCompensationEvidence(context,proof,{
      productId,commandId:o.commandId,expectedReviewVersion:o.expectedReviewVersion as number,
    },planProjectionConfigFromEnvironment());
    return reply(result,200);
  }catch{return reply({error:"evidence.authority_or_state_denied"},403);}
}
