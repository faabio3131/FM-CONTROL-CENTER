const MIN_AUTH_SECRET_LENGTH = 32;

function required(name: "DATABASE_URL" | "BETTER_AUTH_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`config.missing:${name}`);
  return value;
}

export function serverEnv() {
  const secret = required("BETTER_AUTH_SECRET");
  if (secret.length < MIN_AUTH_SECRET_LENGTH) {
    throw new Error("config.BETTER_AUTH_SECRET_too_short");
  }
  return {
    databaseUrl: required("DATABASE_URL"),
    authSecret: secret,
    authUrl: process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000",
  } as const;
}
