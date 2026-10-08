import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { billingGatewayAccounts, billingGatewaySecrets } from "@/infrastructure/db/billing-central-schema";
import { auditEvents } from "@/infrastructure/db/foundation-schema";
import { getBillingVaultKey, encryptGatewaySecret } from "./encrypted-gateway-vault";
import { requirePermission, type TenantContext } from "@/domain/security/tenant-context";
import { listProviderDescriptors } from "@/domain/billing-central/provider-registry";

type GatewayInput = {
  providerCode: string; environment: "sandbox" | "production";
  publicLabel: string; credential: string;
};
export class GatewayInputError extends Error { constructor(){super("billing.invalid_gateway_input");} }
export class GatewayNotFoundError extends Error { constructor(){super("billing.gateway_not_found");} }

function verifyInput(raw: unknown): GatewayInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new GatewayInputError();
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some((k) => !["providerCode","environment","publicLabel","credential"].includes(k))) throw new GatewayInputError();
  if (typeof o.providerCode !== "string" || !listProviderDescriptors().some((p) => p.code === o.providerCode)) throw new GatewayInputError();
  if (o.environment !== "sandbox" && o.environment !== "production") throw new GatewayInputError();
  if (typeof o.publicLabel !== "string" || !o.publicLabel.trim() || o.publicLabel.length > 120) throw new GatewayInputError();
  if (typeof o.credential !== "string" || o.credential.length < 8 || o.credential.length > 16000) throw new GatewayInputError();
  return { providerCode: o.providerCode, environment: o.environment, publicLabel: o.publicLabel.trim(), credential: o.credential };
}
function enabled(context: TenantContext) {
  requirePermission(context, "billing:write");
  if (process.env.FMCC_BILLING_GATEWAY_MANAGEMENT_ENABLED !== "true") throw new Error("billing.gateway_management_unavailable");
}
async function scope(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], context: TenantContext) {
  await tx.execute(sql`select set_config('app.billing_tenant_id', ${context.tenantId}, true)`);
}
async function audit(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], context: TenantContext, action: string, id: string) {
  await tx.insert(auditEvents).values({
    tenantId: context.tenantId, actorId: context.userId, actorType: "user", action,
    resourceType: "billing.gateway_account", resourceId: id, result: "success",
    correlationId: context.correlationId, metadata: {},
  });
}
/** Credentials never leave this module as return values. No external provider calls or charges. */
export async function createGatewayAccount(context: TenantContext, raw: unknown) {
  enabled(context);
  const input = verifyInput(raw);
  const key = getBillingVaultKey();
  const id = randomUUID();
  const sealed = encryptGatewaySecret(context.tenantId, id, input.credential, key);
  return db.transaction(async(tx) => {
    await scope(tx,context);
    await tx.insert(billingGatewayAccounts).values({
      id, tenantId: context.tenantId, providerCode: input.providerCode, environment: input.environment,
      publicLabel: input.publicLabel, credentialRef: `db-vault://${id}`, status: "disabled",
    });
    await tx.insert(billingGatewaySecrets).values({
      tenantId: context.tenantId, accountId: id, ...sealed,
    });
    await audit(tx,context,"billing.gateway.create",id);
    return {id,providerCode:input.providerCode,environment:input.environment,publicLabel:input.publicLabel,status:"disabled"};
  });
}
export async function rotateGatewayCredential(context: TenantContext, id: string, raw: unknown) {
  enabled(context);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !raw || typeof raw !== "object" || Array.isArray(raw)) throw new GatewayInputError();
  const body = raw as Record<string,unknown>;
  if (Object.keys(body).length !== 1 || typeof body.credential !== "string" || body.credential.length < 8 || body.credential.length > 16000) throw new GatewayInputError();
  const key = getBillingVaultKey();
  const sealed = encryptGatewaySecret(context.tenantId,id,body.credential,key);
  return db.transaction(async(tx)=>{
    await scope(tx,context);
    const accounts = await tx.select({id:billingGatewayAccounts.id}).from(billingGatewayAccounts)
      .where(and(eq(billingGatewayAccounts.id,id),eq(billingGatewayAccounts.tenantId,context.tenantId))).for("update");
    if (accounts.length !== 1) throw new GatewayNotFoundError();
    const result = await tx.update(billingGatewaySecrets).set({...sealed,updatedAt:new Date()})
      .where(and(eq(billingGatewaySecrets.accountId,id),eq(billingGatewaySecrets.tenantId,context.tenantId))).returning({id:billingGatewaySecrets.accountId});
    if (result.length !== 1) throw new GatewayNotFoundError();
    await tx.update(billingGatewayAccounts).set({status:"disabled"})
      .where(and(eq(billingGatewayAccounts.id,id),eq(billingGatewayAccounts.tenantId,context.tenantId)));
    await audit(tx,context,"billing.gateway.rotate",id);
    return {id,status:"disabled"};
  });
}
export async function disableGatewayAccount(context: TenantContext,id:string) {
  enabled(context);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new GatewayInputError();
  return db.transaction(async(tx)=>{
    await scope(tx,context);
    const result=await tx.update(billingGatewayAccounts).set({status:"disabled"})
      .where(and(eq(billingGatewayAccounts.id,id),eq(billingGatewayAccounts.tenantId,context.tenantId))).returning({id:billingGatewayAccounts.id});
    if(result.length!==1) throw new GatewayNotFoundError();
    await audit(tx,context,"billing.gateway.disable",id);
    return {id,status:"disabled"};
  });
}

/** Metadata changes never switch receiver or credentials and always return to disabled. */
export async function updateGatewayAccount(context: TenantContext, id: string, raw: unknown) {
  enabled(context);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !raw || typeof raw !== "object" || Array.isArray(raw)) throw new GatewayInputError();
  const body = raw as Record<string,unknown>;
  const keys = Object.keys(body);
  if (keys.length < 1 || keys.some((key) => !["publicLabel", "environment"].includes(key))) throw new GatewayInputError();
  if (body.publicLabel !== undefined && (typeof body.publicLabel !== "string" || !body.publicLabel.trim() || body.publicLabel.length > 120)) throw new GatewayInputError();
  if (body.environment !== undefined && body.environment !== "sandbox" && body.environment !== "production") throw new GatewayInputError();
  const update: {publicLabel?:string; environment?:"sandbox"|"production"; status:"disabled"} = {status:"disabled"};
  if (typeof body.publicLabel === "string") update.publicLabel = body.publicLabel.trim();
  if (body.environment === "sandbox" || body.environment === "production") update.environment = body.environment;
  return db.transaction(async(tx)=>{
    await scope(tx,context);
    const result=await tx.update(billingGatewayAccounts).set(update)
      .where(and(eq(billingGatewayAccounts.id,id),eq(billingGatewayAccounts.tenantId,context.tenantId)))
      .returning({id:billingGatewayAccounts.id,publicLabel:billingGatewayAccounts.publicLabel,environment:billingGatewayAccounts.environment});
    if(result.length!==1) throw new GatewayNotFoundError();
    await audit(tx,context,"billing.gateway.update",id);
    return {...result[0], status:"disabled" as const};
  });
}
