import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { VerifiedIronAsaasWebhookProcessor } from "@/application/billing/verified-iron-asaas-webhook-processor";
import { environmentIronControlTenantId } from "@/infrastructure/integration/iron-commercial-connector";
import { pool } from "@/infrastructure/db/client";
import { PostgresIronAsaasWebhookQueue } from "@/infrastructure/billing/postgres-iron-asaas-webhook-queue";
import { PostgresIronAsaasAtomicReconciliation } from "@/infrastructure/billing/postgres-iron-asaas-atomic-reconciliation";
import { AsaasIronPaymentReadOnlyClient } from "@/infrastructure/billing/asaas-iron-payment-readonly-client";

export const dynamic="force-dynamic";

function authenticated(header:string|null,expected:string|undefined):boolean {
  if(!header?.startsWith("Bearer ")||!expected||expected.length<32||expected.length>255||
     /\s/.test(expected))return false;
  const provided=header.slice(7);
  if(!provided||provided.length>255)return false;
  return timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

/** Privileged one-item worker entrypoint; no default activation or IRON delivery. */
export async function POST(request:Request){
  if(process.env.FMCC_IRON_ASAAS_WEBHOOK_PROCESSOR_ENABLED!=="YES" ||
     process.env.FMCC_IRON_ASAAS_ATOMIC_RECONCILIATION_ENABLED!=="YES" ||
     process.env.FMCC_IRON_ASAAS_WEBHOOK_INBOX_ENABLED!=="YES") {
    return NextResponse.json({error:"billing.iron_webhook_worker_disabled"},{status:503});
  }
  if(!authenticated(request.headers.get("authorization"),
      process.env.FMCC_IRON_ASAAS_WEBHOOK_WORKER_SECRET)){
    return NextResponse.json({error:"billing.iron_webhook_worker_unauthorized"},{status:401});
  }
  const tenantId=environmentIronControlTenantId();
  if(!tenantId)return NextResponse.json({error:"billing.iron_webhook_worker_scope_missing"},{status:503});
  try{
    const result=await new VerifiedIronAsaasWebhookProcessor(
      new PostgresIronAsaasWebhookQueue(pool),
      new PostgresIronAsaasAtomicReconciliation(pool),
      new AsaasIronPaymentReadOnlyClient(),
    ).processOne(tenantId);
    return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
  }catch{
    return NextResponse.json({error:"billing.iron_webhook_worker_unavailable"},{status:503});
  }
}
