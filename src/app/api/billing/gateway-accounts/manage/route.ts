import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { AuthenticationRequiredError, PermissionDeniedError, TenantScopeRequiredError } from "@/domain/security/tenant-context";
import { createGatewayAccount, rotateGatewayCredential, disableGatewayAccount, updateGatewayAccount, GatewayInputError, GatewayNotFoundError } from "@/infrastructure/billing/manage-gateway-accounts";
import { VaultUnavailableError } from "@/infrastructure/billing/encrypted-gateway-vault";

function safeError(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({error:error.message},{status:401});
  if (error instanceof PermissionDeniedError || error instanceof TenantScopeRequiredError) return NextResponse.json({error:error.message},{status:403});
  if (error instanceof GatewayInputError) return NextResponse.json({error:error.message},{status:400});
  if (error instanceof GatewayNotFoundError) return NextResponse.json({error:error.message},{status:404});
  if (error instanceof VaultUnavailableError) return NextResponse.json({error:"billing.vault_unavailable"},{status:503});
  if (error instanceof Error && error.message === "billing.gateway_management_unavailable") return NextResponse.json({error:error.message},{status:503});
  return null;
}
function guardOrigin(h: Headers) {
  const origin=h.get("origin");
  const host=h.get("x-forwarded-host") ?? h.get("host");
  if (!origin || !host) return false;
  try {return new URL(origin).host.toLowerCase() === host.toLowerCase() && new URL(origin).protocol==="https:" || (process.env.NODE_ENV!=="production" && new URL(origin).host===host && new URL(origin).protocol==="http:");}
  catch {return false;}
}
export async function POST(request:Request) {
  try {
    const context=await resolveTenantContext(await headers());
    if (!guardOrigin(request.headers)) return NextResponse.json({error:"billing.origin_denied"},{status:403});
    const raw=await request.json();
    return NextResponse.json(await createGatewayAccount(context,raw),{status:201});
  } catch(error) {const response=safeError(error);if(response)return response;throw error;}
}
export async function PATCH(request:Request) {
  try {
    const context=await resolveTenantContext(await headers());
    if(!guardOrigin(request.headers))return NextResponse.json({error:"billing.origin_denied"},{status:403});
    const raw=await request.json() as unknown;
    if(!raw || typeof raw!=="object" || Array.isArray(raw)) throw new GatewayInputError();
    const body=raw as Record<string,unknown>;
    if(typeof body.id!=="string" || (body.action!=="rotate" && body.action!=="disable" && body.action!=="update"))throw new GatewayInputError();
    if(body.action==="update") {
      if (Object.keys(body).some((key) => !["action","id","publicLabel","environment"].includes(key))) throw new GatewayInputError();
      return NextResponse.json(await updateGatewayAccount(context,body.id,{...(body.publicLabel!==undefined?{publicLabel:body.publicLabel}:{}),...(body.environment!==undefined?{environment:body.environment}:{})}));
    }
    if(body.action==="disable") {
      if(Object.keys(body).sort().join(",")!=="action,id")throw new GatewayInputError();
      return NextResponse.json(await disableGatewayAccount(context,body.id));
    }
    if(Object.keys(body).sort().join(",")!=="action,credential,id")throw new GatewayInputError();
    return NextResponse.json(await rotateGatewayCredential(context,body.id,{credential:body.credential}));
  } catch(error) {const response=safeError(error);if(response)return response;throw error;}
}
