import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isVisible } from "@/lib/products/public-list";

/**
 * Leitura pública de detalhe de UM produto publicado (PED-01/PED-02,
 * 05-RESEARCH.md Pattern 1) — variante single-row do padrão
 * duas-queries-mais-join de `public-list.ts` (`queryPublicProducts`).
 * PARALELA à admin (`src/app/(admin)/produtos/[id]/editar/page.tsx`), NUNCA
 * importa nem modifica `src/lib/products/list.ts` (owner-scoped, autenticado)
 * — são funções paralelas, uma owner-scoped (sessão), outra pública (sem
 * sessão, role `anon` no Postgres).
 *
 * Reusa `isVisible()` (exportada de `public-list.ts`) VERBATIM em vez de
 * re-derivar a regra de esgotado — um produto oculto pela regra de
 * hide_when_sold_out (Fase 4) precisa resolver como "não encontrado" também
 * no link direto ao detalhe (Pitfall 8 — sem bypass por URL). Retorna `null`
 * para produto inexistente, não publicado (status != 'published') OU oculto
 * pela regra de esgotado — o chamador (page.tsx) trata todos os três casos
 * com `notFound()`.
 *
 * Diferente de `queryPublicProducts` (mapa agregado `disponivel: boolean` +
 * só a foto de capa), aqui o retorno expõe o mapa COMPLETO de tamanhos
 * (para as pílulas do painel de pedido, PED-02) e a galeria COMPLETA de
 * fotos (não só a capa).
 */
export type PublicProductDetail = {
  id: string;
  name: string;
  brand: string;
  brand_other: string | null;
  line: string | null;
  sole: string | null;
  price: number;
  /** Preço promocional (gatilho de conversão, `PriceDisplay`) — `null` sem
   * promoção ativa. */
  promotional_price: number | null;
  sizes: { size: number; available: boolean }[];
  photos: { id: string; storage_path: string }[];
};

export async function queryPublicProductDetail(
  supabase: SupabaseClient<Database>,
  storeId: string,
  productId: string,
  storeHideSoldOutDefault: boolean
): Promise<PublicProductDetail | null> {
  const { data: product, error } = await supabase
    .from("products")
    .select("id, name, brand, brand_other, line, sole, price, promotional_price, hide_when_sold_out")
    .eq("id", productId)
    .eq("store_id", storeId)
    .eq("status", "published") // fixo — mesma disciplina de queryPublicProducts
    .single();

  if (error || !product) {
    return null;
  }

  const { data: sizeRows } = await supabase
    .from("product_sizes")
    .select("size, available")
    .eq("product_id", productId)
    .order("size", { ascending: true });

  const { data: photoRows } = await supabase
    .from("product_photos")
    .select("id, storage_path")
    .eq("product_id", productId)
    .order("position", { ascending: true });

  const sizes = sizeRows ?? [];
  const photos = photoRows ?? [];

  const disponivel = sizes.some((row) => row.available);

  if (!isVisible(product.hide_when_sold_out, disponivel, storeHideSoldOutDefault)) {
    // Produto publicado, porém oculto pela regra de esgotado — resolve como
    // "não encontrado", nunca vazando a existência do produto via link direto.
    return null;
  }

  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    brand_other: product.brand_other,
    line: product.line,
    sole: product.sole,
    price: product.price,
    promotional_price: product.promotional_price,
    sizes,
    photos,
  };
}
