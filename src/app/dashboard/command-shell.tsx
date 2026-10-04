"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { NotificationItem } from "@/domain/notifications/contracts";
import type { FmccRole } from "@/domain/security/permissions";
import { commandNavigationForRole } from "@/presentation/command-navigation";
import { SignOutButton } from "./sign-out-button";

export function CommandShell({
  children,
  role,
  notifications,
}: {
  children: ReactNode;
  role: FmccRole;
  notifications: {
    readonly unreadCount: number;
    readonly items: readonly NotificationItem[];
  } | null;
}) {
  const pathname = usePathname();
  const navigation = commandNavigationForRole(role);
  const unread = notifications?.unreadCount ?? 0;

  return (
    <div className="command-app-shell">
      <header className="command-topbar">
        <Link href="/dashboard" className="command-brand" aria-label="FM Command — Visão Geral">
          <span className="command-brand-mark" aria-hidden="true">FM</span>
          <span className="command-brand-company">FM Tecnologia</span>
          <span className="command-brand-divider" aria-hidden="true" />
          <strong>COMMAND</strong>
        </Link>
        <p>Inteligência, controle e crescimento para o seu negócio.</p>
        <div className="command-topbar-actions">
          <details className="command-notification-menu">
            <summary
              className="command-topbar-badge"
              aria-label={
                notifications
                  ? "Notificações: " + unread + " não lidas"
                  : "Notificações: estado indisponível"
              }
            >
              <span aria-hidden="true">◌</span>
              Notificações
              {notifications && unread > 0 ? (
                <strong aria-label={unread + " notificações não lidas"}>
                  {unread}
                </strong>
              ) : null}
            </summary>
            <div className="panel">
              <strong>Central de Notificações</strong>
              {notifications ? (
                notifications.items.length ? (
                  <ul>
                    {notifications.items.map((item) => (
                      <li key={item.id}>
                        <Link href={item.href}>
                          {item.read ? "" : "● "}
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Nenhuma notificação governada.</p>
                )
              ) : (
                <p>Estado de notificações indisponível.</p>
              )}
              <Link href="/dashboard/notifications">Abrir central</Link>
            </div>
          </details>
          <div className="command-topbar-badge" aria-label="Ambiente governado">
            <span aria-hidden="true">●</span>
            Ambiente governado
          </div>
          <SignOutButton />
        </div>
      </header>

      <aside className="command-sidebar" aria-label="Navegação principal do FM Command">
        <nav>
          {navigation.map((item) => {
            const normalizedHref = item.href.split("#")[0];
            const active = "exact" in item && item.exact
              ? pathname === normalizedHref
              : normalizedHref !== "/dashboard" && pathname.startsWith(normalizedHref);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "command-nav-item active" : "command-nav-item"}
                aria-current={active ? "page" : undefined}
              >
                <span className="command-nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="command-sidebar-footer">
          <strong>FM COMMAND</strong>
          <span>Visual Premium · governado</span>
        </div>
      </aside>

      <div className="command-content">{children}</div>
    </div>
  );
}
