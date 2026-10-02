"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SignOutButton } from "./sign-out-button";

const navigation = [
  { href: "/dashboard", label: "Visão Geral", icon: "⌂", exact: true },
  { href: "/dashboard#product-intelligence-title", label: "Produtos", icon: "◇" },
  { href: "/dashboard/finance", label: "Financeiro", icon: "▥" },
  { href: "/dashboard/growth", label: "Comercial", icon: "↗" },
  { href: "/dashboard/customers", label: "Clientes", icon: "◎" },
  { href: "/dashboard/operations", label: "Operações", icon: "◉" },
  { href: "/dashboard/alerts", label: "Incidentes", icon: "△" },
  { href: "/dashboard/intelligence", label: "Core", icon: "⬡" },
  { href: "/dashboard/commercial/kordena", label: "Kordena", icon: "K" },
  { href: "/dashboard/sources", label: "Fontes e Integrações", icon: "⚙" },
] as const;

export function CommandShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

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
        <div className="command-global-search" aria-label="Busca global indisponível" aria-disabled="true">
          <span className="command-global-search-icon" aria-hidden="true">⌕</span>
          <span>Busca global</span>
          <em>Indisponível</em>
        </div>
        <div className="command-topbar-actions">
          <div className="command-topbar-badge" aria-label="Ambiente governado">
            <span aria-hidden="true">●</span>
            Ambiente governado
          </div>
          <span className="command-notification is-unavailable" aria-label="Notificações indisponíveis" title="Notificações indisponíveis">
            <span aria-hidden="true">◌</span>
          </span>
          <span className="command-user-chip" aria-label="Sessão protegida com acesso governado">
            <span className="command-user-avatar" aria-hidden="true">FM</span>
            <span className="command-user-copy">
              <strong>Sessão protegida</strong>
              <small>Acesso governado</small>
            </span>
          </span>
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
