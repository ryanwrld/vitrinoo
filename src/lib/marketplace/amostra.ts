import type { SupabaseClient } from "@supabase/supabase-js";
import { queryMarketplaceProducts, type MarketplaceProduct } from "@/lib/marketplace/list";

/**
 * As 10 chuteiras sorteadas para a loja testar de graça.
 *
 * O SORTEIO VIVE NO BANCO (migration 0029), não aqui. Uma versão anterior fazia
 * o sorteio em JavaScript, com um hash determinístico do id da loja, e o
 * resultado nunca era gravado — o que tinha duas consequências ruins:
 *
 *   1. nenhuma camada conseguia validar QUAIS itens a loja podia importar,
 *      porque "as 10 sorteadas" não existiam como fato em lugar nenhum. Na
 *      prática o direito era "10 quaisquer entre as ~100 do preview", e o grid
 *      de /admin/marketplace/tudo oferecia checkbox para escolher a dedo — o
 *      oposto da decisão de produto (docs/marketplace/02-RESPOSTAS.md, D-amostra);
 *   2. mexer no pool `preview` mudava, em silêncio, a amostra de quem já estava
 *      decidindo.
 *
 * Agora a função `sortear_amostra_da_loja()` sorteia uma vez, grava e nunca
 * refaz. Este arquivo só lê o que ela gravou e junta os dados de exibição.
 */

/**
 * Tamanho da amostra gratuita.
 *
 * FONTE ÚNICA NO LADO DO APP — o mesmo número existe em três lugares do banco
 * (trigger de quota na 0025, `sortear_amostra_da_loja` e
 * `importar_marketplace_em_lote` na 0029), onde um `constant` de plpgsql não tem
 * como ser lido daqui. Mudar a regra exige mudar os quatro.
 */
export const TAMANHO_AMOSTRA = 10;

export type ItemSorteado = MarketplaceProduct & { posicao: number };

/**
 * Lê a amostra sorteada desta loja, materializando o sorteio se for a primeira
 * vez. Devolve na ordem em que os itens saíram.
 */
export async function queryAmostraSorteada(
  supabase: SupabaseClient,
): Promise<ItemSorteado[]> {
  const { data: sorteio, error } = await supabase.rpc("sortear_amostra_da_loja");

  if (error || !sorteio?.length) return [];

  const posicaoDe = new Map<string, number>(
    (sorteio as Array<{ produto_id: string; posicao: number }>).map((s) => [
      s.produto_id,
      s.posicao,
    ]),
  );

  // Os dados de exibição vêm pelo mesmo caminho do resto da tela, com a mesma
  // RLS: o sorteio devolve ids, não fichas. Se um item sorteado for despublicado
  // depois, ele simplesmente não volta aqui — melhor sumir da amostra do que
  // aparecer um card quebrado.
  const { items } = await queryMarketplaceProducts(supabase, {
    ids: [...posicaoDe.keys()],
    page: 1,
  });

  return items
    .map((item) => ({ ...item, posicao: posicaoDe.get(item.id) ?? 0 }))
    .sort((a, b) => a.posicao - b.posicao);
}

/** Só os ids, para as telas que precisam apenas saber o que está na amostra. */
export async function queryIdsDaAmostra(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase.rpc("sortear_amostra_da_loja");
  return new Set(
    ((data ?? []) as Array<{ produto_id: string }>).map((s) => s.produto_id),
  );
}
