/** Generate the *actual Command client* signed envelope for Python ASGI contract tests.
 * No network, production secret or mocked signer: only the transport is captured.
 */
import {
  sendGovernedCommandBridgeAction,
  type CommandBridgeAction,
} from "../src/application/integration/fm-core-bridge-governance.ts";

const action = process.argv[2] as CommandBridgeAction;
const organization = process.argv[3] ?? "fm-company-organization";
if (!["provision", "grant", "revoke_grant", "revoke_identity"].includes(action)) {
  throw new Error("Unsupported synthetic integration-test action");
}

let envelope: { url: string; headers: Record<string, string>; body: string } | null = null;
const status = action === "provision" ? "provisioned"
  : action === "grant" ? "granted" : "revoked";

await sendGovernedCommandBridgeAction(
  { action, tenantId: "tenant-a", unitId: "unit-a", capability: "ai.text" },
  {
    actorUserId: "fm-human-admin-1",
    organizationId: organization,
    stepUpAt: new Date(),
  },
  {
    assistantOrigin: "https://assistant.example",
    commandKeyId: "command-platform-key-v1",
    commandSigningKey: "synthetic-command-control-signing-key-000002",
    targetCoreKeyId: "fm-core-dev-v1",
  },
  {
    http: async (input, init) => {
      if (init?.redirect !== "manual" || init?.method !== "POST") {
        throw new Error("Unsafe outbound transport");
      }
      envelope = {
        url: String(input),
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        body: String(init.body),
      };
      return new Response(JSON.stringify({ status }), { status: 200 });
    },
  },
);
if (!envelope) throw new Error("Command produced no transport envelope");
process.stdout.write(JSON.stringify(envelope));
