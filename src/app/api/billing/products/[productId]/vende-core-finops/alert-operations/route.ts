import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {auth} from "@/infrastructure/auth/auth";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {verifyPasswordStepUp} from "@/application/security/password-step-up";
import {
  operateFMFinopsAlertOutbox,readFMFinopsOperationalOutbox,
  type FMFinopsAlertOperation,
} from "@/application/billing/vende-core-finops-policy";

type Params={params:Promise<{productId:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE=/^[A-Za-z0-9_.-]{1,128}$/;
const FINGERPRINT=/^[0-9a-f]{64}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const response=(body:unknown,status:number)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store"},
});

export async function GET(request:Request,{params}:Params){
  const {productId}=await params;
  const query=new URL(request.url).searchParams;
  const keys=[...query.keys()].sort();
  if(!UUID.test(productId)||keys.join(",")!=="externalTenantId,unitId"||
     [...query].some(([key])=>query.getAll(key).length!==1))
    return response({error:"finops.outbox.invalid"},400);
  const externalTenantId=query.get("externalTenantId")??"";
  const unitId=query.get("unitId")??"";
  if(!SCOPE.test(externalTenantId)||!SCOPE.test(unitId))
    return response({error:"finops.outbox.invalid"},400);
  try{
    const context=await resolveTenantContext(await headers());
    return response(await readFMFinopsOperationalOutbox(context,{
      productId,externalTenantId,unitId,
    }),200);
  }catch{return response({error:"finops.outbox.unavailable"},403);}
}

export async function POST(request:Request,{params}:Params){
  const {productId}=await params;
  if(!UUID.test(productId)||new URL(request.url).search||
     request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json"||
     !request.body)return response({error:"finops.outbox.invalid"},400);
  const reader=request.body.getReader();let bytes=0;const chunks:Uint8Array[]=[];
  try{
    for(;;){
      const next=await reader.read();if(next.done)break;
      bytes+=next.value.byteLength;
      if(bytes>1024){await reader.cancel();return response({error:"finops.outbox.invalid"},400);}
      chunks.push(next.value);
    }
  }finally{reader.releaseLock();}
  let input:Record<string,unknown>;
  try{
    const parsed:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
      return response({error:"finops.outbox.invalid"},400);
    input=parsed as Record<string,unknown>;
  }catch{return response({error:"finops.outbox.invalid"},400);}
  if(typeof input.externalTenantId!=="string"||!SCOPE.test(input.externalTenantId)||
     typeof input.unitId!=="string"||!SCOPE.test(input.unitId)||
     typeof input.password!=="string"||input.password.length<1||input.password.length>128)
    return response({error:"finops.outbox.invalid"},400);
  let operation:FMFinopsAlertOperation;
  if(input.kind==="scan"){
    const expected="endDate,externalTenantId,kind,password,startDate,unitId";
    const expectedWithCursor="afterRequestId,"+expected;
    const fields=Object.keys(input).sort().join(",");
    if(![expected,expectedWithCursor].includes(fields)||
       typeof input.startDate!=="string"||!DATE.test(input.startDate)||
       typeof input.endDate!=="string"||!DATE.test(input.endDate)||
       (input.afterRequestId!==undefined&&(
         typeof input.afterRequestId!=="string"||!SCOPE.test(input.afterRequestId)
       )))return response({error:"finops.outbox.invalid"},400);
    operation={
      kind:"scan",startDate:input.startDate,endDate:input.endDate,
      ...(input.afterRequestId?{afterRequestId:input.afterRequestId}:{})
    };
  }else if(input.kind==="review"){
    if(Object.keys(input).sort().join(",")!==
       "eventId,externalTenantId,kind,password,unitId"||
       typeof input.eventId!=="string"||!FINGERPRINT.test(input.eventId))
      return response({error:"finops.outbox.invalid"},400);
    operation={kind:"review",eventId:input.eventId};
  }else return response({error:"finops.outbox.invalid"},400);
  try{
    const incoming=await headers();
    const context=await resolveTenantContext(incoming);
    const session=await auth.api.getSession({headers:incoming});
    if(!session?.user?.id||session.user.id!==context.userId||!session.session.id)
      return response({error:"finops.outbox.denied"},403);
    const proof=await verifyPasswordStepUp(incoming,input.password);
    const result=await operateFMFinopsAlertOutbox(
      context,proof,session.session.id,
      {productId,externalTenantId:input.externalTenantId,unitId:input.unitId},
      operation,
    );
    return response(result,200);
  }catch{
    return response({error:"finops.outbox.unavailable"},403);
  }
}
