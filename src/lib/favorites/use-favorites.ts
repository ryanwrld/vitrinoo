"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { favoritesStorageKey, toggleFavoriteId } from "./favorites-store";

/**
 * Disparado manualmente após um toggle — `localStorage.setItem` no MESMO tab
 * não emite o evento nativo `storage` (esse só dispara em OUTRAS abas), então
 * sem isso o coração de um card e o contador da aba "Favoritos" (dois
 * componentes distintos lendo o mesmo storage) ficariam dessincronizados até
 * o próximo reload. Mesmo padrão de `notification-bell.tsx`.
 */
const FAVORITES_CHANGED_EVENT = "vitrinoo:favorites-changed";

function subscribe(slug: string, callback: () => void) {
  function handleStorage(event: StorageEvent) {
    // `event.key === null` = storage.clear() inteiro; senão só reage à
    // chave DESTA loja — favoritar numa aba de outra loja aberta ao lado
    // não deve re-renderizar nada aqui.
    if (event.key === null || event.key === favoritesStorageKey(slug)) callback();
  }
  window.addEventListener("storage", handleStorage);
  window.addEventListener(FAVORITES_CHANGED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(FAVORITES_CHANGED_EVENT, callback);
  };
}

/** Servidor não tem `localStorage` — snapshot vazio até a hidratação
 *  confirmar, mesma disciplina de `getReadAtServerSnapshot` em
 *  notification-bell.tsx. O coração nasce "vazio" e nunca pisca errado. */
function getServerSnapshot(): string {
  return "[]";
}

/**
 * Hook de favoritos da vitrine pública — 100% client-side (ver
 * favorites-store.ts). `useSyncExternalStore` (não `useState` + efeito de
 * mount) pelo mesmo motivo de `useOpensInNewTab`/`NotificationBell`: o
 * snapshot precisa ser um valor ESTÁVEL entre chamadas (aqui, a string bruta
 * do storage) — devolver um array novo a cada render faria
 * `useSyncExternalStore` entrar em loop de re-render (comparação por
 * `Object.is`). O array/Set derivados ficam em `useMemo`, recalculados só
 * quando a string realmente muda.
 */
export function useFavorites(slug: string) {
  const subscribeToSlug = useCallback((callback: () => void) => subscribe(slug, callback), [slug]);
  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(favoritesStorageKey(slug)) ?? "[]";
    } catch {
      return "[]";
    }
  }, [slug]);

  const raw = useSyncExternalStore(subscribeToSlug, getSnapshot, getServerSnapshot);

  const ids = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
    } catch {
      return [];
    }
  }, [raw]);

  const idSet = useMemo(() => new Set(ids), [ids]);

  const toggle = useCallback(
    (productId: string) => {
      toggleFavoriteId(slug, productId);
      window.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT));
    },
    [slug]
  );

  return {
    ids,
    isFavorite: (productId: string) => idSet.has(productId),
    toggle,
    count: ids.length,
  };
}
