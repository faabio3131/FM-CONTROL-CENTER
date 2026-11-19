import { NextResponse } from "next/server";
import { BodyTooLargeError,readLimitedBody } from "@/infrastructure/http/read-limited-body";
import { IronCommerceProvisioning,verifyIronCommerceBearer } from "@/application/billing/iron-commerce-provisioning";
export const dynamic="force-dynamic";
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export async function POST(request:Request){
  if(!verifyIronCommerceBearer(request.headers.get("authorization"),process.env.FMCC_IRON_COMMERCE_S2S_TOKEN))
    return NextResponse.json({error:"iron.commerce_unauthorized"},{status:401});
  let body:unknown;
  try{body=JSON.parse(await readLimitedBody(request,2048));}
  catch(error){return NextResponse.json({error:"iron.receipt_input_invalid"},{status:error instanceof BodyTooLargeError?413:400});}
  if(!body||typeof body!=="object"||Array.isArray(body)) return NextResponse.json({error:"iron.receipt_input_invalid"},{status:400});
  const row=body as Record<string,unknown>;
  const keys=["gymId","expectedSubscriptionId","invoiceId","actorId","requestId"];
  if(Object.keys(row).length!==keys.length||!keys.every(key=>typeof row[key]==="string"&&UUID.test(row[key] as string)))
    return NextResponse.json({error:"iron.receipt_input_invalid"},{status:400});
  try{
    const result=await new IronCommerceProvisioning().resendReceipt({
      gymId:row.gymId as string,expectedSubscriptionId:row.expectedSubscriptionId as string,
      invoiceId:row.invoiceId as string,actorId:row.actorId as string,requestId:row.requestId as string,
    });
    return NextResponse.json(result,{headers:{"cache-control":"private, no-store"}});
  }catch(error){
    if(error instanceof Error&&error.message==="iron.receipt_cooldown")
      return NextResponse.json({error:"iron.receipt_cooldown"},{status:429});
    return NextResponse.json({error:"iron.receipt_unavailable"},{status:503});
  }
}
