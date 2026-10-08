import { requirePermission, assertTenantScope, type TenantContext } from "../security/tenant-context";

export type GatewayStatus = "disabled" | "configured" | "verified";
export interface GatewayAccountIdentity {
  readonly id: string;
  readonly billingTenantId: string;
  readonly status: GatewayStatus;
}
export interface CredentialVault {
  /** The vault owns credential encryption, access policies and rotations. Never accept client-authored refs. */
  store(tenantId: string, providerCode: string, secret: string): Promise<string>;
  revoke(tenantId: string, reference: string): Promise<void>;
}
export class GatewayManagementUnavailableError extends Error {
  constructor(){super("billing.gateway_management_unavailable");}
}
export class GatewayAccountInvalidError extends Error {
  constructor(){super("billing.gateway_account_invalid");}
}
export function requireGatewayManagement(context: TenantContext, enabled: boolean) {
  requirePermission(context, "billing:write");
  if (!enabled) throw new GatewayManagementUnavailableError();
}
export function validateGatewayDisable(
  context: TenantContext, target: GatewayAccountIdentity, enabled: boolean,
): GatewayAccountIdentity {
  requireGatewayManagement(context, enabled);
  assertTenantScope(context, target.billingTenantId);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(target.id)) throw new GatewayAccountInvalidError();
  if (!["disabled","configured","verified"].includes(target.status)) throw new GatewayAccountInvalidError();
  return target;
}
/** Read-only provider catalog must never imply a provider has been certified. */
export function sanitizeGatewaySecretInput(body: unknown): never {
  void body;
  throw new GatewayManagementUnavailableError();
}
