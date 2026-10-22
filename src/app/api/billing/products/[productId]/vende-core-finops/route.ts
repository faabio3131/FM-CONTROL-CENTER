import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {readVendeCoreFinops} from "@/application/billing/vende-core-finops-reader";

type Params={params:Promise<{productId:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE=/^[A-Za-z0-9_.-]{1,128}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const reply=(body:unknown,status:number)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store"},
});
export async function POST(request:Request,{params}:Params){
  try{
    const {productId}=await params;
    if(!UUID.test(productId)||new URL(request.url).search||
       request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json"||
       !request.body)return reply({error:"finops.invalid"},400);
    let size=0;
    const parts:Uint8Array[]=[];
    const reader=request.body.getReader();
    try{
      for(;;){
        const chunk=await reader.read();
        if(chunk.done)break;
        size+=chunk.value.byteLength;
        if(size>1024){await reader.cancel();return reply({error:"finops.invalid"},400);}
        parts.push(chunk.value);
      }
    }finally{reader.releaseLock();}
    const raw:unknown=JSON.parse(Buffer.concat(parts).toString("utf8"));
    if(!raw||typeof raw!=="object"||Array.isArray(raw))return reply({error:"finops.invalid"},400);
    const input=raw as Record<string,unknown>;
    if(Object.keys(input).sort().join(",")!=="endDate,externalTenantId,startDate,unitId"||
       typeof input.externalTenantId!=="string"||!SCOPE.test(input.externalTenantId)||
       typeof input.unitId!=="string"||!SCOPE.test(input.unitId)||
       typeof input.startDate!=="string"||!DATE.test(input.startDate)||
       typeof input.endDate!=="string"||!DATE.test(input.endDate))
      return reply({error:"finops.invalid"},400);
    const context=await resolveTenantContext(await headers());
    const result=await readVendeCoreFinops(context,{
      productId,externalTenantId:input.externalTenantId,unitId:input.unitId,
      startDate:input.startDate,endDate:input.endDate,
    });
    return reply(result,200);
  }catch{
    return reply({error:"finops.not_configured_or_authorized"},403);
  }
}
