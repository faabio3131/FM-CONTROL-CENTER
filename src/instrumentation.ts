import { startupMigrationsEnabled } from "@/config/startup-migrations";

function ironRuntimeBootstrapEnabled(): boolean {
  return process.env.FMCC_IRON_RUNTIME_BOOTSTRAP?.trim().toLowerCase() === "true";
}

function kordenaRuntimeBootstrapEnabled(): boolean {
  return process.env.FMCC_KORDENA_RUNTIME_BOOTSTRAP?.trim().toLowerCase() === "true";
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (startupMigrationsEnabled()) {
    const { runStartupMigrations } = await import("@/infrastructure/db/migrate");
    await runStartupMigrations();
  }

  if (ironRuntimeBootstrapEnabled()) {
    const { bootstrapIronCommercialRuntime } = await import(
      "@/application/integration/iron-runtime-bootstrap"
    );
    await bootstrapIronCommercialRuntime();
  }

  if (process.env.FMCC_IRON_PLAN_CHANGE_MODE === "sandbox") {
    const { startIronPlanChangeSandbox } = await import("@/application/billing/iron-plan-change-runtime");
    startIronPlanChangeSandbox();
  }

  if (kordenaRuntimeBootstrapEnabled()) {
    const { bootstrapKordenaCommercialRuntime } = await import(
      "@/application/integration/kordena-runtime-bootstrap"
    );
    await bootstrapKordenaCommercialRuntime();
  }
}
