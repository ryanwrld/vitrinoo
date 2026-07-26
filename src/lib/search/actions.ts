"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Busca de produtos pra a busca global do painel. Escopada pela loja do
 * dono autenticado (mesmo padrão de getOwnedStore em settings/actions.ts —
 * o storeId nunca vem do client). `ilike` no nome (reaproveita o padrão de
 * lib/products/list.ts), limite curto, capa e disponibilidade resolvidas
 * aqui pra o card do resultado. Retorna a URL pública da capa já pronta pra
 * o client não precisar do client Supabase só pra isso.
 */
export type ProductSearchResult = {
  id: string;
  name: string;
  price: number;
  disponivel: boolean;
  coverUrl: string | null;
};

const RESULT_LIMIT = 6;

export async function searchProducts(query: string): Promise<ProductSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", userData.user.id)
    .single();
  if (!store) return [];

  const { data: products } = await supabase
    .from("products")
    .select("id, name, price")
    .eq("store_id", store.id)
    .ilike("name", `%${q}%`)
    .order("created_at", { ascending: false })
    .limit(RESULT_LIMIT);

  if (!products || products.length === 0) return [];

  const ids = products.map((product) => product.id);

  // Disponibilidade (qualquer tamanho disponível = "Disponível") e capa
  // (primeira foto por position) — mesma semântica do dashboard.
  const [{ data: sizeRows }, { data: photoRows }] = await Promise.all([
    supabase.from("product_sizes").select("product_id, available").in("product_id", ids),
    supabase
      .from("product_photos")
      .select("product_id, storage_path, position")
      .in("product_id", ids)
      .order("position", { ascending: true }),
  ]);

  const availableIds = new Set((sizeRows ?? []).filter((row) => row.available).map((row) => row.product_id));
  const coverPathByProduct = new Map<string, string>();
  for (const photo of photoRows ?? []) {
    if (!coverPathByProduct.has(photo.product_id)) {
      coverPathByProduct.set(photo.product_id, photo.storage_path);
    }
  }

  const resolveCover = (path: string | undefined) =>
    path ? supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl : null;

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    disponivel: availableIds.has(product.id),
    coverUrl: resolveCover(coverPathByProduct.get(product.id)),
  }));
}
