import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getProductImagePublicUrl } from "@/lib/storage/product-image-url";

/**
 * Leitura pública de produtos FAVORITADOS (ids vindos do `localStorage` do
 * comprador via `?ids=` na URL — ver favorites-store.ts/favorites-view.tsx),
 * variante da família `public-list.ts`/`public-detail.ts`: `status` sempre
 * fixo 'published', `store_id` sempre travado no dono da vitrine (um id de
 * outra loja colado na URL nunca vaza produto alheio).
 *
 * DELIBERADAMENTE NÃO aplica `isVisible()`/a regra de esgotado (diferença
 * do resto da vitrine, decisão do usuário): um favorito que ficou sem
 * estoque continua aparecendo — só com os tamanhos marcados indisponíveis —
 * em vez de sumir sem explicação, que é justamente a dor que a aba
 * Favoritos existe pra resolver (D3 do documento de contexto). Produto
 * excluído ou virado rascunho, esse sim, desaparece (não existe mais linha
 * `published` pra casar o id).
 */
export type PublicFavoriteProduct = {
  id: string;
  name: string;
  line: string | null;
  sole: string | null;
  price: number;
  sizes: { size: number; available: boolean }[];
  coverUrl: string | null;
};

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

export async function queryFavoriteProducts(
  supabase: SupabaseClient<Database>,
  storeId: string,
  ids: string[]
): Promise<PublicFavoriteProduct[]> {
  if (ids.length === 0) return [];

  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, line, sole, price")
    .eq("store_id", storeId)
    .eq("status", "published") // fixo — mesma disciplina de queryPublicProducts
    .in("id", ids);

  if (error || !products || products.length === 0) return [];

  const foundIds = products.map((product) => product.id);

  const [{ data: sizeRows }, { data: photoRows }] = await Promise.all([
    supabase.from("product_sizes").select("product_id, size, available").in("product_id", foundIds).order("size", { ascending: true }),
    supabase.from("product_photos").select("product_id, storage_path, position").in("product_id", foundIds).order("position", { ascending: true }),
  ]);

  const sizesByProductId = new Map<string, { size: number; available: boolean }[]>();
  for (const row of sizeRows ?? []) {
    const list = sizesByProductId.get(row.product_id) ?? [];
    list.push({ size: row.size, available: row.available });
    sizesByProductId.set(row.product_id, list);
  }

  // photoRows já vem ordenado por position asc — a primeira ocorrência por
  // product_id encontrada no loop é sempre a de menor position (capa), mesma
  // técnica de queryPublicProducts.
  const coverPathByProductId = new Map<string, string>();
  for (const photo of photoRows ?? []) {
    if (!coverPathByProductId.has(photo.product_id)) {
      coverPathByProductId.set(photo.product_id, photo.storage_path);
    }
  }

  const productById = new Map(products.map((product) => [product.id, product]));

  // Preserva a ORDEM de `ids` (= ordem em que o comprador favoritou, mais
  // antigo primeiro — ver favorites-store.ts), não a ordem que o Postgres
  // devolveu. Ids sem produto correspondente (excluído/virou rascunho) são
  // silenciosamente pulados.
  return ids.reduce<PublicFavoriteProduct[]>((acc, id) => {
    const product = productById.get(id);
    if (!product) return acc;

    const coverPath = coverPathByProductId.get(id) ?? null;
    acc.push({
      id: product.id,
      name: product.name,
      line: product.line,
      sole: product.sole,
      price: product.price,
      sizes: sizesByProductId.get(id) ?? [],
      coverUrl: coverPath ? getProductImagePublicUrl(supabase, coverPath) : null,
    });
    return acc;
  }, []);
}
