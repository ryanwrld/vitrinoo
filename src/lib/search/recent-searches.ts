/**
 * Buscas recentes da busca global — persistidas em localStorage (mesmo
 * padrão de front-end-only já usado pro cursor de leitura das notificações).
 * Escopo: por navegador, chave dedicada. Tolerante a erro (localStorage
 * indisponível / JSON corrompido → lista vazia, nunca quebra a busca).
 */
const STORAGE_KEY = "vitrino:recent-searches";
const MAX_RECENT = 5;

export function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function persist(next: string[]): string[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignora erro de quota/serialização — recentes é conveniência, não crítico
  }
  return next;
}

export function addRecentSearch(term: string): string[] {
  const clean = term.trim();
  if (!clean) return getRecentSearches();
  // Dedup case-insensitive, mais recente no topo, teto de MAX_RECENT.
  const rest = getRecentSearches().filter((item) => item.toLowerCase() !== clean.toLowerCase());
  return persist([clean, ...rest].slice(0, MAX_RECENT));
}

/** Remove um termo específico (botão "X" ao lado de cada busca recente). */
export function removeRecentSearch(term: string): string[] {
  return persist(getRecentSearches().filter((item) => item.toLowerCase() !== term.toLowerCase()));
}

/** Apaga todo o histórico (botão "Limpar tudo"). */
export function clearRecentSearches(): string[] {
  return persist([]);
}
