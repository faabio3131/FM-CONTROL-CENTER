import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { GovernedVendeC06Service } from "@/application/billing/vende-c06-governed-execution";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { requireFMPlanAuthority } from "@/application/billing/assistant-plan-catalog-service";
const service=new GovernedVendeC06Service();
const reply=(body:unknown,status:number)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request,{params}:{params:Promise<{productId:string}>}){
  try{
    const context=await resolveTenantContext(await headers());requireFMPlanAuthority(context,false);
    const {productId}=await params;const query=new URL(request.url).searchParams;
    const keys=[...query.keys()].sort().join(",");const subscriptionId=query.get("subscriptionId");
    const before=query.get("beforeRevision");
    if(!["subscriptionId","beforeRevision,subscriptionId"].includes(keys)||!subscriptionId||
       (before!==null&&(!/^[1-9]\d*$/.test(before)||!Number.isSafeInteger(Number(before)))))
      return reply({error:"contract_history.invalid"},400);
    return reply(await service.contractHistory(context,{productId,subscriptionId,
      ...(before===null?{}:{beforeRevision:Number(before)})}),200);
  }catch{return reply({error:"contract_history.unavailable"},403);}
}
