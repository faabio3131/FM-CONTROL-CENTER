import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("F14 operations UI", () => {
  it("não apresenta uptime artificial", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/dashboard/operations/page.tsx"), "utf8");
    expect(source).toContain("Health pontual não é uptime");
    expect(source).toContain("Disponibilidade só aparece");
    expect(source).not.toContain("99.9%");
    expect(source).not.toContain("Math.random");
  });
});
