import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {readVendeClaimsMonitor} from "@/application/billing/vende-commercial-claims-supervisor";

type Params={params:Promise<{productId:string}>};
const reply=(body:unknown,status:number)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request,{params}:Params){
  try{
    if(new URL(request.url).search) return reply({error:"claims.invalid"},400);
    const context=await resolveTenantContext(await headers());
    const {productId}=await params;
    return reply(await readVendeClaimsMonitor(context,productId),200);
  }catch{
    return reply({error:"claims.unavailable"},403);
  }
}
