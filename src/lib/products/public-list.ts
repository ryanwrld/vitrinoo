import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { BRANDS, SOLES, FULFILLMENTS, SORT_OPTIONS, DEFAULT_SORT, type SortOption } from "@/lib/products/constants";

/**
 * Leitura pública paginada de produtos publicados (VITR-01/VITR-04,
 * 04-RESEARCH.md Pattern 3) — variante pública/anônima de
 * `src/lib/products/list.ts` (`queryProducts`, painel admin). NUNCA importar
 * ou modificar `list.ts` — são funções paralelas, uma owner-scoped (sessão),
 * outra pública (sem sessão, role `anon` no Postgres).
 *
 * `status` é SEMPRE fixo 'published' no código — nunca aceito via `params`,
 * para nunca expor esse controle ao cliente final (04-RESEARCH.md Pattern 3).
 *
 * `page` é 1-based em toda a stack (04-RESEARCH.md Pitfall 7). Paginação usa
 * a técnica "buscar PUBLIC_PAGE_SIZE + 1, mostrar PUBLIC_PAGE_SIZE" (Open
 * Question 3) em vez de `count: "exact"` — mais barato, evita uma segunda
 * query.
 *
 * Filtros de categoria (brand/sole/fulfillment, D-01/D-02) são multi-select
 * — `.in("campo", array)`, nunca `.eq()` (diferença deliberada em relação ao
 * queryProducts do admin, que é single-select). Busca por nome (D-03) é
 * `ilike` parcial case-insensitive. Cada array é validado contra as listas
 * fixas de `constants.ts` ANTES de qualquer `.in()` — um valor fora da lista
 * é silenciosamente ignorado, nunca propagado como erro nem interpolado cru
 * (Security Domain V5, 04-RESEARCH.md).
 */
export type QueryPublicProductsParams = {
  page?: number;
  q?: string;
  brand?: string[];
  sole?: string[];
  fulfillment?: string[];
  sort?: string;
  /** Filtro "Favoritos" (ids do localStorage do comprador, ver
   *  favorite-button.tsx) — combina com os demais filtros via `.in("id", …)`
   *  em vez de trocar para uma consulta/página à parte. Produto favoritado
   *  que ficou esgotado é a ÚNICA exceção à regra de visibilidade abaixo
   *  (decisão do usuário): continua aparecendo mesmo com "ocultar esgotados"
   *  ativo, pra não sumir sem explicação da lista que o comprador já
   *  favoritou. */
  favoriteIds?: string[];
};

const VALID_BRANDS = new Set<string>(BRANDS);
const VALID_SOLES = new Set<string>(SOLES);
const VALID_FULFILLMENTS = new Set<string>(FULFILLMENTS.map((item) => item.value));
const VALID_SORTS = new Set<string>(SORT_OPTIONS.map((item) => item.value));

/**
 * Mapa ordenação -> coluna/direção. Isolado num objeto (nunca uma string
 * vinda de `params` interpolada em `.order()`) pela mesma disciplina que
 * valida brand/sole/fulfillment contra listas fixas: um valor arbitrário de
 * searchParams jamais chega ao Postgres.
 */
const SORT_CLAUSES: Record<SortOption, { column: "created_at" | "price"; ascending: boolean }> = {
  recentes: { column: "created_at", ascending: false },
  menor_preco: { column: "price", ascending: true },
  maior_preco: { column: "price", ascending: false },
};

export function resolveSort(value: string | undefined): SortOption {
  return value && VALID_SORTS.has(value) ? (value as SortOption) : DEFAULT_SORT;
}

/**
 * Expande a seleção de modalidade do cliente para o conjunto de valores que
 * REALMENTE satisfazem a intenção dele. Um produto marcado `ambos` é
 * atendido tanto por pronta entrega quanto por encomenda — então ele
 * pertence a qualquer filtro selecionado, e não a um chip "Ambos" próprio
 * (que era o bug: filtrar "Pronta entrega" escondia produtos que o
 * revendedor de fato entrega na hora). Sem seleção nenhuma, retorna vazio e
 * o chamador não aplica `.in()` — todos aparecem.
 */
export function expandFulfillmentFilter(selected: string[]): string[] {
  const valid = selected.filter((value) => VALID_FULFILLMENTS.has(value));
  if (valid.length === 0) return [];
  return Array.from(new Set([...valid, "ambos"]));
}

export type PublicProduct = {
  id: string;
  name: string;
  brand: string;
  brand_other: string | null;
  line: string | null;
  price: number;
  /** Preço promocional (gatilho de conversão, `PriceDisplay`) — `null` sem
   * promoção ativa. */
  promotional_price: number | null;
  /** Disponibilidade derivada (mesmo cálculo de queryProducts do admin):
   * EXISTS sobre product_sizes.available=true. */
  disponivel: boolean;
  /** storage_path da foto de posição mais baixa (capa), ou null sem foto. */
  coverPath: string | null;
};

/**
 * Regra de visibilidade de esgotado (D-09/D-10/D-11, Plan 04-06) resolvida
 * EXCLUSIVAMENTE aqui — nunca replicada em product-card.tsx/product-grid.tsx.
 * `effectiveHide = product.hide_when_sold_out ?? storeHideSoldOutDefault`;
 * produto aparece se `disponivel === true` OU `effectiveHide === false`.
 *
 * Trade-off assumido conscientemente (não uma redução de escopo): como este
 * filtro roda DEPOIS da paginação `.range()`, uma página pode retornar menos
 * que PUBLIC_PAGE_SIZE itens visíveis quando parte do lote buscado é
 * ocultada — `hasMore` continua correto em relação ao conjunto subjacente de
 * publicados, e chamadas subsequentes de "carregar mais"/página seguinte
 * eventualmente mostram todo o catálogo visível, nunca duplicando nem
 * travando. Fazer esse filtro no SQL exigiria abandonar o padrão de duas
 * queries + join em memória já estabelecido no codebase (disponibilidade
 * não é uma coluna real, é derivada de product_sizes numa segunda query).
 */
export function isVisible(hideWhenSoldOut: boolean | null, disponivel: boolean, storeHideSoldOutDefault: boolean): boolean {
  const effectiveHide = hideWhenSoldOut ?? storeHideSoldOutDefault;
  return disponivel || !effectiveHide;
}

export type QueryPublicProductsResult = {
  products: PublicProduct[];
  hasMore: boolean;
};

/**
 * 24 (era 20): é o único valor que fecha fileiras CHEIAS em toda a régua de
 * colunas do grid (8/6/5/4/3 — ver product-grid.tsx). Com 20, a última
 * fileira ficava pela metade em 8 e em 6 colunas.
 */
export const PUBLIC_PAGE_SIZE = 24;

export async function queryPublicProducts(
  supabase: SupabaseClient<Database>,
  storeId: string,
  params: QueryPublicProductsParams,
  storeHideSoldOutDefault: boolean
): Promise<QueryPublicProductsResult> {
  const page = params.page && params.page > 0 ? params.page : 1;
  const from = (page - 1) * PUBLIC_PAGE_SIZE;
  const to = from + PUBLIC_PAGE_SIZE; // fetch PUBLIC_PAGE_SIZE + 1 rows (Open Question 3)

  let query = supabase
    .from("products")
    .select("id, name, brand, brand_other, line, price, promotional_price, hide_when_sold_out")
    .eq("store_id", storeId)
    .eq("status", "published"); // fixo — nunca vindo de params/searchParams

  const validBrands = (params.brand ?? []).filter((value) => VALID_BRANDS.has(value));
  if (validBrands.length > 0) {
    query = query.in("brand", validBrands);
  }

  const validSoles = (params.sole ?? []).filter((value) => VALID_SOLES.has(value));
  if (validSoles.length > 0) {
    query = query.in("sole", validSoles);
  }

  const expandedFulfillments = expandFulfillmentFilter(params.fulfillment ?? []);
  if (expandedFulfillments.length > 0) {
    query = query.in("fulfillment", expandedFulfillments);
  }

  if (params.q) {
    query = query.ilike("name", `%${params.q}%`);
  }

  if (params.favoriteIds && params.favoriteIds.length > 0) {
    query = query.in("id", params.favoriteIds);
  }

  // Desempate por created_at em toda ordenação de preço: dois produtos com o
  // mesmo preço teriam ordem indefinida entre páginas, o que faz um item
  // repetir ou sumir no "carregar mais".
  const sortClause = SORT_CLAUSES[resolveSort(params.sort)];
  query = query.order(sortClause.column, { ascending: sortClause.ascending });
  if (sortClause.column !== "created_at") {
    query = query.order("created_at", { ascending: false });
  }
  query = query.range(from, to);

  const { data: fetchedProducts, error } = await query;
  if (error || !fetchedProducts || fetchedProducts.length === 0) {
    return { products: [], hasMore: false };
  }

  const hasMore = fetchedProducts.length > PUBLIC_PAGE_SIZE;
  const products = hasMore ? fetchedProducts.slice(0, PUBLIC_PAGE_SIZE) : fetchedProducts;

  const productIds = products.map((product) => product.id);

  const { data: sizeRows } = await supabase
    .from("product_sizes")
    .select("product_id, available")
    .in("product_id", productIds);

  const { data: photoRows } = await supabase
    .from("product_photos")
    .select("product_id, storage_path, position")
    .in("product_id", productIds)
    .order("position", { ascending: true });

  const availableProductIds = new Set(
    (sizeRows ?? []).filter((row) => row.available).map((row) => row.product_id)
  );

  // photoRows já vem ordenado por position asc — a primeira ocorrência por
  // product_id encontrada no loop é sempre a de menor position (capa).
  const coverPathByProductId = new Map<string, string>();
  for (const photo of photoRows ?? []) {
    if (!coverPathByProductId.has(photo.product_id)) {
      coverPathByProductId.set(photo.product_id, photo.storage_path);
    }
  }

  // Filtra sobre os produtos CRUS (com hide_when_sold_out) antes de montar o
  // shape público — nunca expõe hide_when_sold_out na UI (product-card.tsx
  // nunca recebe esse campo), e a regra fica resolvida em um único lugar.
  const favoriteIdSet = new Set(params.favoriteIds ?? []);
  const visibleProducts = products.filter(
    (product) =>
      favoriteIdSet.has(product.id) ||
      isVisible(product.hide_when_sold_out, availableProductIds.has(product.id), storeHideSoldOutDefault)
  );

  const mappedProducts: PublicProduct[] = visibleProducts.map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    brand_other: product.brand_other,
    line: product.line,
    price: product.price,
    promotional_price: product.promotional_price,
    disponivel: availableProductIds.has(product.id),
    coverPath: coverPathByProductId.get(product.id) ?? null,
  }));

  return {
    products: mappedProducts,
    hasMore,
  };
}
