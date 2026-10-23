import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {auth} from "@/infrastructure/auth/auth";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {verifyPasswordStepUp} from "@/application/security/password-step-up";
import {importProviderExport,readProviderAttempts,readProviderComparison}
  from "@/application/billing/vende-core-provider-exports";
import type {ImportSource}
  from "@/application/billing/vende-core-provider-exports";

type Params={params:Promise<{productId:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE=/^[A-Za-z0-9_.-]{1,128}$/;
const valid=(v:unknown,max=128):v is string=>
  typeof v==="string"&&v.trim().length>0&&v.length<=max;
const reply=(body:unknown,status:number)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store"},
});
export async function GET(request:Request,{params}:Params){
  try{
    const {productId}=await params;
    if(!UUID.test(productId))return reply({error:"export.invalid"},400);
    const query=new URL(request.url).searchParams;
    if([...query.keys()].some(k=>![
      "externalTenantId","unitId","requestId","attemptId",
    ].includes(k))||[...query.keys()].some(k=>query.getAll(k).length!==1))
      return reply({error:"export.invalid"},400);
    const externalTenantId=query.get("externalTenantId");
    const unitId=query.get("unitId");
    const requestId=query.get("requestId");
    const attemptId=query.get("attemptId");
    if(!externalTenantId||!SCOPE.test(externalTenantId)||
      !unitId||!SCOPE.test(unitId)||!valid(requestId)||
      !(attemptId===null||valid(attemptId)))
      return reply({error:"export.invalid"},400);
    const context=await resolveTenantContext(await headers());
    const scope={productId,externalTenantId,unitId,requestId};
    return reply(attemptId===null?
      await readProviderAttempts(context,scope):
      await readProviderComparison(context,scope,attemptId),200);
  }catch{return reply({error:"export.unavailable"},403);}
}
export async function POST(request:Request,{params}:Params){
  try{
    const {productId}=await params;
    if(!UUID.test(productId)||new URL(request.url).search||
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json"||
      !request.body)return reply({error:"export.invalid"},400);
    const reader=request.body.getReader();
    const chunks:Uint8Array[]=[];let length=0;
    try{
      for(;;){
        const part=await reader.read();if(part.done)break;
        length+=part.value.byteLength;
        if(length>4096){await reader.cancel();return reply({error:"export.invalid"},400);}
        chunks.push(part.value);
      }
    }finally{reader.releaseLock();}
    const raw:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(!raw||typeof raw!=="object"||Array.isArray(raw))
      return reply({error:"export.invalid"},400);
    const input=raw as Record<string,unknown>;
    if(Object.keys(input).sort().join(",")!=="externalTenantId,password,requestId,source,unitId"||
      typeof input.externalTenantId!=="string"||!SCOPE.test(input.externalTenantId)||
      typeof input.unitId!=="string"||!SCOPE.test(input.unitId)||
      !valid(input.requestId)||!valid(input.password)||
      input.password.length>128||
      !input.source||typeof input.source!=="object"||Array.isArray(input.source))
      return reply({error:"export.invalid"},400);
    const source=input.source as Record<string,unknown>;
    if(Object.keys(source).sort().join(",")!==
      "accountRef,adapter,attemptId,costUsd,model,observedAt,provider,sourceRef,usage"||
      !valid(source.attemptId)||!valid(source.provider)||
      !valid(source.model,200)||!valid(source.accountRef)||
      !valid(source.sourceRef)||!valid(source.observedAt,40)||
      (source.adapter!=="gemini"&&source.adapter!=="openai_compatible")||
      !(source.costUsd===null||typeof source.costUsd==="string")||
      !source.usage||typeof source.usage!=="object"||Array.isArray(source.usage))
      return reply({error:"export.invalid"},400);
    const incoming=await headers();
    const context=await resolveTenantContext(incoming);
    const session=await auth.api.getSession({headers:incoming});
    if(!session?.user?.id||session.user.id!==context.userId||!session.session.id)
      return reply({error:"export.denied"},403);
    const proof=await verifyPasswordStepUp(incoming,input.password);
    const status=await importProviderExport(
      context,proof,session.session.id,{
        productId,externalTenantId:input.externalTenantId,
        unitId:input.unitId,requestId:input.requestId,
      },source as unknown as ImportSource,
    );
    return reply({status},200);
  }catch{return reply({error:"export.unavailable"},403);}
}
