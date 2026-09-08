import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding-guard";
import { createClient } from "@/lib/supabase/server";
import { queryRecentActivity, HEADER_FEED_LIMIT } from "@/lib/dashboard/metrics";
import { queryPackPrincipal } from "@/lib/marketplace/packs";
import { queryAmostraSorteada } from "@/lib/marketplace/amostra";
import { HeaderActions } from "@/components/header-actions";
import { EmptyState } from "@/components/empty-state";
import { PackHero, PRECO_ANCORA } from "./pack-hero";

/**
 * Rota `/admin/marketplace` — a vitrine do PACOTE.
 *
 * A tela é de venda, não de navegação: preço, o que vem dentro, comprar e testar.
 * Os álbuns mudaram para `/admin/marketplace/albuns` a pedido do dono — com eles
 * aqui, o card do pacote virava um cabeçalho de galeria e o preço competia com
 * uma parede de fotos.
 */
export default async function MarketplacePage() {
  await requireCompletedOnboarding();

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, marketplace_access")
    .eq("owner_id", userData.user!.id)
    .single();

  if (!store) redirect("/admin/onboarding");

  const [pack, headerFeed, { data: importados }, sorteadas] = await Promise.all([
    queryPackPrincipal(supabase),
    queryRecentActivity(supabase, store.id, HEADER_FEED_LIMIT),
    /*
      SEM o filtro de "produto ainda existe".

      Apagar um produto zera o vínculo da linha de importação, mas a linha fica (a migration
      0021 preserva o histórico de propósito). Filtrando por produto vivo, a tela concluía
      que a vaga do sorteio tinha voltado: quem resgatou as 10 e apagou duas era convidado a
      resgatar de novo. A pergunta certa não é "quantas ainda estão na loja", é "o que já foi
      resgatado alguma vez".
    */
    supabase
      .from("marketplace_imports")
      .select("marketplace_product_id")
      .eq("store_id", store.id),
    // O sorteio vem do banco (migration 0029) e é gravado na primeira leitura:
    // a mesma loja vê sempre as mesmas 10, e é essa lista que o trigger de quota
    // usa para autorizar a importação. Sortear aqui em JavaScript deixaria a
    // animação bonita e a regra sem dono.
    queryAmostraSorteada(supabase),
  ]);

  const jaImportados = new Set((importados ?? []).map((i) => i.marketplace_product_id));
  // As 10 do sorteio já foram todas resgatadas? É o que decide se o cartão ainda oferece algo.
  const jaResgatouTudo = sorteadas.length > 0 && sorteadas.every((item) => jaImportados.has(item.id));

  const amostra = sorteadas.map((item) => ({
    id: item.id,
    name: item.name,
    suggestedPrice: item.suggestedPrice,
    sizeMin: item.sizeMin,
    sizeMax: item.sizeMax,
    fotoUrl: item.photoPaths[0]
      ? supabase.storage.from("marketplace-assets").getPublicUrl(item.photoPaths[0]).data.publicUrl
      : null,
    jaImportado: jaImportados.has(item.id),
  }));

  const urlDe = (caminho: string | null) =>
    caminho
      ? supabase.storage.from("marketplace-assets").getPublicUrl(caminho).data.publicUrl
      : null;

  return (
    <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            Marketplace
          </h1>
          {/* Sem a contagem de importados aqui: o card do pacote logo abaixo já
              mostra "N modelos já adicionados", e o mesmo número em dois lugares
              na mesma dobra só divide a atenção. */}
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Recursos prontos para sua loja
          </p>
        </div>
        <HeaderActions activityFeed={headerFeed.items} />
      </div>

      <div className="flex w-full flex-col gap-5 2xl:max-w-[96rem]">
        {/* A busca é da ROTA, não do pacote: fica acima do card porque quem já
            sabe o modelo que quer não deveria precisar ler a oferta inteira
            nem entrar nos álbuns antes de procurar. */}
        <form action="/admin/marketplace/tudo" className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-1.5 transition-colors duration-150 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:focus-within:ring-blue-400/20">
            <Search
              className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              placeholder="Buscar por pacotes, modelos ou marcas"
              aria-label="Buscar por pacotes, modelos ou marcas"
              className="min-h-9 w-full bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-50 dark:placeholder:text-gray-600"
            />
          </div>
        </form>
        {!pack ? (
          <EmptyState
            title="Nenhum pacote disponível"
            description="Ainda não há pacotes de chuteiras publicados por aqui."
          />
        ) : (
          <PackHero
            nome={pack.name}
            descricao={pack.description}
            preco={pack.price}
            precoAncora={PRECO_ANCORA}
            capaUrl={urlDe(pack.coverPath)}
            totalProdutos={pack.totalProdutos}
            temAcesso={Boolean(store.marketplace_access)}
            jaResgatouTudo={jaResgatouTudo}
            nomeLoja={store.name}
            storeId={store.id}
            amostra={amostra}
          />
        )}
      </div>
    </div>
  );
}
