import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("runs the offline plan change and settlement evidence specifications on Node 24", () => {
  const result = execFileSync(process.execPath, [
    "--test", "--test-reporter=tap",
    "scripts/test-iron-expiry-simulator.mjs", "scripts/test-iron-plan-change.mjs", "scripts/verify-iron-plan-change.test.mjs",
  ], { encoding: "utf8" });
  expect(result).toContain("# fail 0");
});
