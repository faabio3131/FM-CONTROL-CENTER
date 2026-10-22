import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {readFMFinopsAlertInbox} from "@/application/billing/vende-core-finops-policy";

type Params={params:Promise<{productId:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE=/^[A-Za-z0-9_.-]{1,128}$/;
const respond=(body:unknown,status:number)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store"},
});

export async function GET(request:Request,{params}:Params){
  const {productId}=await params;
  const url=new URL(request.url);
  if(!UUID.test(productId))return respond({error:"finops.inbox.invalid"},400);
  const expected=["endDate","externalTenantId","startDate","unitId"];
  const names=[...url.searchParams.keys()].sort();
  const hasCursor=names.includes("afterRequestId");
  if(names.join(",")!==(hasCursor?[...expected,"afterRequestId"].sort():expected).join(",")||
     [...url.searchParams].some(([key])=>url.searchParams.getAll(key).length!==1))
    return respond({error:"finops.inbox.invalid"},400);
  const externalTenantId=url.searchParams.get("externalTenantId")??"";
  const unitId=url.searchParams.get("unitId")??"";
  const startDate=url.searchParams.get("startDate")??"";
  const endDate=url.searchParams.get("endDate")??"";
  const afterRequestId=url.searchParams.get("afterRequestId")??undefined;
  if(!SCOPE.test(externalTenantId)||!SCOPE.test(unitId)||
     afterRequestId!==undefined&&!SCOPE.test(afterRequestId))
    return respond({error:"finops.inbox.invalid"},400);
  try{
    const context=await resolveTenantContext(await headers());
    const alerts=await readFMFinopsAlertInbox(context,{
      productId,externalTenantId,unitId,startDate,endDate,afterRequestId,
    });
    return respond(alerts,200);
  }catch{return respond({error:"finops.inbox.unavailable"},403);}
}
