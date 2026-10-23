import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {verifyPasswordStepUp} from "@/application/security/password-step-up";
import {readVendeCompensationReviews,triageVendeCompensationRisk}
  from "@/application/billing/vende-compensation-review";

type Params={params:Promise<{productId:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status:number)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store"},
});
export async function GET(request:Request,{params}:Params){
  try{
    const url=new URL(request.url);
    if([...url.searchParams.keys()].some(k=>k!=="after")||
      url.searchParams.getAll("after").length>1||
      url.searchParams.toString().length>192)
      return reply({error:"review.invalid"},400);
    const after=url.searchParams.get("after");
    if(after!==null&&(!after||after.length>128||
      !/^[A-Za-z0-9_-]+$/.test(after)))
      return reply({error:"review.invalid"},400);
    const context=await resolveTenantContext(await headers());
    const {productId}=await params;
    return reply(await readVendeCompensationReviews(
      context,productId,after??undefined),200);
  }catch{return reply({error:"review.unavailable"},403);}
}
export async function POST(request:Request,{params}:Params){
  try{
    const h=await headers();
    const context=await resolveTenantContext(h);
    const {productId}=await params;
    if(!UUID.test(productId)||!request.body)return reply({error:"review.invalid"},400);
    let size=0;const chunks:Uint8Array[]=[];const reader=request.body.getReader();
    try{
      for(;;){
        const part=await reader.read();if(part.done)break;
        size+=part.value.byteLength;
        if(size>2048){await reader.cancel();return reply({error:"review.invalid"},400);}
        chunks.push(part.value);
      }
    }finally{reader.releaseLock();}
    const input:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(!input||typeof input!=="object"||Array.isArray(input))
      return reply({error:"review.invalid"},400);
    const o=input as Record<string,unknown>;
    if(Object.keys(o).sort().join(",")!=="commandId,decision,expectedVersion,password,reasonCode"||
       typeof o.commandId!=="string"||!UUID.test(o.commandId)||
       !Number.isSafeInteger(o.expectedVersion)||(o.expectedVersion as number)<0||
       (o.decision!=="investigating"&&o.decision!=="escalated")||
       typeof o.reasonCode!=="string"||!/^[a-z][a-z0-9_]{3,47}$/.test(o.reasonCode)||
       typeof o.password!=="string"||!o.password.trim()||o.password.length>128)
      return reply({error:"review.invalid"},400);
    const proof=await verifyPasswordStepUp(h,o.password);
    const response=await triageVendeCompensationRisk(context,proof,{
      productId,commandId:o.commandId,expectedVersion:o.expectedVersion as number,
      decision:o.decision,reasonCode:o.reasonCode,
    });
    return reply(response,200);
  }catch{return reply({error:"review.authority_or_state_denied"},403);}
}
