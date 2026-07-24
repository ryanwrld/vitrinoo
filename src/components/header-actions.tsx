"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown } from "lucide-react";
import { StoreAvatar } from "@/components/store-avatar";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { NotificationBell } from "@/components/notification-bell";
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
  const pathname = usePathname();
  const { storeName, storeLogoUrl } = useStoreIdentity();

  return (
    <div className="hidden shrink-0 items-center gap-3 md:flex">
      <ThemeToggleButton />
      {activityFeed ? (
        <NotificationBell items={activityFeed} />
      ) : (
        <Link
          href="/dashboard/atividade"
          aria-label="Ver notificações"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors duration-150 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
        </Link>
      )}
      <Link
        href="/configuracoes/loja"
        aria-label={storeName ? `Configurações de ${storeName}` : "Configurações da loja"}
        className={`flex h-10 items-center gap-1.5 rounded-full pl-1 pr-2.5 transition-colors duration-150 ${
          pathname === "/configuracoes/loja"
            ? "bg-gray-200 dark:bg-gray-700"
            : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
        }`}
      >
        <StoreAvatar storeName={storeName} logoUrl={storeLogoUrl} />
        <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
      </Link>
    </div>
  );
}
