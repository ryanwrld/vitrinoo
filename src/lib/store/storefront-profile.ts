import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { buildBrandFacets, type BrandFacet } from "@/lib/products/public-facets";
import { isVisible } from "@/lib/products/public-list";

/**
 * Dados do CARTÃO DE PERFIL da vitrine: as marcas do filtro e os três
 * números exibidos abaixo da bio.
 *
 * POR QUE UMA CONSULTA SÓ
 *
 * As marcas do filtro e as estatísticas do cartão precisam exatamente da
 * mesma linha de `products` — marca, preço, visibilidade. Consultar duas
 * vezes seria pagar a leitura do catálogo em dobro numa rota que
 * deliberadamente NÃO tem cache (o estoque precisa refletir o painel em
 * segundos). Esta função substitui `queryBrandFacets` na página: uma leitura
 * onde antes havia uma, agora com três números a mais de graça.
 *
 * OS NÚMEROS SÃO SOBRE O QUE O CLIENTE REALMENTE VÊ
 *
 * `modelCount` e `minPrice` passam pela MESMA regra de visibilidade do grid
 * (`isVisible`, a única fonte dessa decisão). Contar publicados crus diria
 * "38 modelos" numa vitrine que mostra 28 porque dez estão esgotados e
 * ocultos — e "a partir de R$ 180" apontando para um produto que o cliente
 * não consegue encontrar em lugar nenhum. Número que não bate com a tela é
 * pior que número nenhum: destrói justamente a confiança que o cartão existe
 * para construir.
 *
 * `lastUpdatedAt`, ao contrário, olha TODOS os publicados. Ele responde "esta
 * loja está viva?", e mexer num produto que hoje está esgotado é trabalho de
 * catálogo igual — na verdade é o mais comum, já que marcar tamanho esgotado
 * é a edição do dia a dia.
 */
export type StorefrontProfile = {
  brandFacets: BrandFacet[];
  /** Modelos que o cliente consegue ver de fato. */
  modelCount: number;
  /** Menor preço entre os visíveis, em reais. `null` quando não há nenhum. */
  minPrice: number | null;
  /** ISO da última alteração em qualquer produto publicado. */
  lastUpdatedAt: string | null;
};

export const EMPTY_PROFILE: StorefrontProfile = {
  brandFacets: [],
  modelCount: 0,
  minPrice: null,
  lastUpdatedAt: null,
};

export async function queryStorefrontProfile(
  supabase: SupabaseClient<Database>,
  storeId: string,
  storeHideSoldOutDefault: boolean
): Promise<StorefrontProfile> {
  const products = await fetchAllRows<{
    id: string;
    brand: string;
    brand_other: string | null;
    price: number;
    hide_when_sold_out: boolean | null;
    updated_at: string;
  }>((from, to) =>
    supabase
      .from("products")
      .select("id, brand, brand_other, price, hide_when_sold_out, updated_at")
      .eq("store_id", storeId)
      .eq("status", "published")
      // Ordem estável é requisito da paginação de `fetchAllRows` — sem ela uma
      // linha pode aparecer em duas páginas ou em nenhuma.
      .order("id", { ascending: true })
      .range(from, to)
  );

  if (products.length === 0) return EMPTY_PROFILE;

  const availableProductIds = new Set(
    (
      await fetchAllRows<{ product_id: string; available: boolean }>((from, to) =>
        supabase
          .from("product_sizes")
          .select("product_id, available")
          .in(
            "product_id",
            products.map((product) => product.id)
          )
          .eq("available", true)
          .order("product_id", { ascending: true })
          .range(from, to)
      )
    ).map((row) => row.product_id)
  );

  const visible = products.filter((product) =>
    isVisible(product.hide_when_sold_out, availableProductIds.has(product.id), storeHideSoldOutDefault)
  );

  // `reduce` e não `Math.min(...map)`: com catálogo grande o spread estoura o
  // limite de argumentos da chamada de função e derruba a vitrine inteira por
  // causa de um número decorativo.
  const minPrice = visible.reduce<number | null>(
    (lowest, product) => (lowest === null || product.price < lowest ? product.price : lowest),
    null
  );

  const lastUpdatedAt = products.reduce<string | null>(
    (latest, product) => (latest === null || product.updated_at > latest ? product.updated_at : latest),
    null
  );

  return {
    brandFacets: buildBrandFacets(visible),
    modelCount: visible.length,
    minPrice,
    lastUpdatedAt,
  };
}
