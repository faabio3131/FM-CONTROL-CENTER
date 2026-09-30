import { startupMigrationsEnabled } from "@/config/startup-migrations";

function kordenaRuntimeBootstrapEnabled(): boolean {
  return process.env.FMCC_KORDENA_RUNTIME_BOOTSTRAP?.trim().toLowerCase() === "true";
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (startupMigrationsEnabled()) {
    const { runStartupMigrations } = await import("@/infrastructure/db/migrate");
    await runStartupMigrations();
  }

  if (kordenaRuntimeBootstrapEnabled()) {
    const { bootstrapKordenaCommercialRuntime } = await import(
      "@/application/integration/kordena-runtime-bootstrap"
    );
    await bootstrapKordenaCommercialRuntime();
  }
}
