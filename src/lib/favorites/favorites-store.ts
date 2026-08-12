/**
 * Persistência pura dos favoritos do comprador — 100% client-side, sem
 * nenhum tráfego pro backend (RLS/auth intocados, mesmo espírito de
 * `visitor-id.ts`). Uma chave de `localStorage` POR LOJA
 * (`vitrinoo:favorites:<slug>`), nunca uma lista global entre lojas —
 * decisão do usuário: misturar favoritos de revendedores diferentes não faz
 * sentido, já que "Pedir tudo" manda pra UM número de WhatsApp só.
 *
 * Todo acesso ao storage é protegido (mesma disciplina de
 * `resolveVisitorId`): navegador em modo restrito, storage bloqueado ou cota
 * estourada fazem `localStorage` LANÇAR — aqui isso nunca pode derrubar o
 * componente que chama, só degrada para "favoritar não persiste".
 */

/** Exportada para `use-favorites.ts` ler o MESMO storage key ao montar o
 *  snapshot de `useSyncExternalStore` — uma segunda cópia dessa string
 *  divergiria silenciosamente se uma das duas mudasse sozinha. */
export function favoritesStorageKey(slug: string): string {
  return `vitrinoo:favorites:${slug}`;
}

export function readFavoriteIds(slug: string): string[] {
  try {
    const raw = window.localStorage.getItem(favoritesStorageKey(slug));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function writeFavoriteIds(slug: string, ids: string[]): void {
  try {
    window.localStorage.setItem(favoritesStorageKey(slug), JSON.stringify(ids));
  } catch {
    // Storage indisponível/cheio: a UI já atualizou seu próprio estado em
    // memória (ver use-favorites.ts) — só a persistência entre sessões falha.
  }
}

/**
 * Alterna um produto na lista e devolve a lista JÁ ATUALIZADA — o chamador
 * (use-favorites.ts) usa o retorno pra atualizar o estado em memória sem
 * precisar reler o storage logo em seguida.
 */
export function toggleFavoriteId(slug: string, productId: string): string[] {
  const current = readFavoriteIds(slug);
  const next = current.includes(productId)
    ? current.filter((id) => id !== productId)
    : [...current, productId];
  writeFavoriteIds(slug, next);
  return next;
}
