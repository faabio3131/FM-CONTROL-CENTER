/** Replay-safe delivery of approved FM plan revisions to Assistant.
 * NOT invoked by plan publication nor in production until configured and
 * explicitly activated. A provider timeout cannot create additional quota.
 */
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { assistantPlanOutbox, assistantPlanRevisions } from "@/infrastructure/db/assistant-plan-schema";
import { signCommandBridgeRequest } from "@/application/integration/fm-core-bridge-governance";
import { parseConsumptionPlanDraft } from "@/domain/billing/assistant-consumption-plan";

export const ASSISTANT_PLAN_PROJECTION_PATH = "/internal/v1/command/assistant-plans/project";
export class AssistantPlanDeliveryUnavailable extends Error {
  constructor() { super("plans.delivery_unavailable"); }
}
export type PlanProjectionConfig = Readonly<{
  assistantOrigin:string; keyId:string; signingKey:string; organizationId:string;
}>;

export function planProjectionConfigFromEnvironment(env:NodeJS.ProcessEnv=process.env):PlanProjectionConfig {
  let origin:URL;
  try {origin=new URL(env.FM_COMMAND_CORE_BRIDGE_ASSISTANT_URL??"");}
  catch {throw new AssistantPlanDeliveryUnavailable();}
  const keyId=env.FM_COMMAND_CORE_BRIDGE_CONTROL_KEY_ID??"";
  const signingKey=env.FM_COMMAND_CORE_BRIDGE_CONTROL_SIGNING_KEY??"";
  const organizationId=env.FM_COMMAND_PLATFORM_ORGANIZATION_ID??"";
  if (origin.protocol!=="https:" || origin.pathname!=="/" ||
      origin.username || origin.password || origin.search || origin.hash ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(keyId) ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(organizationId) ||
      signingKey.length<32) throw new AssistantPlanDeliveryUnavailable();
  return {assistantOrigin:origin.origin,keyId,signingKey,organizationId};
}

export function signAssistantPlanProjection(
  config:PlanProjectionConfig,
  revision:{planCode:string;revision:number;label:string;allowances:unknown;actorId:string;publishedAt:Date},
  now:Date=new Date(),
) {
  const validated=parseConsumptionPlanDraft({
    planCode:revision.planCode,label:revision.label,billingInterval:"monthly",
    amountMinor:1,allowances:revision.allowances,
  });
  const data={
    product_code:"VENDEATENDEIA",
    organization_id:config.organizationId,
    actor_user_id:revision.actorId,
    approved_at:Math.floor(revision.publishedAt.getTime()/1000),
    plan_code:validated.planCode,revision:revision.revision,
    label:validated.label,allowances:validated.allowances,
  };
  if (!Number.isSafeInteger(data.approved_at) || data.approved_at<=0 ||
      !Number.isSafeInteger(revision.revision) || revision.revision<=0)
    throw new AssistantPlanDeliveryUnavailable();
  const timestamp=String(Math.floor(now.getTime()/1000));
  const nonce=randomBytes(24).toString("base64url");
  const body=JSON.stringify(data);
  const signature=signCommandBridgeRequest(
    config.signingKey,config.keyId,timestamp,nonce,
    Buffer.from(body,"utf8"),ASSISTANT_PLAN_PROJECTION_PATH,
  );
  return {body,headers:{
    "Content-Type":"application/json",
    "X-FM-Command-Key-ID":config.keyId,
    "X-FM-Command-Timestamp":timestamp,
    "X-FM-Command-Nonce":nonce,
    "X-FM-Command-Signature":signature,
  }};
}

export async function dispatchAssistantPlanOutbox(
  outboxId:string,config:PlanProjectionConfig,
  http:typeof fetch=fetch,
):Promise<"delivered"|"already_delivered"> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(outboxId))
    throw new AssistantPlanDeliveryUnavailable();
  const [row]=await db.select({
    outbox:assistantPlanOutbox,revision:assistantPlanRevisions,
  }).from(assistantPlanOutbox)
    .innerJoin(assistantPlanRevisions,eq(assistantPlanRevisions.id,assistantPlanOutbox.revisionId))
    .where(and(eq(assistantPlanOutbox.id,outboxId),
      eq(assistantPlanOutbox.tenantId,config.organizationId),
      eq(assistantPlanRevisions.tenantId,config.organizationId),
      eq(assistantPlanRevisions.productId,assistantPlanOutbox.productId),
    )).limit(1);
  if (!row || row.revision.status!=="published" || !row.revision.publishedAt)
    throw new AssistantPlanDeliveryUnavailable();
  if (row.outbox.state==="delivered") return "already_delivered";
  const signed=signAssistantPlanProjection(config,{
    planCode:row.revision.planCode,revision:row.revision.revision,
    label:row.revision.label,allowances:row.revision.allowances,
    actorId:row.revision.actorId,publishedAt:row.revision.publishedAt,
  });
  let reply:Response;
  try {
    reply=await http(config.assistantOrigin+ASSISTANT_PLAN_PROJECTION_PATH,{
      method:"POST",headers:signed.headers,body:signed.body,
      redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(5000),
    });
    if (!reply.ok || reply.status!==200) throw new Error();
    const body:unknown=await reply.json();
    if (!body || typeof body!=="object" || Array.isArray(body) ||
      !["projected","already_projected"].includes(
        (body as Record<string,unknown>).status as string,
      )) throw new Error();
  } catch {throw new AssistantPlanDeliveryUnavailable();}
  await db.update(assistantPlanOutbox).set({
    state:"delivered",deliveredAt:new Date(),
    attempts:sql`${assistantPlanOutbox.attempts} + 1`,
  }).where(and(eq(assistantPlanOutbox.id,outboxId),
    eq(assistantPlanOutbox.tenantId,config.organizationId),
    eq(assistantPlanOutbox.state,"pending"),
  ));
  return "delivered";
}
