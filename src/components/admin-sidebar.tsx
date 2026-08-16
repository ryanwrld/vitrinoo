"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Home, List, Settings, ExternalLink, Bell, ChevronDown, Headset, LogOut } from "lucide-react";
import { LogoMark } from "@/components/logo-mark";
import { StoreAvatar } from "@/components/store-avatar";
import { ThemeMenuItem } from "@/components/theme-toggle-button";
import { SearchTriggerButton, SearchModal } from "@/components/sidebar-search";
import { signOutAction } from "@/lib/auth/actions";
import { buildSupportWhatsAppHref } from "@/lib/support/whatsapp";

/**
 * Itens de navegação do painel (D-07, copy verbatim): Dashboard, Produtos,
 * Configurações. "Sair da conta" fica separado no rodapé, nunca na lista.
 * Ícones seguem `ui_kits/admin/AdminShell.jsx` do design system (casa,
 * lista, engrenagem).
 */
const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", Icon: Home },
  { href: "/admin/produtos", label: "Produtos", Icon: List },
  { href: "/admin/configuracoes", label: "Configurações", Icon: Settings },
];

/**
 * Links de navegação compartilhados entre a sidebar desktop e o drawer
 * mobile (mesmo componente interno, nunca duas implementações divergentes).
 * Link ativo via `usePathname().startsWith(item.href)` — como cada item tem
 * um prefixo distinto (`/admin/dashboard`, `/admin/produtos`, `/admin/configuracoes`), não há
 * colisão entre eles. Estilo pill (fundo `bg-primary-subtle`/texto `primary`
 * quando ativo) conforme `components/navigation/NavItem.jsx` do design
 * system — substitui o antigo indicador de borda esquerda.
 */
function NavLinks({ pathname }: { pathname: string }) {
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/admin/configuracoes"
            ? pathname === "/admin/configuracoes"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive
                ? "flex min-h-11 items-center gap-3 rounded-full bg-primary-subtle px-3 font-semibold text-primary transition-colors duration-150 dark:bg-blue-400/15 dark:text-blue-300"
                : "flex min-h-11 items-center gap-3 rounded-full px-3 font-medium text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50"
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
 * `align="left"` na sidebar desktop (pedido explícito do usuário, volta ao
 * alinhamento original); drawer mobile mantém centralizado com o ajuste
 * ótico de `-translate-x-1` (lockup ícone+texto "puxa" o olho pra direita
 * quando centralizado, o texto pesa visualmente mais que o ícone).
 */
function LogoHeader({ align = "center" }: { align?: "left" | "center" }) {
  return (
    <div className={`flex items-center gap-2 px-3 ${align === "center" ? "-translate-x-1 justify-center" : ""}`}>
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
          href={`/${storeSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-1 flex min-h-10 items-center gap-2.5 rounded-full px-2 text-sm font-medium text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50"
        >
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
          Ver minha vitrine
        </a>
      )}

      {/* Falar com suporte — abre o WhatsApp com mensagem pronta */}
      <a
        href={buildSupportWhatsAppHref(storeName)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-10 items-center gap-2.5 rounded-full px-2 text-sm font-medium text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50"
      >
        <Headset className="h-4 w-4 shrink-0" aria-hidden="true" />
        Falar com suporte
      </a>
    </div>
  );
}

/**
 * AdminSidebar (D-05/D-06): sidebar fixa no desktop (`<aside hidden md:flex>`)
 * + hambúrguer que abre um drawer `<dialog>` nativo no mobile
 * (`<button md:hidden>` + `.showModal()`). Ambos sempre no DOM — CSS decide
 * a visibilidade (mesma técnica de `[slug]/page.tsx`).
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  // Estado da busca mora AQUI (não no SidebarSearch) pra o gatilho desktop (no
  // aside) e o do drawer mobile abrirem o MESMO modal — uma instância só, um
  // atalho ⌘K só. Ver sidebar-search.tsx.
  const [searchOpen, setSearchOpen] = useState(false);

  function closeDrawer() {
    dialogRef.current?.close();
  }

  // Mesmo padrão de clique-fora/Esc do menu de conta do header desktop
  // (header-actions.tsx) — duplicado aqui em vez de extraído porque o
  // acionador mobile (barra de topo) e o desktop (HeaderActions) vivem em
  // componentes diferentes sem um pai client comum próximo o bastante pra
  // justificar um hook compartilhado só por isso.
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

  // Atalho global ⌘K / Ctrl+K pra abrir a busca (funciona em Mac e Windows).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col gap-4 border-r border-gray-200 bg-white p-3 py-5 md:flex dark:border-gray-800 dark:bg-gray-900">
        <LogoHeader align="left" />
        <SearchTriggerButton onClick={() => setSearchOpen(true)} />
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
          {/* Escondido na própria /dashboard/notificacoes: seria um atalho
              para a página em que o usuário já está. Mesma decisão do
              cabeçalho desktop (header-actions.tsx, prop `showBell`). */}
          {pathname !== "/admin/dashboard/notificacoes" && (
            <Link
              href="/admin/dashboard/notificacoes"
              aria-label="Ver notificações"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors duration-150 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
            </Link>
          )}
          {/* Mesmo mecanismo do avatar+seta do header desktop
              (header-actions.tsx): pill inteiro é um único alvo de clique
              que abre o menu de conta (Sair). A configuração da loja não
              tem mais rota própria — foi fundida em /configuracoes. */}
          <div ref={accountMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setAccountMenuOpen((value) => !value)}
              aria-label="Menu da conta"
              aria-expanded={accountMenuOpen}
              className={`flex h-10 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-gray-500 transition-colors duration-150 dark:text-gray-400 ${
                accountMenuOpen ? "bg-gray-200 dark:bg-gray-700" : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
              }`}
            >
              <StoreAvatar storeName={storeName} logoUrl={storeLogoUrl} />
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>

            {accountMenuOpen && (
              <div
                className="animate-scale-in absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-[1.5rem] border border-gray-200 bg-white p-2 shadow-md dark:border-gray-800 dark:bg-gray-900"
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
                {/* Só existe aqui — no mobile/tablet não tem o círculo
                    isolado de tema que o header desktop tem, então esse
                    dropdown é o único jeito de trocar tema por lá. */}
                <ThemeMenuItem />
              </div>
            )}
          </div>
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
          {/* Busca no drawer — FECHA o drawer antes de abrir a busca: o
              <dialog> aberto por showModal() fica na top layer do navegador,
              acima de qualquer z-index (inclusive do modal portalizado), então
              abrir a busca com o drawer aberto a deixaria escondida atrás. */}
          <SearchTriggerButton
            onClick={() => {
              closeDrawer();
              setSearchOpen(true);
            }}
          />
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

      {/* Modal de busca — instância ÚNICA, aberta tanto pelo gatilho do aside
          (desktop) quanto pelo do drawer (mobile) e pelo ⌘K. */}
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        storeName={storeName}
        storeSlug={storeSlug}
      />
    </>
  );
}
