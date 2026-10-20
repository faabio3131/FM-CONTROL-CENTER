/** Synthetic Node canonical status signature checked by real Assistant ASGI. */
import { randomBytes } from "node:crypto";
import {
  COMMAND_BRIDGE_STATUS_PATH,
  signCommandBridgeRequest,
  type CommandBridgeAction,
} from "../src/application/integration/fm-core-bridge-governance.ts";

const action = process.argv[2] as CommandBridgeAction;
const commandRequestId = process.argv[3] ?? "";
const organization = process.argv[4] ?? "fm-company-organization";
if (!["provision", "grant", "revoke_grant", "revoke_identity"].includes(action) ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(commandRequestId)) {
  throw new Error("Invalid synthetic status envelope request");
}
const timestamp = String(Math.floor(Date.now() / 1000));
const nonce = randomBytes(24).toString("base64url");
const body = JSON.stringify({
  action,
  tenant_id: "tenant-a",
  unit_id: "unit-a",
  capability: "ai.text",
  target_key_id: "fm-core-dev-v1",
  actor_user_id: "fm-human-admin-1",
  organization_id: organization,
  step_up_at: Number(timestamp),
  command_request_id: commandRequestId,
});
const signingKey = "synthetic-command-control-signing-key-000002";
const keyId = "command-platform-key-v1";
const signature = signCommandBridgeRequest(
  signingKey, keyId, timestamp, nonce, Buffer.from(body, "utf8"),
  COMMAND_BRIDGE_STATUS_PATH,
);
process.stdout.write(JSON.stringify({
  url: "https://assistant.example" + COMMAND_BRIDGE_STATUS_PATH,
  body,
  headers: {
    "Content-Type": "application/json",
    "X-FM-Command-Key-ID": keyId,
    "X-FM-Command-Timestamp": timestamp,
    "X-FM-Command-Nonce": nonce,
    "X-FM-Command-Signature": signature,
  },
}));
