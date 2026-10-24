import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {auth} from "@/infrastructure/auth/auth";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {verifyPasswordStepUp} from "@/application/security/password-step-up";
import {readVendeRequestReconciliation} from
  "@/application/billing/vende-core-request-reconciliation";

type Params={params:Promise<{productId:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE=/^[A-Za-z0-9_.-]{1,128}$/;
const ID=/^[A-Za-z0-9_.:-]{1,128}$/;
const reply=(value:unknown,status:number)=>NextResponse.json(value,{
  status,headers:{"Cache-Control":"no-store"},
});
/** FM platform step-up, never self-serve/customer FinOps. No write or settlement. */
export async function POST(request:Request,{params}:Params){
  try{
    const {productId}=await params;
    if(!UUID.test(productId)||new URL(request.url).search||
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json"||
      !request.body)return reply({error:"request.invalid"},400);
    let bytes=0;const parts:Uint8Array[]=[];
    const reader=request.body.getReader();
    try{
      for(;;){
        const next=await reader.read();if(next.done)break;
        bytes+=next.value.byteLength;
        if(bytes>2048){await reader.cancel();return reply({error:"request.invalid"},400);}
        parts.push(next.value);
      }
    }finally{reader.releaseLock();}
    const raw:unknown=JSON.parse(Buffer.concat(parts).toString("utf8"));
    if(!raw||typeof raw!=="object"||Array.isArray(raw))
      return reply({error:"request.invalid"},400);
    const input=raw as Record<string,unknown>;
    if(Object.keys(input).sort().join(",")!==
      "externalTenantId,password,requestId,unitId"||
      typeof input.externalTenantId!=="string"||!SCOPE.test(input.externalTenantId)||
      typeof input.unitId!=="string"||!SCOPE.test(input.unitId)||
      typeof input.requestId!=="string"||!ID.test(input.requestId)||
      typeof input.password!=="string"||
      input.password.length<1||input.password.length>128)
      return reply({error:"request.invalid"},400);
    const incoming=await headers();
    const context=await resolveTenantContext(incoming);
    const session=await auth.api.getSession({headers:incoming});
    if(!session?.user?.id||session.user.id!==context.userId||!session.session.id)
      return reply({error:"request.denied"},403);
    const proof=await verifyPasswordStepUp(incoming,input.password);
    return reply(await readVendeRequestReconciliation(
      context,proof,session.session.id,{
        productId,externalTenantId:input.externalTenantId,
        unitId:input.unitId,requestId:input.requestId,
      },
    ),200);
  }catch{return reply({error:"request.unavailable"},403);}
}
