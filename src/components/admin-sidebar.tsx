"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Home, List, Settings, LogOut, ExternalLink, Bell, ChevronDown } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { LogoMark } from "@/components/logo-mark";
import { StoreAvatar } from "@/components/store-avatar";

/**
 * Itens de navegação do painel (D-07, copy verbatim): Dashboard, Produtos,
 * Configurações. "Sair da conta" fica separado no rodapé, nunca na lista.
 * Ícones seguem `ui_kits/admin/AdminShell.jsx` do design system (casa,
 * lista, engrenagem).
 */
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", Icon: Home },
  { href: "/produtos", label: "Produtos", Icon: List },
  { href: "/configuracoes", label: "Configurações", Icon: Settings },
];

/**
 * Links de navegação compartilhados entre a sidebar desktop e o drawer
 * mobile (mesmo componente interno, nunca duas implementações divergentes).
 * Link ativo via `usePathname().startsWith(item.href)` — como cada item tem
 * um prefixo distinto (`/dashboard`, `/produtos`, `/configuracoes`), não há
 * colisão entre eles. Estilo pill (fundo `bg-primary-subtle`/texto `primary`
 * quando ativo) conforme `components/navigation/NavItem.jsx` do design
 * system — substitui o antigo indicador de borda esquerda.
 */
function NavLinks({ pathname }: { pathname: string }) {
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/configuracoes"
            ? pathname === "/configuracoes"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive
                ? "flex min-h-11 items-center gap-3 rounded-md bg-primary-subtle px-3 font-semibold text-primary transition-colors duration-150 dark:bg-blue-400/15 dark:text-blue-300"
                : "flex min-h-11 items-center gap-3 rounded-md px-3 font-medium text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50"
            }
          >
            <item.Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

/**
 * Cabeçalho de logo — usa o SVG real do LogoMark + wordmark "Vitrinoo".
 */
function LogoHeader() {
  // -translate-x-1: centralização matemática de um lockup ícone+texto tende
  // a "puxar" o olho pra direita (o texto pesa visualmente mais que o
  // ícone) — pequeno ajuste ótico pra a dupla ficar equilibrada no centro
  // da sidebar.
  return (
    <div className="flex -translate-x-1 items-center justify-center gap-2 px-3">
      <LogoMark size={28} />
      <span className="font-display text-lg font-extrabold text-gray-900 dark:text-gray-50">Vitrinoo</span>
    </div>
  );
}

/**
 * Bloco de conta no rodapé da sidebar (iniciais + nome da loja + rótulo
 * "revendedor"), conforme `AdminShell.jsx`. `storeName` vem de uma query já
 * existente no layout do painel — puramente exibição, sem mutação nova.
 */
function AccountBlock({
  storeName,
  storeSlug,
}: {
  storeName: string | null;
  storeSlug?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-gray-200 px-3 pt-4 dark:border-gray-800">
      {/* Ver vitrine pública — link de acesso rápido */}
      {storeSlug && (
        <a
          href={`/loja/${storeSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-1 flex min-h-10 items-center gap-2.5 rounded-md px-2 text-sm font-medium text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50"
        >
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
          Ver minha vitrine
        </a>
      )}

      {/* Sair da conta */}
      <form action={signOutAction}>
        <button
          type="submit"
          className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-2 text-sm font-medium text-gray-500 transition-colors duration-150 hover:bg-error-bg hover:text-error-fg dark:text-gray-400 dark:hover:bg-error-solid/15"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          Sair da conta
        </button>
      </form>
    </div>
  );
}

/**
 * AdminSidebar (D-05/D-06): sidebar fixa no desktop (`<aside hidden md:flex>`)
 * + hambúrguer que abre um drawer `<dialog>` nativo no mobile
 * (`<button md:hidden>` + `.showModal()`). Ambos sempre no DOM — CSS decide
 * a visibilidade (mesma técnica de `loja/[slug]/page.tsx`).
 */
export function AdminSidebar({
  storeName,
  storeSlug,
  storeLogoUrl,
}: {
  storeName: string | null;
  storeSlug?: string | null;
  storeLogoUrl?: string | null;
}) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);

  function closeDrawer() {
    dialogRef.current?.close();
  }

  // Fecha o drawer se a viewport cruzar para desktop (>= md) enquanto ele
  // está aberto — sem isso, o <dialog> continua aberto (e visualmente
  // sobreposto ao layout desktop) quando o usuário redimensiona a janela
  // ou sai da emulação mobile do DevTools sem fechar o menu primeiro.
  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    function handleChange(event: MediaQueryListEvent | MediaQueryList) {
      if (event.matches) {
        dialogRef.current?.close();
      }
    }
    handleChange(mediaQuery);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return (
    <>
      {/* Desktop: sidebar fixa, sempre no DOM, só visível >= md */}
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col gap-6 border-r border-gray-200 bg-white p-3 py-5 md:flex dark:border-gray-800 dark:bg-gray-900">
        <LogoHeader />
        <nav className="flex flex-col gap-0.5">
          <NavLinks pathname={pathname} />
        </nav>
        <div className="mt-auto">
          <AccountBlock storeName={storeName} storeSlug={storeSlug} />
        </div>
      </aside>

      {/* Mobile: barra de topo com o hambúrguer e perfil (D-06 / UI-SPEC linha 132) — só visível < md */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 md:hidden dark:border-gray-800 dark:bg-gray-900">
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="-ml-2 flex min-h-11 min-w-11 items-center justify-center text-gray-900 dark:text-gray-50"
          aria-label="Abrir menu"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/atividade"
            aria-label="Ver notificações"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors duration-150 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
          </Link>
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
      </div>
      <dialog
        ref={dialogRef}
        aria-label="Menu de navegação"
        className="m-0 h-dvh max-h-none w-64 max-w-none bg-white p-4 backdrop:bg-black/45 backdrop:backdrop-blur-[2px] dark:bg-gray-900"
        onCancel={closeDrawer}
      >
        <div className="flex h-full flex-col gap-6 animate-scale-in">
          <div className="flex items-center justify-between">
            <LogoHeader />
            <button
              type="button"
              onClick={closeDrawer}
              className="flex min-h-11 min-w-11 items-center justify-center"
              aria-label="Fechar menu"
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <nav className="flex flex-col gap-0.5" onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) {
              closeDrawer();
            }
          }}>
            <NavLinks pathname={pathname} />
          </nav>
          <div className="mt-auto">
            <AccountBlock storeName={storeName} storeSlug={storeSlug} />
          </div>
        </div>
      </dialog>
    </>
  );
}
