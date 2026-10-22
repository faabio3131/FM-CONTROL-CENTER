import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {resolveTenantContext} from "@/application/security/resolve-tenant-context";
import {listVendeFinopsBoundTenants}
  from "@/application/billing/vende-core-finops-reader";

type Params={params:Promise<{productId:string}>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status:number)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store"},
});
export async function GET(request:Request,{params}:Params){
  try{
    if(new URL(request.url).search)return reply({error:"finops.bindings.invalid"},400);
    const {productId}=await params;
    if(!UUID.test(productId))return reply({error:"finops.bindings.invalid"},400);
    const context=await resolveTenantContext(await headers());
    return reply(await listVendeFinopsBoundTenants(context,productId),200);
  }catch{return reply({error:"finops.bindings.unavailable"},403);}
}
