import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {readVendeCommercialClosureStatus} from "@/application/billing/vende-compensation-closure";
import {planProjectionConfigFromEnvironment} from "@/application/billing/assistant-plan-outbox-dispatcher";
type Params={params:Promise<{productId:string;intentId:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status:number)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store"},
});
export async function GET(request:Request,{params}:Params){
  try{
    if(new URL(request.url).search)return reply({error:"correction.outcome.invalid"},400);
    const {productId,intentId}=await params;
    if(!UUID.test(productId)||!UUID.test(intentId))
      return reply({error:"correction.outcome.invalid"},400);
    const context=await resolveTenantContext(await headers());
    return reply(await readVendeCommercialClosureStatus(context,{productId,intentId},
      planProjectionConfigFromEnvironment()),200);
  }catch{
    return reply({error:"correction.outcome.unavailable"},403);
  }
}
