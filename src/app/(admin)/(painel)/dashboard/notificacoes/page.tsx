import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ChevronLeft, ChevronRight, Eye, MessageCircle } from "lucide-react";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding-guard";
import { createClient } from "@/lib/supabase/server";
import { queryRecentActivity, type ActivityFeedItem } from "@/lib/dashboard/metrics";
import { formatRelativeTime } from "@/lib/dashboard/format-relative-time";
import { HeaderActions } from "@/components/header-actions";

/**
 * Histórico completo de atividade — a "escape valve" do sino no cabeçalho
 * do painel (HeaderActions/AdminSidebar). O feed embutido no dashboard tem
 * teto de propósito (MAX_FEED_LIMIT, ver dashboard/page.tsx) porque o
 * dashboard é atalho de acesso rápido, não histórico; quem quiser
 * vasculhar tudo vem pra cá — página própria, paginação real por offset
 * (não "carregar mais" crescendo o mesmo request), sem disputar layout
 * com os outros widgets.
 */
const PAGE_SIZE = 20;

function parsePage(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export default async function AtividadePage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  await requireCompletedOnboarding();

  const params = await searchParams;
  const pagina = parsePage(params.pagina);
  const offset = (pagina - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", userData.user!.id)
    .single();

  if (!store) {
    redirect("/onboarding");
  }

  const feed = await queryRecentActivity(supabase, store.id, PAGE_SIZE, offset);
  const feedIcon = (item: ActivityFeedItem) => (item.type === "click" ? MessageCircle : Eye);

  // Controla se o card de fundo estica e centraliza o conteúdo (comportamento
  // "vitrine vazia") ou se encolhe e alinha no topo (comportamento "lista
  // normal"). Sem essa distinção, uma página real com poucos itens sobrando
  // (ex: a última página de paginação) ficava flutuando no meio do card
  // como se fosse o aviso de conta nova — mesmo tendo notificações de
  // verdade pra mostrar.
  const isEmpty = feed.items.length === 0;

  return (
    // Padding igual ao Dashboard (py-6/lg:py-8, não o py-8/lg:py-10 do resto
    // do painel) — esta é a única página que "volta pra Dashboard", então o
    // topo dela precisa alinhar visualmente com o Dashboard, não com as
    // outras páginas do painel (Produtos/Configurações).
    //
    // flex-1: o `<main>` do layout do painel usa `justify-center` (empurra
    // conteúdo mais baixo que a tela pro meio — pensado pra formulários
    // curtos). `flex-1` faz este bloco ocupar toda a altura disponível do
    // `<main>`, prendendo o CABEÇALHO no topo, independente do estado do
    // conteúdo abaixo dele (lista real ou vazio) — ver `isEmpty` no <section>
    // logo abaixo pra saber quando ELE estica/centraliza ou não.
    <div className="flex w-full flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      {/* Padrão oficial pra qualquer página futura com "voltar pra X": título
          e o link de voltar ficam juntos, na MESMA linha, alinhados com os
          ícones do cabeçalho (sino/tema/avatar) — nunca o link de voltar
          empilhado sozinho acima do título, que empurra tudo pra baixo e
          desalinha os ícones em relação a outras páginas do painel. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">Notificações</h1>
          <Link href="/dashboard" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Dashboard
          </Link>
        </div>
        <HeaderActions />
      </div>

      <section
        className={`flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 ${
          isEmpty ? "flex-1 justify-center" : ""
        }`}
      >
        {feed.items.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {feed.items.map((item, index) => {
              const Icon = feedIcon(item);
              return (
                <li key={`${item.type}-${item.productId}-${item.createdAt}-${index}`} className="flex items-start gap-3 border-b border-gray-100 py-2 last:border-none dark:border-gray-800">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      item.type === "click"
                        ? "bg-success-bg text-success-fg dark:bg-success-solid/15"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {item.type === "click" ? (
                      <>
                        Alguém clicou em <b className="font-semibold text-gray-900 dark:text-gray-50">&quot;Pedir agora&quot;</b> — {item.productName}
                      </>
                    ) : (
                      <>
                        <b className="font-semibold text-gray-900 dark:text-gray-50">{item.count} visualizaç{item.count > 1 ? "ões" : "ão"}</b> nova{item.count > 1 ? "s" : ""} — {item.productName}
                      </>
                    )}
                    <span className="block text-xs text-gray-400 dark:text-gray-500">{formatRelativeTime(item.createdAt)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : pagina === 1 ? (
          // Usuário novo, zero histórico — o momento mais comum de cair aqui é
          // logo depois do onboarding, sem nenhuma visita/pedido ainda. Em vez
          // do aviso pequeno de sempre, isso ocupa espaço de verdade (a página
          // toda é só isso), com tom de início de jornada — sem CTA aqui: o
          // "Movimento parado" do dashboard já cobre a ação de compartilhar;
          // esta página é o registro histórico, não o lugar de agir.
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-300 px-6 py-16 text-center dark:border-gray-700">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-subtle text-primary dark:bg-blue-400/15 dark:text-blue-300">
              <Bell className="h-8 w-8" aria-hidden="true" />
            </span>
            <span className="font-display text-xl font-bold text-gray-900 dark:text-gray-50">Sua jornada por aqui está só começando</span>
            <span className="max-w-md text-sm text-gray-500 dark:text-gray-400">
              Toda visita e todo pedido da sua vitrine
              <br className="lg:hidden" /> vão aparecer nesta página,
              <br />o primeiro está a caminho.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1 rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center dark:border-gray-700">
            <span className="font-medium text-gray-900 dark:text-gray-50">Nada por aqui</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">Essa página não tem mais itens.</span>
          </div>
        )}

        {(pagina > 1 || feed.hasMore) && (
          <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-sm font-semibold dark:border-gray-800">
            {pagina > 1 ? (
              <Link href={`/dashboard/notificacoes?pagina=${pagina - 1}`} className="flex items-center gap-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
              </Link>
            ) : (
              <span />
            )}
            {feed.hasMore && (
              <Link href={`/dashboard/notificacoes?pagina=${pagina + 1}`} className="flex items-center gap-1 text-primary dark:text-blue-300">
                Próxima <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
