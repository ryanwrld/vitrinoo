"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bell, Eye, MessageCircle } from "lucide-react";
import type { ActivityFeedItem } from "@/lib/dashboard/metrics";
import { formatRelativeTime } from "@/lib/dashboard/format-relative-time";

const READ_AT_STORAGE_KEY = "vitrino:notifications-read-at";
const READ_AT_CHANGED_EVENT = "vitrino:notifications-read-changed";

/**
 * `useSyncExternalStore` em vez de `useState` + `setState` num efeito de
 * mount (mesmo motivo de `theme-toggle-button.tsx`: servidor não tem
 * `localStorage`, então o snapshot do servidor é `null` até a hidratação
 * confirmar — e chamar `setState` sincronamente dentro de um efeito
 * dispara render em cascata, o que o lint do projeto rejeita).
 * `localStorage.setItem` no mesmo tab não dispara o evento nativo
 * `storage` (esse só dispara em OUTRAS abas) — por isso `handleMarkAllRead`
 * despacha `READ_AT_CHANGED_EVENT` manualmente pra forçar a resubscrição.
 */
function subscribeToReadAt(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(READ_AT_CHANGED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(READ_AT_CHANGED_EVENT, callback);
  };
}
function getReadAtSnapshot() {
  return localStorage.getItem(READ_AT_STORAGE_KEY);
}
function getReadAtServerSnapshot() {
  return null;
}

/**
 * Sino como pop-up (não mais um link direto pra uma página dedicada de
 * notificações) — abre um painel flutuante ancorado no próprio botão,
 * ocupando o canto superior direito por cima do conteúdo do Dashboard
 * (referência visual do usuário: painel a partir do sino, alinhado à
 * direita, com scroll interno). `/dashboard/atividade` (histórico completo
 * paginado) continua existindo como "Ver histórico completo" no rodapé do
 * painel, pra quem quiser vasculhar além do que cabe aqui.
 *
 * `items` vem do MESMO `queryRecentActivity` já buscado pela página que
 * renderiza este componente — nenhuma query extra/client fetch só pra abrir
 * o pop-up.
 *
 * "Marcar tudo como lido" é 100% front-end — cursor de leitura em
 * `localStorage`, sem tabela/coluna nova nem Server Action. `DashboardAutoRefresh`
 * chama `router.refresh()` a cada 10s, mas isso só refaz o fetch dos itens no
 * servidor; não desmonta este componente nem apaga localStorage, então o
 * cursor sobrevive ao polling sem precisar de nenhum estado no backend.
 * Escopo: um cursor por navegador, não por usuário/dispositivo — suficiente
 * pro caso de uso atual (revendedor solo, um painel).
 */
export function NotificationBell({ items }: { items: ActivityFeedItem[] }) {
  const [open, setOpen] = useState(false);
  const readAt = useSyncExternalStore(subscribeToReadAt, getReadAtSnapshot, getReadAtServerSnapshot);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = readAt ? items.filter((item) => new Date(item.createdAt) > new Date(readAt)).length : items.length;

  function handleMarkAllRead() {
    const now = new Date().toISOString();
    localStorage.setItem(READ_AT_STORAGE_KEY, now);
    window.dispatchEvent(new Event(READ_AT_CHANGED_EVENT));
    toast.success("Notificações marcadas como lidas.");
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unreadCount > 0 ? `Ver notificações (${unreadCount} não lidas)` : "Ver notificações"}
        aria-expanded={open}
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors duration-150 dark:text-gray-300 ${
          open ? "bg-gray-200 dark:bg-gray-700" : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
        }`}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-gray-100 dark:bg-blue-400 dark:ring-gray-800" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          className="notification-glow-border animate-scale-in absolute right-0 top-full z-50 mt-3 flex max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl shadow-[0_25px_50px_-12px_rgba(3,8,33,0.16),0_0_0_1px_rgba(3,8,33,0.06)] backdrop-blur-xl backdrop-saturate-75 dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.55)]"
          style={{ transformOrigin: "top right" }}
        >
          <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-[15px] font-bold text-gray-900 dark:text-gray-50">Atividade</h2>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary dark:bg-blue-400/10 dark:text-blue-300">
                    {unreadCount}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs font-semibold text-primary transition-colors duration-150 hover:text-primary-hover dark:text-blue-300 dark:hover:text-blue-200"
                >
                  Marcar tudo como lido
                </button>
              )}
            </div>
            <div className="relative mx-4 h-px bg-gradient-to-r from-transparent via-gray-900/10 to-transparent dark:via-white/10" />

          {items.length > 0 ? (
            <ul className="relative flex-1 overflow-y-auto px-2 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {items.map((item, index) => {
                const Icon = item.type === "click" ? MessageCircle : Eye;
                return (
                  <li
                    key={`${item.type}-${item.productId}-${item.createdAt}-${index}`}
                    className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors duration-150 hover:bg-gray-900/[.04] dark:hover:bg-white/[.06]"
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                        item.type === "click"
                          ? "bg-success-bg text-success-fg dark:bg-success-solid/15"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {item.type === "click" ? (
                        <>
                          Alguém clicou em <b className="font-semibold text-gray-900 dark:text-gray-50">&quot;Pedir agora&quot;</b> — {item.productName}
                        </>
                      ) : (
                        <>
                          <b className="font-semibold text-gray-900 dark:text-gray-50">{item.count} visualizaç{item.count > 1 ? "ões" : "ão"}</b> nova{item.count > 1 ? "s" : ""} — {item.productName}
                        </>
                      )}
                      <span className="block text-xs text-gray-400 dark:text-gray-500">{formatRelativeTime(item.createdAt)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="relative flex flex-col gap-1 px-4 py-8 text-center">
              <span className="font-medium text-gray-900 dark:text-gray-50">Ainda sem atividade</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">Assim que sua vitrine receber acessos ou pedidos, eles aparecem aqui.</span>
            </div>
          )}

            <div className="relative mx-4 h-px bg-gradient-to-r from-transparent via-gray-900/10 to-transparent dark:via-white/10" />
            <Link
              href="/dashboard/atividade"
              onClick={() => setOpen(false)}
              className="relative px-4 py-3 text-center text-sm font-semibold text-primary transition-colors duration-150 hover:bg-gray-900/[.04] dark:text-blue-300 dark:hover:bg-white/[.06]"
            >
              Ver histórico completo
            </Link>
        </div>
      )}
    </div>
  );
}
