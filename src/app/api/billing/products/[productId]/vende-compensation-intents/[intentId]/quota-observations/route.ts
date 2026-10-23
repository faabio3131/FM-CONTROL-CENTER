import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {verifyPasswordStepUp} from "@/application/security/password-step-up";
import {planProjectionConfigFromEnvironment}
  from "@/application/billing/assistant-plan-outbox-dispatcher";
import {
  recordVendeCorrectionQuotaObservation,readVendeCorrectionQuotaObservations,
} from "@/application/billing/vende-compensation-quota-observation";

type Params={params:Promise<{productId:string;intentId:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE=/^[A-Za-z0-9_.-]{1,128}$/;
const respond=(body:unknown,status:number)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store"},
});
export async function GET(request:Request,{params}:Params){
  try{
    if(new URL(request.url).search)return respond({error:"quota.observation.invalid"},400);
    const {productId,intentId}=await params;
    if(!UUID.test(productId)||!UUID.test(intentId))
      return respond({error:"quota.observation.invalid"},400);
    const context=await resolveTenantContext(await headers());
    return respond(await readVendeCorrectionQuotaObservations(context,{
      productId,intentId,
    }),200);
  }catch{return respond({error:"quota.observation.unavailable"},403);}
}
export async function POST(request:Request,{params}:Params){
  try{
    const {productId,intentId}=await params;
    if(!UUID.test(productId)||!UUID.test(intentId)||new URL(request.url).search||
       request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json"||
       !request.body)return respond({error:"quota.observation.invalid"},400);
    const stream=request.body.getReader();const parts:Uint8Array[]=[];let bytes=0;
    try{
      for(;;){
        const next=await stream.read();if(next.done)break;
        bytes+=next.value.byteLength;
        if(bytes>512){await stream.cancel();return respond({error:"quota.observation.invalid"},400);}
        parts.push(next.value);
      }
    }finally{stream.releaseLock();}
    const parsed:unknown=JSON.parse(Buffer.concat(parts).toString("utf8"));
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
      return respond({error:"quota.observation.invalid"},400);
    const data=parsed as Record<string,unknown>;
    if(Object.keys(data).sort().join(",")!=="capability,observationId,password,unitId"||
       typeof data.observationId!=="string"||!UUID.test(data.observationId)||
       typeof data.unitId!=="string"||!SCOPE.test(data.unitId)||
       !["atendimento_interpretacao","atendimento_transcricao"].includes(String(data.capability))||
       typeof data.password!=="string"||!data.password.trim()||data.password.length>128)
      return respond({error:"quota.observation.invalid"},400);
    const h=await headers();
    const context=await resolveTenantContext(h);
    const proof=await verifyPasswordStepUp(h,data.password);
    const result=await recordVendeCorrectionQuotaObservation(
      context,proof,{
        productId,intentId,observationId:data.observationId,
        unitId:data.unitId,
        capability:data.capability as "atendimento_interpretacao"|"atendimento_transcricao",
      },planProjectionConfigFromEnvironment(),
    );
    return respond(result,200);
  }catch{return respond({error:"quota.observation.authority_or_evidence_denied"},403);}
}
