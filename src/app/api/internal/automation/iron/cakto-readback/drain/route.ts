import { NextResponse } from "next/server";
import { alertAutomationEnv } from "@/config/env";
import { verifyScheduledWorkerBearer } from "@/application/security/verify-scheduled-worker-bearer";
import { CaktoIronReadbackInbox } from "@/application/billing/cakto-iron-readback-inbox";
export const dynamic="force-dynamic";
export async function POST(request:Request){
  if(process.env.FMCC_CAKTO_READBACK_ENABLED!=="YES")return NextResponse.json({error:"cakto.readback_disabled"},{status:503});
  let secret:string;
  try{secret=alertAutomationEnv().schedulerSecret;}catch{return NextResponse.json({error:"automation.scheduler_not_configured"},{status:503});}
  if(!verifyScheduledWorkerBearer(request.headers.get("authorization"),secret))
    return NextResponse.json({error:"automation.unauthorized"},{status:401});
  try{
    const result=await new CaktoIronReadbackInbox().processOne();
    return NextResponse.json({result},{headers:{"cache-control":"no-store"}});
  }catch{return NextResponse.json({error:"cakto.readback_unavailable"},{status:503});}
}
