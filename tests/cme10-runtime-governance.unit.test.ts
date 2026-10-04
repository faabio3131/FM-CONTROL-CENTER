import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("CME-10 runtime homologation governance", () => {
  it("não declara Kordena conectado enquanto o Preview está fora do exact SHA", () => {
    const register = source(
      "docs/governance/CME-10-runtime-homologation-register.md",
    );

    expect(register).toContain(
      "KORDENA_RUNTIME_CURRENT_SHA = BLOCKED / PREVIEW_EXACT_SHA_REQUIRED",
    );
    expect(register).toContain("KORDENA_CONNECTED = NOT_PROVEN");
    expect(register).toContain("CME_10_FINAL = HOLD");
  });

  it("mantém scheduler runtime bloqueado quando base URL e secret estão ausentes", () => {
    const register = source(
      "docs/governance/CME-10-runtime-homologation-register.md",
    );

    expect(register).toContain(
      "SCHEDULER_RUNTIME = EXTERNAL_BLOCKED / RUNTIME_SECRET_REQUIRED",
    );
    expect(register).toContain("SCHEDULER_REAL_EVALUATION = NOT_EXECUTED");
    expect(register).toContain("SCHEDULER_ACTIVE = FALSE");
  });

  it("preserva o boundary de autenticação e recuperação do scheduler", () => {
    const route = source(
      "src/app/api/internal/automation/alerts/evaluate/route.ts",
    );
    const repository = source(
      "src/infrastructure/alerts/postgres-alert-automation-repository.ts",
    );
    const workflow = source(
      ".github/workflows/fmcc-alert-automation.yml",
    );

    expect(route).toContain("timingSafeEqual");
    expect(route).toContain("automation.scheduler_not_configured");
    expect(route).toContain("automation.unauthorized");
    expect(repository).toContain("AUTOMATION_STALE_AFTER_MS");
    expect(repository).toContain("alert.automation.restarted");
    expect(workflow).toContain("Idempotency-Key");
    expect(workflow).toContain("X-Correlation-ID");
  });

  it("mantém Preview exact-SHA como pré-condição de homologação real", () => {
    const workflow = source(
      ".github/workflows/fmcc-preview-deployment-gate.yml",
    );
    const register = source(
      "docs/governance/CME-10-runtime-homologation-register.md",
    );

    expect(workflow).toContain('expected="$GITHUB_SHA"');
    expect(workflow).toContain("Preview exact SHA confirmed");
    expect(register).toContain(
      "expected main SHA = 0cffb09353c39d706c6f22e8559aea8e4fa4ae5e",
    );
  });
});
