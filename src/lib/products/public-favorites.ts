const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Filtra a lista crua de `?ids=` contra o formato de UUID ANTES de qualquer
 * `.in()` — mesma disciplina de `VALID_BRANDS`/`VALID_SOLES` em
 * `public-list.ts`: nenhum valor arbitrário de query string chega ao
 * Postgres sem passar por uma validação de forma fixa primeiro.
 */
export function parseFavoriteIds(raw: string | undefined): string[] {
  if (!raw) return [];
  const ids = raw.split(",").map((value) => value.trim());
  // Set preserva a primeira ocorrência na ORDEM original — um id repetido em
  // "?ids=a,b,a" não pode duplicar o produto na lista.
  return Array.from(new Set(ids.filter((id) => UUID_PATTERN.test(id))));
}
