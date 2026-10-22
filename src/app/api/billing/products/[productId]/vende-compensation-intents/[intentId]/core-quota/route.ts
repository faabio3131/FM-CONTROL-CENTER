import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {planProjectionConfigFromEnvironment}
  from "@/application/billing/assistant-plan-outbox-dispatcher";
import {readVendeCoreQuotaEvidence}
  from "@/application/billing/vende-core-quota-readback";

type Params={params:Promise<{productId:string;intentId:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE=/^[A-Za-z0-9_.-]{1,128}$/;
const answer=(body:unknown,status:number)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store"},
});
export async function POST(request:Request,{params}:Params){
  try{
    const {productId,intentId}=await params;
    if(new URL(request.url).search||!UUID.test(productId)||!UUID.test(intentId)||
       request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json"||
       !request.body)return answer({error:"quota.invalid"},400);
    const reader=request.body.getReader();
    let length=0;const chunks:Uint8Array[]=[];
    try{
      for(;;){
        const next=await reader.read();if(next.done)break;
        length+=next.value.byteLength;
        if(length>512){await reader.cancel();return answer({error:"quota.invalid"},400);}
        chunks.push(next.value);
      }
    }finally{reader.releaseLock();}
    const raw:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(!raw||typeof raw!=="object"||Array.isArray(raw))
      return answer({error:"quota.invalid"},400);
    const input=raw as Record<string,unknown>;
    if(Object.keys(input).sort().join(",")!=="capability,unitId"||
       typeof input.unitId!=="string"||!SCOPE.test(input.unitId)||
       !["atendimento_interpretacao","atendimento_transcricao"].includes(String(input.capability)))
      return answer({error:"quota.invalid"},400);
    const context=await resolveTenantContext(await headers());
    return answer(await readVendeCoreQuotaEvidence(context,{
      productId,intentId,unitId:input.unitId,
      capability:input.capability as "atendimento_interpretacao"|"atendimento_transcricao",
    },planProjectionConfigFromEnvironment()),200);
  }catch{
    return answer({error:"quota.authority_or_evidence_unavailable"},403);
  }
}
