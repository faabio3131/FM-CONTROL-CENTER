import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {auth} from "@/infrastructure/auth/auth";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {verifyPasswordStepUp} from "@/application/security/password-step-up";
import {syncProviderExportFeed,validateProviderFeedSyncRequest}
  from "@/application/billing/vende-core-provider-exports";

type Params={params:Promise<{productId:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE=/^[A-Za-z0-9_.-]{1,128}$/;
const ID=/^[A-Za-z0-9_.:-]{1,128}$/;
const reply=(data:unknown,status:number)=>NextResponse.json(data,{
  status,headers:{"Cache-Control":"no-store"},
});
export async function POST(request:Request,{params}:Params){
  try{
    const {productId}=await params;
    if(!UUID.test(productId)||new URL(request.url).search||
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json"||
      !request.body)return reply({error:"feed.invalid"},400);
    const reader=request.body.getReader();
    const chunks:Uint8Array[]=[];let size=0;
    try{
      for(;;){
        const next=await reader.read();if(next.done)break;
        size+=next.value.byteLength;
        if(size>2048){await reader.cancel();return reply({error:"feed.invalid"},400);}
        chunks.push(next.value);
      }
    }finally{reader.releaseLock();}
    const data:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(!data||typeof data!=="object"||Array.isArray(data))
      return reply({error:"feed.invalid"},400);
    const input=data as Record<string,unknown>;
    if(Object.keys(input).sort().join(",")!==
      "accountRef,endDate,externalTenantId,limit,page,password,provider,startDate,unitId"||
      typeof input.externalTenantId!=="string"||!SCOPE.test(input.externalTenantId)||
      typeof input.unitId!=="string"||!SCOPE.test(input.unitId)||
      typeof input.provider!=="string"||!ID.test(input.provider)||
      typeof input.accountRef!=="string"||!ID.test(input.accountRef)||
      typeof input.startDate!=="string"||typeof input.endDate!=="string"||
      typeof input.password!=="string"||input.password.length<1||
      input.password.length>128||
      typeof input.page!=="number"||typeof input.limit!=="number")
      return reply({error:"feed.invalid"},400);
    const feed={
      provider:input.provider,accountRef:input.accountRef,
      startDate:input.startDate,endDate:input.endDate,
      page:input.page,limit:input.limit,
    };
    try{validateProviderFeedSyncRequest(feed);}catch{
      return reply({error:"feed.invalid"},400);
    }
    const incoming=await headers();
    const context=await resolveTenantContext(incoming);
    const session=await auth.api.getSession({headers:incoming});
    if(!session?.user?.id||session.user.id!==context.userId||!session.session.id)
      return reply({error:"feed.denied"},403);
    const proof=await verifyPasswordStepUp(incoming,input.password);
    const result=await syncProviderExportFeed(
      context,proof,session.session.id,
      {productId,externalTenantId:input.externalTenantId,unitId:input.unitId},
      feed,
    );
    return reply(result,200);
  }catch{return reply({error:"feed.unavailable"},403);}
}
