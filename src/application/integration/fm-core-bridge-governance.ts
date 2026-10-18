import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

export const COMMAND_BRIDGE_PATH = "/internal/v1/command/core-bridge/manage";

export type CommandBridgeAction =
  | "provision"
  | "grant"
  | "revoke_grant"
  | "revoke_identity";

export interface CommandBridgeTarget {
  action: CommandBridgeAction;
  tenantId: string;
  unitId: string;
  capability: string;
}

export interface CommandBridgeAuthority {
  actorUserId: string;
  organizationId: string;
  stepUpAt: Date;
}

export class CoreBridgeGovernanceError extends Error {
  constructor() {
    super("fm_core.bridge_governance_unavailable");
  }
}

const identifier = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const actions: readonly CommandBridgeAction[] = [
  "provision", "grant", "revoke_grant", "revoke_identity",
];

export function parseCommandBridgeTarget(value: unknown): CommandBridgeTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (!actions.includes(body.action as CommandBridgeAction)) return null;
  for (const field of ["tenantId", "unitId", "capability"] as const) {
    if (typeof body[field] !== "string" || !identifier.test(body[field])) return null;
  }
  return {
    action: body.action as CommandBridgeAction,
    tenantId: body.tenantId as string,
    unitId: body.unitId as string,
    capability: body.capability as string,
  };
}

export interface CommandBridgeConfig {
  assistantOrigin: string;
  commandKeyId: string;
  commandSigningKey: string;
  targetCoreKeyId: string;
}

export function commandBridgeConfigFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): CommandBridgeConfig {
  const assistantOrigin = env.FM_COMMAND_CORE_BRIDGE_ASSISTANT_URL ?? "";
  const commandKeyId = env.FM_COMMAND_CORE_BRIDGE_CONTROL_KEY_ID ?? "";
  const commandSigningKey = env.FM_COMMAND_CORE_BRIDGE_CONTROL_SIGNING_KEY ?? "";
  const targetCoreKeyId = env.FM_COMMAND_CORE_BRIDGE_TARGET_KEY_ID ?? "";
  let parsed: URL;
  try {
    parsed = new URL(assistantOrigin);
  } catch {
    throw new CoreBridgeGovernanceError();
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(commandKeyId) ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(targetCoreKeyId) ||
    commandSigningKey.length < 32
  ) {
    throw new CoreBridgeGovernanceError();
  }
  return {
    assistantOrigin: parsed.origin,
    commandKeyId,
    commandSigningKey,
    targetCoreKeyId,
  };
}

export function signCommandBridgeRequest(
  key: string,
  keyId: string,
  timestamp: string,
  nonce: string,
  body: Uint8Array,
): string {
  const digest = createHash("sha256").update(body).digest("hex");
  const canonical = [
    "POST",
    COMMAND_BRIDGE_PATH,
    keyId,
    timestamp,
    nonce,
    digest,
  ].join("\n");
  return createHmac("sha256", key).update(canonical, "ascii").digest("hex");
}

export async function sendGovernedCommandBridgeAction(
  target: CommandBridgeTarget,
  authority: CommandBridgeAuthority,
  config: CommandBridgeConfig,
  options: { http?: typeof fetch; now?: Date; commandRequestId?: string } = {},
): Promise<"provisioned" | "granted" | "revoked"> {
  const now = options.now ?? new Date();
  const stepUpAt = Math.floor(authority.stepUpAt.getTime() / 1000);
  const current = Math.floor(now.getTime() / 1000);
  if (
    !Number.isFinite(stepUpAt) ||
    stepUpAt > current + 15 ||
    current - stepUpAt > 300 ||
    !identifier.test(authority.actorUserId) ||
    !identifier.test(authority.organizationId)
  ) {
    throw new CoreBridgeGovernanceError();
  }
  const commandRequestId = options.commandRequestId ?? randomUUID();
  if (!identifier.test(commandRequestId)) throw new CoreBridgeGovernanceError();
  const raw = JSON.stringify({
    action: target.action,
    tenant_id: target.tenantId,
    unit_id: target.unitId,
    capability: target.capability,
    target_key_id: config.targetCoreKeyId,
    actor_user_id: authority.actorUserId,
    organization_id: authority.organizationId,
    step_up_at: stepUpAt,
    command_request_id: commandRequestId,
  });
  const body = Buffer.from(raw, "utf8");
  const timestamp = String(current);
  const nonce = randomBytes(24).toString("base64url");
  const signature = signCommandBridgeRequest(
    config.commandSigningKey,
    config.commandKeyId,
    timestamp,
    nonce,
    body,
  );
  let response: Response;
  try {
    response = await (options.http ?? fetch)(
      config.assistantOrigin + COMMAND_BRIDGE_PATH,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FM-Command-Key-ID": config.commandKeyId,
          "X-FM-Command-Timestamp": timestamp,
          "X-FM-Command-Nonce": nonce,
          "X-FM-Command-Signature": signature,
        },
        body: raw,
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (response.status !== 200) throw new CoreBridgeGovernanceError();
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new CoreBridgeGovernanceError();
    const status = (data as Record<string, unknown>).status;
    if (status !== "provisioned" && status !== "granted" && status !== "revoked")
      throw new CoreBridgeGovernanceError();
    if (
      (target.action === "provision" && status !== "provisioned") ||
      (target.action === "grant" && status !== "granted") ||
      (target.action.startsWith("revoke") && status !== "revoked")
    ) throw new CoreBridgeGovernanceError();
    return status;
  } catch {
    // Signed mutations are not retried on an ambiguous transport outcome.
    throw new CoreBridgeGovernanceError();
  }
}
