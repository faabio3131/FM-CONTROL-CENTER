import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {auth} from "@/infrastructure/auth/auth";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {verifyPasswordStepUp} from "@/application/security/password-step-up";
import {readFMFinopsAlertPolicy,updateFMFinopsAlertPolicy}
  from "@/application/billing/vende-core-finops-policy";

type Params={params:Promise<{productId:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE=/^[A-Za-z0-9_.-]{1,128}$/;
const reply=(body:unknown,status:number)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store"},
});

export async function GET(request:Request,{params}:Params){
  try{
    const {productId}=await params;
    const url=new URL(request.url);
    if(!UUID.test(productId)||[...url.searchParams.keys()].sort().join(",")!==
       "externalTenantId,unitId")return reply({error:"finops.policy.invalid"},400);
    const externalTenantId=url.searchParams.get("externalTenantId")??"";
    const unitId=url.searchParams.get("unitId")??"";
    if(!SCOPE.test(externalTenantId)||!SCOPE.test(unitId))return reply({error:"finops.policy.invalid"},400);
    const context=await resolveTenantContext(await headers());
    return reply(await readFMFinopsAlertPolicy(context,{
      productId,externalTenantId,unitId,
    }),200);
  }catch{return reply({error:"finops.policy.unavailable"},403);}
}

export async function POST(request:Request,{params}:Params){
  try{
    const {productId}=await params;
    if(!UUID.test(productId)||new URL(request.url).search||
       request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json"||
       !request.body)return reply({error:"finops.policy.invalid"},400);
    const stream=request.body.getReader();
    let bytes=0;const chunks:Uint8Array[]=[];
    try{
      for(;;){
        const item=await stream.read();
        if(item.done)break;
        bytes+=item.value.byteLength;
        if(bytes>1024){await stream.cancel();return reply({error:"finops.policy.invalid"},400);}
        chunks.push(item.value);
      }
    }finally{stream.releaseLock();}
    const raw:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(!raw||typeof raw!=="object"||Array.isArray(raw))
      return reply({error:"finops.policy.invalid"},400);
    const input=raw as Record<string,unknown>;
    if(Object.keys(input).sort().join(",")!==
       "currency,enabled,expectedRevision,externalTenantId,maximumKnownCost,password,unitId"||
       typeof input.externalTenantId!=="string"||!SCOPE.test(input.externalTenantId)||
       typeof input.unitId!=="string"||!SCOPE.test(input.unitId)||
       typeof input.expectedRevision!=="number"||!Number.isSafeInteger(input.expectedRevision)||
       input.expectedRevision<0||typeof input.enabled!=="boolean"||
       input.currency!=="USD"||typeof input.maximumKnownCost!=="string"||
       input.maximumKnownCost.length>80||typeof input.password!=="string"||
       input.password.length>128)return reply({error:"finops.policy.invalid"},400);

    const incoming=await headers();
    const context=await resolveTenantContext(incoming);
    const session=await auth.api.getSession({headers:incoming});
    if(!session?.user?.id||session.user.id!==context.userId||!session.session.id)
      return reply({error:"finops.policy.denied"},403);
    const proof=await verifyPasswordStepUp(incoming,input.password);
    const result=await updateFMFinopsAlertPolicy(
      context,proof,session.session.id,
      {productId,externalTenantId:input.externalTenantId,unitId:input.unitId},
      {expectedRevision:input.expectedRevision,enabled:input.enabled,
       currency:"USD",maximumKnownCost:input.maximumKnownCost},
    );
    return reply(result,200);
  }catch{return reply({error:"finops.policy.unavailable"},403);}
}
