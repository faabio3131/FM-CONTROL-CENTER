import { startupMigrationsEnabled } from "@/config/startup-migrations";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !startupMigrationsEnabled()) return;

  const { runStartupMigrations } = await import("@/infrastructure/db/migrate");
  await runStartupMigrations();
}
