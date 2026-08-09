import { BRANDS } from "@/lib/products/constants";

/**
 * Opções de marca REALMENTE presentes no catálogo publicado de uma loja —
 * o filtro da vitrine não deve oferecer marca que não existe ali (um chip
 * "Mizuno" que sempre devolve vazio é ruído, não filtro).
 *
 * Resolve também o caso "Outra": no banco, marca fora da lista fixa é
 * gravada como `brand = 'Outra'` + `brand_other = '<nome digitado>'`. Expor
 * "Outra" como opção pro cliente final não comunica nada, então cada valor
 * distinto de `brand_other` vira uma opção própria com o nome real que o
 * revendedor digitou (ex.: "Umbro"), mantendo `Outra` como o valor que
 * trafega na URL — a query continua filtrando por `brand`, sem coluna nova.
 *
 * Consequência aceita: se a loja tem produtos de DUAS marcas "Outra"
 * diferentes (ex.: Umbro e Kappa), ambas aparecem como opções, mas
 * selecionar qualquer uma filtra por `brand = 'Outra'` e traz as duas. É o
 * comportamento que a modelagem atual permite sem migration; separá-las
 * exigiria uma coluna de marca normalizada.
 *
 * Sem cache (mesma disciplina do resto da vitrine): marca nova cadastrada
 * no painel aparece no filtro no próximo carregamento.
 */
export type BrandFacet = {
  /** Valor que vai para a URL (`?brand=`) — sempre um item de BRANDS. */
  value: string;
  /** Rótulo exibido — nome real quando `Outra`, senão o próprio valor. */
  label: string;
};

const VALID_BRANDS = new Set<string>(BRANDS);

/**
 * Monta as facetas a partir de linhas JÁ LIDAS. Extraída de
 * `queryBrandFacets` para `queryStorefrontProfile` (src/lib/store/
 * storefront-profile.ts) reaproveitar exatamente esta lógica sobre a
 * consulta que ele já faz — em vez de reler o catálogo inteiro só para
 * recalcular as marcas, e correr o risco das duas implementações
 * divergirem com o tempo.
 */
export function buildBrandFacets(rows: { brand: string; brand_other: string | null }[]): BrandFacet[] {
  const facets = new Map<string, BrandFacet>();

  for (const row of rows) {
    if (!VALID_BRANDS.has(row.brand)) continue;

    if (row.brand === "Outra") {
      const custom = row.brand_other?.trim();
      // Produto marcado "Outra" sem nome preenchido não vira opção: um chip
      // "Outra" sozinho é exatamente o rótulo sem significado que estamos
      // eliminando.
      if (!custom) continue;
      facets.set(`Outra:${custom.toLowerCase()}`, { value: "Outra", label: custom });
      continue;
    }

    facets.set(row.brand, { value: row.brand, label: row.brand });
  }

  // Ordena pela posição em BRANDS (Nike, Adidas, Puma…) para o filtro ter
  // sempre a mesma ordem entre lojas; marcas "Outra" vão para o fim, em
  // ordem alfabética.
  return Array.from(facets.values()).sort((a, b) => {
    const indexA = a.value === "Outra" ? Number.MAX_SAFE_INTEGER : BRANDS.indexOf(a.value as (typeof BRANDS)[number]);
    const indexB = b.value === "Outra" ? Number.MAX_SAFE_INTEGER : BRANDS.indexOf(b.value as (typeof BRANDS)[number]);
    if (indexA !== indexB) return indexA - indexB;
    return a.label.localeCompare(b.label, "pt-BR");
  });
}
