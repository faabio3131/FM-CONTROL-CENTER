import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildNotificationService } from "@/application/notifications/notification-composition";
import { resolveTenantContext } from "@/application/security/resolve-tenant-context";
import { roleHasPermission } from "@/domain/security/permissions";
import {
  AuthenticationRequiredError,
  TenantScopeRequiredError,
} from "@/domain/security/tenant-context";
import { CommandShell } from "./command-shell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  let context;
  try {
    context = await resolveTenantContext(await headers());
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof TenantScopeRequiredError) redirect("/onboarding");
    throw error;
  }

  const notifications = roleHasPermission(context.role, "notification:use")
    ? await buildNotificationService()
        .inbox(context, 5)
        .then((inbox) => ({
          unreadCount: inbox.unreadCount,
          items: inbox.items,
        }))
        .catch(() => null)
    : null;

  return (
    <CommandShell role={context.role} notifications={notifications}>
      {children}
    </CommandShell>
  );
}
