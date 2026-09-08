import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Busca/filtro/ordenação de produtos no painel (PROD-06, 03-RESEARCH.md
 * Pattern 3). Função pura server-side — recebe o `supabase` já autenticado
 * do chamador (nunca cria client novo, mesma disciplina de
 * `deleteProductPhotosStorage`), para ser testável diretamente fora do
 * Server Component (`tests/products/list-filter-sort.test.ts`).
 *
 * `store_id` é sempre passado explicitamente e aplicado via `.eq(...)`
 * (T-03-13, defesa em profundidade) — a RLS de `products`
 * (`owner_full_access_products`) é a rede final que garante que o `storeId`
 * passado só pode pertencer ao dono autenticado; um `storeId` de outra loja
 * simplesmente retorna `[]`, nunca vaza dados nem lança erro.
 */
export type QueryProductsParams = {
  q?: string;
  status?: string;
  brand?: string;
  sole?: string;
  sort?: string;
  /** Página 1-based. OPCIONAL de propósito: o Dashboard chama `queryProducts` sem página
   *  para contar disponíveis/esgotados sobre o catálogo INTEIRO — paginar por padrão faria
   *  ele contar só a primeira fatia e mostrar número errado. */
  page?: number;
};

export type QueriedProduct = {
  id: string;
  name: string;
  brand: string;
  brand_other: string | null;
  line: string | null;
  price: number;
  /** Preço promocional (gatilho de conversão na vitrine pública) — `null`
   * quando o produto não tem promoção ativa. Editável inline via
   * `updateProductPromotionalPrice`, ver `product-list.tsx`. */
  promotional_price: number | null;
  status: string;
  /** Disponibilidade derivada: EXISTS sobre product_sizes.available=true
   * (03-RESEARCH.md Pattern 1) — cobre de graça o rascunho sem tamanhos
   * (D-10): sem linhas em product_sizes, o produto já nasce "esgotado". */
  disponivel: boolean;
  /** storage_path da foto de posição mais baixa (posição 0 = capa, D-11),
   * ou null quando o produto não tem nenhuma foto ainda. */
  coverPath: string | null;
  /** Origem da capa: decide de qual bucket a URL é montada. */
  coverSource: string | null;
};

/**
 * Produtos por página no painel. Espelha `MARKETPLACE_PAGE_SIZE`
 * (src/lib/marketplace/list.ts): as duas telas do painel que listam catálogo grande andam
 * no mesmo ritmo.
 */
export const PRODUTOS_POR_PAGINA = 48;

/**
 * Os filtros da listagem, em UM lugar só.
 *
 * Três consumidores dependem de responder exatamente ao mesmo conjunto: a listagem, a
 * contagem que alimenta a paginação e as ações em massa "por filtro" (actions.ts). Se a
 * regra fosse reescrita em cada um, bastaria um esquecer um filtro para a barra dizer
 * "990 selecionados" e a ação mexer em outro conjunto — o pior tipo de bug possível numa
 * ação destrutiva.
 */
type ConsultaFiltravel = {
  ilike(coluna: string, padrao: string): ConsultaFiltravel;
  eq(coluna: string, valor: string): ConsultaFiltravel;
};

export function aplicarFiltrosDeProduto<Q extends ConsultaFiltravel>(
  query: Q,
  params: Pick<QueryProductsParams, "q" | "status" | "brand" | "sole">,
): Q {
  let q = query;
  if (params.q) q = q.ilike("name", `%${params.q}%`) as Q;
  if (params.status) q = q.eq("status", params.status) as Q;
  if (params.brand) q = q.eq("brand", params.brand) as Q;
  if (params.sole) q = q.eq("sole", params.sole) as Q;
  return q;
}

/** Quantos produtos casam com o filtro atual — o total que a paginação divide em páginas. */
export async function contarProdutos(
  supabase: SupabaseClient<Database>,
  storeId: string,
  params: Pick<QueryProductsParams, "q" | "status" | "brand" | "sole">,
): Promise<number> {
  const query = aplicarFiltrosDeProduto(
    supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", storeId),
    params,
  );
  const { count } = await query;
  return count ?? 0;
}

const SORT_COLUMNS: Record<string, { column: "created_at" | "name" | "price"; ascending: boolean }> = {
  recente: { column: "created_at", ascending: false },
  nome: { column: "name", ascending: true },
  preco: { column: "price", ascending: true },
};

/**
 * `queryProducts` faz duas queries separadas (produtos filtrados/ordenados,
 * depois `product_sizes`/`product_photos` em lote via `.in("product_id",
 * ids)`) e junta em memória — mesmo padrão de duas-queries-separadas já
 * estabelecido em `/admin/produtos/[id]/editar/page.tsx` (em vez do embed
 * `product_sizes(available)` sugerido como esboço em 03-RESEARCH.md Pattern
 * 3), escolhido por: (1) tipagem mais simples/segura do retorno do
 * Supabase client tipado, sem lidar com o shape aninhado de embeds; (2)
 * consistência direta com o único precedente já escrito neste codebase.
 */
export async function queryProducts(
  supabase: SupabaseClient<Database>,
  storeId: string,
  params: QueryProductsParams
): Promise<QueriedProduct[]> {
  let query = aplicarFiltrosDeProduto(
    supabase
      .from("products")
      .select("id, name, brand, brand_other, line, price, promotional_price, status")
      .eq("store_id", storeId),
    params,
  );

  const sortConfig = SORT_COLUMNS[params.sort ?? "recente"] ?? SORT_COLUMNS.recente;
  query = query.order(sortConfig.column, { ascending: sortConfig.ascending });

  if (params.page && params.page > 0) {
    const de = (params.page - 1) * PRODUTOS_POR_PAGINA;
    query = query.range(de, de + PRODUTOS_POR_PAGINA - 1);
  }

  const { data: products, error } = await query;
  if (error || !products || products.length === 0) {
    return [];
  }

  const productIds = products.map((product) => product.id);

  /*
    EM BLOCOS, não de uma vez: esta lista NÃO é paginada (a vitrine pública é, ver
    public-list.ts), então numa loja que importou o pacote inteiro `productIds` chega com
    990 itens. O PostgREST recebe os ids na query string — a URL passava de 35KB e o
    gateway devolvia 400, deixando `sizeRows`/`photoRows` vazios: TODO produto aparecia
    como "Esgotado" e sem foto de capa. Cada bloco também mantém a resposta abaixo do teto
    de 1000 linhas por requisição (150 produtos = no máximo 750 fotos e ~1200 tamanhos, por
    isso os tamanhos vão em blocos menores).
  */
  const emBlocos = <T,>(itens: T[], tamanho: number): T[][] => {
    const blocos: T[][] = [];
    for (let i = 0; i < itens.length; i += tamanho) blocos.push(itens.slice(i, i + tamanho));
    return blocos;
  };

  const sizeRows: { product_id: string; available: boolean }[] = [];
  for (const bloco of emBlocos(productIds, 80)) {
    const { data } = await supabase
      .from("product_sizes")
      .select("product_id, available")
      .in("product_id", bloco);
    if (data) sizeRows.push(...data);
  }

  const photoRows: { product_id: string; storage_path: string; position: number; source: string | null }[] = [];
  for (const bloco of emBlocos(productIds, 150)) {
    const { data } = await supabase
      .from("product_photos")
      .select("product_id, storage_path, position, source")
      .in("product_id", bloco)
      .order("position", { ascending: true });
    if (data) photoRows.push(...data);
  }

  const availableProductIds = new Set(
    sizeRows.filter((row) => row.available).map((row) => row.product_id)
  );

  // photoRows já vem ordenado por position asc — a primeira ocorrência por
  // product_id encontrada no loop é sempre a de menor position (capa, D-11).
  const coverPathByProductId = new Map<string, string>();
  const coverSourceByProductId = new Map<string, string>();
  for (const photo of photoRows) {
    if (!coverPathByProductId.has(photo.product_id)) {
      coverPathByProductId.set(photo.product_id, photo.storage_path);
      coverSourceByProductId.set(photo.product_id, photo.source ?? "own");
    }
  }

  return products.map((product) => ({
    ...product,
    disponivel: availableProductIds.has(product.id),
    coverSource: coverSourceByProductId.get(product.id) ?? null,
    coverPath: coverPathByProductId.get(product.id) ?? null,
  }));
}
