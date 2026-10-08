import { assertTenantScope, requirePermission, type TenantContext } from "../security/tenant-context";

export interface GatewayConfiguration {
  readonly id: string;
  readonly billingTenantId: string;
  readonly providerCode: string;
  readonly environment: "sandbox" | "production";
  readonly credentialRef: string;
  readonly publicLabel: string;
  readonly status: "disabled" | "configured" | "verified";
}

export type GatewayConfigurationInput = Omit<GatewayConfiguration, "id" | "status">;

export function validateGatewayConfiguration(
  context: TenantContext,
  input: GatewayConfigurationInput,
): GatewayConfigurationInput {
  assertTenantScope(context, input.billingTenantId);
  requirePermission(context, "billing:write");
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(input.providerCode)) throw new Error("billing.invalid_provider");
  if (!["sandbox", "production"].includes(input.environment)) throw new Error("billing.invalid_environment");
  if (!/^[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9/_:.@-]{8,}$/.test(input.credentialRef) ||
    /^(?:https?|ftp):\/\//.test(input.credentialRef)) throw new Error("billing.invalid_secret_reference");
  if (!input.publicLabel.trim() || input.publicLabel.length > 120) throw new Error("billing.invalid_label");
  return input;
}

export function listTenantGatewayConfigurations(
  context: TenantContext,
  configurations: readonly GatewayConfiguration[],
): ReadonlyArray<Omit<GatewayConfiguration, "credentialRef">> {
  requirePermission(context, "billing:read");
  return configurations.filter((configuration) => configuration.billingTenantId === context.tenantId)
    .map(({ credentialRef: _secret, ...publicConfig }) => {
      void _secret;
      return publicConfig;
    });
}
