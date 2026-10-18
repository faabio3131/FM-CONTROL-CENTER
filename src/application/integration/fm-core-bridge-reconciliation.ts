import { randomBytes } from "node:crypto";

import {
  COMMAND_BRIDGE_STATUS_PATH,
  CoreBridgeGovernanceError,
  signCommandBridgeRequest,
  type CommandBridgeAuthority,
  type CommandBridgeConfig,
  type CommandBridgeTarget,
} from "@/application/integration/fm-core-bridge-governance";

export type CommandBridgeOutcome = {
  status: "applied" | "denied" | "unknown";
  outcome: "provisioned" | "granted" | "revoked" | "denied" | null;
};
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

/** A status lookup is not permission to retry a failed mutation.
 * Only the Assistant's matching transactional event can prove a commit.
 */
export async function lookupCommandBridgeOutcome(
  target: CommandBridgeTarget,
  authority: CommandBridgeAuthority,
  commandRequestId: string,
  config: CommandBridgeConfig,
  options: { http?: typeof fetch; now?: Date } = {},
): Promise<CommandBridgeOutcome> {
  const now = options.now ?? new Date();
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const stepUpAt = Math.floor(authority.stepUpAt.getTime() / 1000);
  const current = Number(timestamp);
  if (
    !IDENTIFIER.test(commandRequestId) ||
    !IDENTIFIER.test(authority.actorUserId) ||
    !IDENTIFIER.test(authority.organizationId) ||
    !Number.isFinite(stepUpAt) || stepUpAt > current + 15 ||
    current - stepUpAt > 300
  ) throw new CoreBridgeGovernanceError();
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
  const nonce = randomBytes(24).toString("base64url");
  const signature = signCommandBridgeRequest(
    config.commandSigningKey,
    config.commandKeyId,
    timestamp,
    nonce,
    Buffer.from(raw, "utf8"),
    COMMAND_BRIDGE_STATUS_PATH,
  );
  try {
    const response = await (options.http ?? fetch)(
      config.assistantOrigin + COMMAND_BRIDGE_STATUS_PATH,
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
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new CoreBridgeGovernanceError();
    const { status, outcome } = value as Record<string, unknown>;
    const expected =
      target.action === "provision" ? "provisioned" :
      target.action === "grant" ? "granted" : "revoked";
    if (
      (status === "applied" && outcome === expected) ||
      (status === "denied" && outcome === "denied") ||
      (status === "unknown" && outcome === null)
    ) return { status, outcome } as CommandBridgeOutcome;
    throw new CoreBridgeGovernanceError();
  } catch {
    throw new CoreBridgeGovernanceError();
  }
}
