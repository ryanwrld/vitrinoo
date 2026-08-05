"use server";

import { createClient } from "@/lib/supabase/server";
import { queryPublicProducts, type QueryPublicProductsParams } from "@/lib/products/public-list";
import type { PublicProductCardData } from "@/app/[slug]/product-card";

/**
 * Server Actions PÚBLICAS/ANÔNIMAS da vitrine — arquivo deliberadamente
 * SEPARADO de src/lib/products/actions.ts (owner-scoped, autenticado). Esta
 * divergência do 04-PATTERNS.md (que sugeria adicionar `fetchNextPage` a
 * `actions.ts`) é uma decisão do executor: misturar uma Server Action
 * pública (sem `getOwnedStore()`) no mesmo módulo que ações autenticadas do
 * dono cria risco de copy-paste acidental do padrão `getOwnedStore()` num
 * caminho de código público — separação de responsabilidades de segurança.
 *
 * NUNCA importar/chamar `getOwnedStore()` neste arquivo.
 */

export type FetchNextPageResult = { error: string } | { products: PublicProductCardData[]; hasMore: boolean };

/**
 * "Carregar mais" (D-05/D-07) — chamada pelo LoadMoreButton (Client
 * Component). Resolve a loja pelo `slug` público (mesma superfície de
 * entrada de page.tsx — NUNCA aceita um `storeId` direto do cliente, T-04-09)
 * e delega para `queryPublicProducts`, a mesma função usada pelo Server
 * Component inicial — nunca uma segunda implementação de paginação
 * divergente (04-RESEARCH.md Pitfall 3).
 *
 * Resolve `coverPath` -> `coverUrl` aqui (só disponível no servidor, via
 * `supabase.storage.getPublicUrl`) — o Client Component chamador não pode
 * fazer essa resolução, então o produto já chega pronto para renderizar
 * (mesmo mapeamento de page.tsx, nunca duplicado de forma divergente).
 */
export async function fetchNextPage(
  slug: string,
  params: Omit<QueryPublicProductsParams, "page">,
  page: number
): Promise<FetchNextPageResult> {
  const supabase = await createClient();

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, hide_sold_out_default")
    .eq("slug", slug)
    .single();

  if (storeError || !store) {
    return { error: "Loja não encontrada." };
  }

  const { products, hasMore } = await queryPublicProducts(
    supabase,
    store.id,
    { ...params, page },
    store.hide_sold_out_default
  );

  const productsWithCoverUrl: PublicProductCardData[] = products.map((product) => ({
    ...product,
    coverUrl: product.coverPath
      ? supabase.storage.from("product-images").getPublicUrl(product.coverPath).data.publicUrl
      : null,
  }));

  return { products: productsWithCoverUrl, hasMore };
}
