import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ChevronLeft, Layers } from "lucide-react";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding-guard";
import { createClient } from "@/lib/supabase/server";
import { queryRecentActivity, HEADER_FEED_LIMIT } from "@/lib/dashboard/metrics";
import { queryPackPrincipal } from "@/lib/marketplace/packs";
import { HeaderActions } from "@/components/header-actions";
import { EmptyState } from "@/components/empty-state";

/**
 * Rota `/admin/marketplace/albuns` — os álbuns do pack.
 *
 * Separada da tela principal a pedido do dono: lá o card do pack é a peça de
 * VENDA e precisa do preço e do CTA sem concorrência visual. Os álbuns são
 * navegação de quem já quer olhar o conteúdo, e viram um passo próprio.
 */
export default async function AlbunsPage() {
  await requireCompletedOnboarding();

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", userData.user!.id)
    .single();

  if (!store) redirect("/admin/onboarding");

  const [pack, headerFeed] = await Promise.all([
    queryPackPrincipal(supabase),
    queryRecentActivity(supabase, store.id, HEADER_FEED_LIMIT),
  ]);

  const urlDe = (caminho: string | null) =>
    caminho
      ? supabase.storage.from("marketplace-assets").getPublicUrl(caminho).data.publicUrl
      : null;

  return (
    <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          {/*
            O VOLTAR FICA AO LADO DO TÍTULO, não acima dele. Empilhado, ele era a
            primeira coisa lida na página e empurrava o título para baixo — a
            navegação ganhava a posição de destaque que pertence ao assunto da tela.
            Na mesma linha, o título abre a página e o voltar vira o que sempre foi:
            uma saída, disponível sem disputar a atenção.

            `flex-wrap` porque numa tela estreita os dois podem não caber; nesse caso
            o voltar desce, em vez de espremer o título.
          */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">
              Álbuns
            </h1>
            <Link
              href="/admin/marketplace"
              className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-gray-500 transition-colors duration-150 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Voltar
            </Link>
          </div>
          {/* Texto fixo, não contador: o total já aparece card a card logo abaixo,
              e repetido no topo ele só competia com as fotos. Mesma remoção feita
              no cabeçalho de /admin/marketplace.

              "marca E ESTILO", não só marca: o álbum Retrô é recorte por estilo,
              e Futsal, Society e Infantil já estão previstos
              (docs/marketplace/02-RESPOSTAS.md). Encurtar para "por marca" volta
              a mentir a partir do oitavo card. */}
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {pack ? "Explore o pacote por marca e estilo" : ""}
          </p>
        </div>
        <HeaderActions activityFeed={headerFeed.items} />
      </div>

      <div className="flex w-full flex-col gap-4 2xl:max-w-[96rem]">
        {!pack || pack.albums.length === 0 ? (
          <EmptyState
            title="Nenhum álbum por aqui"
            description="Este pacote ainda não tem álbuns organizados."
          />
        ) : (
          <>
            <div className="flex justify-end">
              <Link
                href="/admin/marketplace/tudo"
                className="text-sm font-semibold text-primary transition-opacity duration-150 hover:opacity-80 dark:text-blue-300"
              >
                Ver todas as chuteiras
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {pack.albums.map((album) => (
                <Link
                  key={album.id}
                  href={`/admin/marketplace/tudo?album=${album.id}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-colors duration-150 hover:border-primary dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-400/50"
                >
                  <div className="relative aspect-square bg-gray-100 dark:bg-gray-800">
                    {urlDe(album.coverPath) ? (
                      <Image
                        src={urlDe(album.coverPath)!}
                        alt=""
                        fill
                        sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                        className="object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-gray-300 dark:text-gray-600">
                        <Layers className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                      {album.name}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {album.total} {album.total === 1 ? "chuteira" : "chuteiras"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
