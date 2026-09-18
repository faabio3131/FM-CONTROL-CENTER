import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { serverEnv } from "@/config/env";
import { db } from "@/infrastructure/db/client";
import * as authSchema from "@/infrastructure/db/auth-schema";

const env = serverEnv();

export const auth = betterAuth({
  appName: "FM Control Center",
  baseURL: env.authUrl,
  secret: env.authSecret,
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  emailAndPassword: { enabled: true },
  trustedOrigins: [env.authUrl],
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  plugins: [organization({ allowUserToCreateOrganization: true })],
});
