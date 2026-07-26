"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, LogOut } from "lucide-react";
import { StoreAvatar } from "@/components/store-avatar";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { NotificationBell } from "@/components/notification-bell";
import { signOutAction } from "@/lib/auth/actions";
import type { ActivityFeedItem } from "@/lib/dashboard/metrics";
import { useStoreIdentity } from "@/lib/store-identity/context";

/**
 * Sino + avatar/seta — antes viviam num `<header>` de layout compartilhado
 * (removido: sobrava um vão vazio entre ele e o h1 de cada página). Agora
 * cada página desktop renderiza isso na MESMA linha do seu h1 (`items-center
 * justify-between`), então some o espaço morto sem precisar de padding
 * mágico. `hidden md:flex`: no mobile essa mesma informação já vive na barra
 * de topo do `AdminSidebar` (hambúrguer + sino + avatar), não duplicar aqui.
 */
export function HeaderActions({ activityFeed }: { activityFeed?: ActivityFeedItem[] }) {
  const { storeName, storeLogoUrl } = useStoreIdentity();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  return (
    <div className="hidden shrink-0 items-center gap-3 md:flex">
      <ThemeToggleButton />
      {activityFeed ? (
        <NotificationBell items={activityFeed} />
      ) : (
        <Link
          href="/dashboard/notificacoes"
          aria-label="Ver notificações"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors duration-150 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
        </Link>
      )}
      {/* Pill inteiro é um único alvo de clique agora — a interação de ir
          pra /configuracoes/loja foi removida (rota continua existindo, só
          não tem mais esse atalho); clicar em qualquer parte do pill
          (avatar ou seta) abre o menu de conta (Sair). */}
      <div ref={accountMenuRef} className="relative">
        <button
          type="button"
          onClick={() => setAccountMenuOpen((value) => !value)}
          aria-label="Menu da conta"
          aria-expanded={accountMenuOpen}
          className={`flex h-10 items-center gap-1.5 rounded-full pl-1 pr-2 text-gray-500 transition-colors duration-150 dark:text-gray-400 ${
            accountMenuOpen ? "bg-gray-200 dark:bg-gray-700" : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
          }`}
        >
          <StoreAvatar storeName={storeName} logoUrl={storeLogoUrl} />
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>

        {accountMenuOpen && (
          <div
            className="animate-scale-in absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-md dark:border-gray-800 dark:bg-gray-900"
            style={{ transformOrigin: "top right" }}
          >
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-error-bg hover:text-error-fg dark:text-gray-300 dark:hover:bg-error-solid/15"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                Sair da conta
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
