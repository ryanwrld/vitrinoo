import { redirect } from "next/navigation";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding-guard";
import { createClient } from "@/lib/supabase/server";
import { queryRecentActivity, HEADER_FEED_LIMIT } from "@/lib/dashboard/metrics";
import {
  queryMarketplaceProducts,
  queryMarketplaceFacets,
  MARKETPLACE_PAGE_SIZE,
  type MarketplaceSort,
} from "@/lib/marketplace/list";
import { HeaderActions } from "@/components/header-actions";
import { EmptyState } from "@/components/empty-state";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { queryNomeDoAlbum, queryIdsDoAlbum } from "@/lib/marketplace/packs";
import { MarketplaceGrid } from "./marketplace-grid";
import { MarketplaceToolbar } from "./marketplace-toolbar";

type MarketplaceSearchParams = {
  album?: string;
  q?: string;
  brand?: string;
  sole?: string;
  status?: string;
  sort?: string;
  page?: string;
};

/**
 * Rota `/admin/marketplace` — o acervo de chuteiras pré-cadastradas que o
 * revendedor compra em pacote, e que o admin do Vitrinoo cura.
 *
 * UMA TELA PARA OS DOIS PAPÉIS, não duas: o que muda entre curar e comprar são
 * as ações do card, não o layout — os dois precisam do mesmo grid de fotos com
 * os mesmos filtros. Duplicar a tela significaria manter dois grids em sincronia
 * para sempre, e o histórico deste projeto já mostra o custo disso.
 *
 * O ESCOPO DO QUE CADA UM VÊ vem da RLS, não daqui: desde a migration 0030 todo
 * revendedor autenticado enxerga o acervo publicado inteiro, e só o admin recebe
 * também rascunhos e arquivados. Esta página não filtra por permissão em lugar
 * nenhum.
 *
 * VER NÃO É PODER LEVAR. Quem não tem `marketplace_access` só importa as 10
 * sorteadas (migrations 0029/0030) — a barreira é o trigger de quota, não o que
 * a tela mostra.
 *
 * Totalmente dinâmica (nunca `"use cache"`), mesma disciplina de /admin/produtos:
 * publicar ou despublicar um item precisa aparecer no recarregamento seguinte.
 */
export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<MarketplaceSearchParams>;
}) {
  await requireCompletedOnboarding();

  const params = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  const { data: store } = await supabase
    .from("stores")
    .select("id, marketplace_access")
    .eq("owner_id", userData.user!.id)
    .single();

  if (!store) redirect("/admin/onboarding");

  // `is_marketplace_admin()` é a MESMA função que as policies usam, chamada via
  // RPC. Aqui ela decide apenas o que a interface oferece — a autorização real
  // acontece no banco, a cada update. Se esta chamada mentisse, o pior caso
  // seria mostrar botões que não funcionam, nunca conceder acesso indevido.
  const { data: ehAdmin } = await supabase.rpc("is_marketplace_admin");

  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const sort = (params.sort as MarketplaceSort) ?? "recentes";

  // Álbum vira um filtro por LISTA DE IDS, e não uma junção na query principal:
  // a ligação é muitos-para-muitos (0027), e um `inner join` no PostgREST mudaria
  // a forma do retorno e a contagem. Buscar os ids antes mantém a listagem, os
  // filtros e a paginação exatamente iguais aos da visão sem álbum.
  const [nomeAlbum, idsDoAlbum] = params.album
    ? await Promise.all([
        queryNomeDoAlbum(supabase, params.album),
        queryIdsDoAlbum(supabase, params.album),
      ])
    : [null, null];

  // O que esta loja já importou — alimenta o estado "já está na sua loja" no card.
  // Só os rastros ATIVOS (com produto vivo): se o lojista excluiu o produto, o
  // card volta a oferecer a importação.
  const importadosPromise = supabase
    .from("marketplace_imports")
    .select("marketplace_product_id, product_id")
    .eq("store_id", store.id)
    .not("product_id", "is", null);

  const [{ items, total }, facetas, headerFeed, { data: importados }] = await Promise.all([
    queryMarketplaceProducts(supabase, {
      q: params.q,
      brand: params.brand,
      sole: params.sole,
      status: params.status,
      sort,
      page,
      ids: idsDoAlbum ?? undefined,
    }),
    queryMarketplaceFacets(supabase),
    queryRecentActivity(supabase, store.id, HEADER_FEED_LIMIT),
    importadosPromise,
  ]);

  // Total do ACERVO, sem nenhum filtro. O `total` que volta da busca é o número
  // de RESULTADOS — usá-lo no cabeçalho fazia uma busca sem resultado exibir
  // "0 chuteiras no acervo", que lê como marketplace vazio em vez de filtro
  // restritivo. São duas perguntas diferentes e precisam de duas contagens.
  const { count: totalAcervo } = await supabase
    .from("marketplace_products")
    .select("id", { count: "exact", head: true });

  const jaImportados = new Set((importados ?? []).map((i) => i.marketplace_product_id));

  const comUrl = items.map((item) => ({
    ...item,
    jaImportado: jaImportados.has(item.id),
    photoUrls: item.photoPaths.map(
      (p) => supabase.storage.from("marketplace-assets").getPublicUrl(p).data.publicUrl,
    ),
  }));

  const temAcesso = Boolean(store.marketplace_access);
  const totalPaginas = Math.max(1, Math.ceil(total / MARKETPLACE_PAGE_SIZE));
  const temFiltro = Boolean(params.q || params.brand || params.sole || params.status);

  return (
    <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/marketplace"
            className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition-colors duration-150 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Voltar ao pack
          </Link>
          <h1 className="font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            {nomeAlbum ?? "Todas as chuteiras"}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {/* Sem "acervo" e sem "curadoria": palavra difícil e rótulo que não
                diz nada para quem lê. O ramo do admin sumiu porque dizia
                exatamente isto — o que ele vê a mais (rascunho, arquivada) já
                aparece na etiqueta de cada card, não precisa de aviso no topo. */}
            {nomeAlbum
              ? `${idsDoAlbum?.length ?? 0} ${idsDoAlbum?.length === 1 ? "chuteira" : "chuteiras"} neste álbum`
              : temAcesso
                ? `${totalAcervo ?? 0} ${totalAcervo === 1 ? "chuteira pronta" : "chuteiras prontas"} para a sua loja`
                : /* O número é o argumento, não contagem decorativa: ver que são
                     990 é o que produz o "estou perdendo muita coisa". */
                  `${totalAcervo ?? 0} chuteiras no pacote`}
            {jaImportados.size > 0 && ` · ${jaImportados.size} na sua loja`}
          </p>
        </div>
        <HeaderActions activityFeed={headerFeed.items} />
      </div>

      <div className="flex w-full flex-col gap-5 2xl:max-w-[96rem]">
        {!temAcesso && !ehAdmin && <AvisoPacote jaPegouAmostra={jaImportados.size > 0} />}

        <MarketplaceToolbar
          marcas={facetas.marcas}
          solados={facetas.solados}
          mostrarStatus={Boolean(ehAdmin)}
        />

        {temFiltro && comUrl.length > 0 && (
          <p className="-mb-2 text-sm text-gray-500 dark:text-gray-400">
            {total} {total === 1 ? "resultado" : "resultados"}
          </p>
        )}

        {comUrl.length === 0 ? (
          <EmptyState
            title={temFiltro ? "Nenhuma chuteira encontrada" : "Marketplace vazio"}
            description={
              temFiltro
                ? `Nenhuma das ${totalAcervo ?? 0} chuteiras bate com ${descreverFiltros(params)}. Tente remover um dos filtros.`
                : "Ainda não há chuteiras disponíveis por aqui."
            }
          />
        ) : (
          <MarketplaceGrid
            items={comUrl}
            ehAdmin={Boolean(ehAdmin)}
            pagina={page}
            totalPaginas={totalPaginas}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Descreve os filtros ativos em texto corrido. Um "nenhum resultado" que não diz
 * o que está filtrando obriga o usuário a caçar qual dos quatro campos está
 * atrapalhando — e o caso mais comum aqui é justamente a combinação impossível
 * (buscar uma marca que só existe num solado, com outro solado selecionado).
 */
function descreverFiltros(params: MarketplaceSearchParams): string {
  const partes: string[] = [];
  if (params.q) partes.push(`a busca "${params.q}"`);
  if (params.brand) partes.push(`a marca ${params.brand}`);
  if (params.sole) partes.push(`o solado ${params.sole}`);
  if (params.status) partes.push(`a situação ${params.status}`);
  if (partes.length <= 1) return partes[0] ?? "o filtro atual";
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/**
 * Aviso para quem ainda não liberou o pacote.
 *
 * Desde a migration 0030 ele NÃO está mais vendo uma amostra do acervo — vê as
 * 990. O que ele não tem é o direito de levar, e é isso que o texto precisa
 * dizer. "Catálogo" aqui é a vitrine dele, o lado do cliente final: é o uso
 * legítimo do termo, não o que foi banido para o marketplace.
 *
 * A última frase alterna: convidar para o sorteio quando ele ainda não pegou as
 * sorteadas, e sumir depois. Oferecer "experimente de graça" a quem já
 * experimentou é o tipo de frase que faz o lojista desconfiar da tela inteira.
 *
 * O texto diz TODAS ELAS DE UMA VEZ porque é assim que passou a funcionar: desde o fluxo
 * de precificação não existe mais escolher item a item nesta grade — ou o pacote inteiro,
 * ou as 10 sorteadas. Prometer escolha aqui mandaria o lojista procurar um botão que não
 * existe mais.
 */
function AvisoPacote({ jaPegouAmostra }: { jaPegouAmostra: boolean }) {
  return (
    <div className="rounded-2xl border border-primary/25 bg-primary-subtle px-4 py-3.5 dark:border-blue-400/25 dark:bg-blue-400/10">
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">
        Tudo isso entra na sua loja
      </p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        Ao liberar o pack, TODAS elas entram na sua loja de uma vez, com o preço que você definir
        por tipo de solado — prontas para os seus clientes verem e comprarem
        {jaPegouAmostra
          ? " de você."
          : ". (Você também pode experimentar de graça: 10 modelos sorteados para a sua loja.)"}
      </p>
    </div>
  );
}
