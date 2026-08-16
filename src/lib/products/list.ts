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
};

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
  let query = supabase
    .from("products")
    .select("id, name, brand, brand_other, line, price, promotional_price, status")
    .eq("store_id", storeId);

  if (params.q) {
    query = query.ilike("name", `%${params.q}%`);
  }
  if (params.status) {
    query = query.eq("status", params.status);
  }
  if (params.brand) {
    query = query.eq("brand", params.brand);
  }
  if (params.sole) {
    query = query.eq("sole", params.sole);
  }

  const sortConfig = SORT_COLUMNS[params.sort ?? "recente"] ?? SORT_COLUMNS.recente;
  query = query.order(sortConfig.column, { ascending: sortConfig.ascending });

  const { data: products, error } = await query;
  if (error || !products || products.length === 0) {
    return [];
  }

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
  // product_id encontrada no loop é sempre a de menor position (capa, D-11).
  const coverPathByProductId = new Map<string, string>();
  for (const photo of photoRows ?? []) {
    if (!coverPathByProductId.has(photo.product_id)) {
      coverPathByProductId.set(photo.product_id, photo.storage_path);
    }
  }

  return products.map((product) => ({
    ...product,
    disponivel: availableProductIds.has(product.id),
    coverPath: coverPathByProductId.get(product.id) ?? null,
  }));
}
