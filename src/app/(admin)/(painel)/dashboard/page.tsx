import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  ImageOff,
  MessageCircle,
  PackagePlus,
  SportShoe,
  XCircle,
} from "lucide-react";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding-guard";
import { createClient } from "@/lib/supabase/server";
import { queryProducts } from "@/lib/products/list";
import {
  queryRecentActivity,
  querySizeDemand,
  queryTodayStats,
  queryTrendRanking,
  type ActivityFeedItem,
  type TrendRankingItem,
} from "@/lib/dashboard/metrics";
import { formatBRLPrice } from "@/lib/currency/brl";
import { formatRelativeTime } from "@/lib/dashboard/format-relative-time";
import { HeaderActions } from "@/components/header-actions";
import { DashboardAutoRefresh } from "./dashboard-auto-refresh";
import { Greeting } from "./greeting";

/**
 * Dashboard v1.1 "Dashboard de Tendência" (MTR-03..MTR-11), substituindo o
 * dashboard all-time da Fase 6 (MTR-01/MTR-02). Server Component totalmente
 * dinâmico (sem `"use cache"`) — mesma disciplina de `/produtos`.
 *
 * Filtro de período (7/15/30 dias) e paginação do feed são dirigidos por
 * `searchParams` (mesma convenção já usada em `/produtos` e na vitrine
 * pública) — trocar o filtro é navegação, não estado client-side solto.
 *
 * Escopo validado num mockup navegável extenso antes desta implementação;
 * nudge por clique, "avise-me quando chegar" e "compartilhar catálogo"
 * foram propostos, prototipados e explicitamente descartados — ver
 * PROJECT.md "Out of Scope" antes de reintroduzir qualquer um dos três.
 */

const VALID_PERIODS = [7, 15, 30] as const;
type Period = (typeof VALID_PERIODS)[number];

function parsePeriod(raw: string | undefined): Period {
  const parsed = Number(raw);
  return (VALID_PERIODS as readonly number[]).includes(parsed) ? (parsed as Period) : 7;
}

/**
 * Dashboard é atalho de acesso rápido pro dia a dia, não um histórico
 * completo — teto fixo de 15 itens, sem paginação/"Ver mais" (esse
 * mecanismo fazia o card crescer a cada clique e desalinhar a altura com
 * a coluna estreita Disponíveis/Esgotados ao lado). Altura travada com
 * scroll interno SEM barra visível (`[scrollbar-width:none]` +
 * `[&::-webkit-scrollbar]:hidden`) — rola por toque/roda do mouse
 * normalmente, só não expõe o indicador visual. Quem quiser o histórico
 * completo sem teto usa o sino de notificações no cabeçalho
 * (`/dashboard/notificacoes`, paginação real por offset).
 */
const ACTIVITY_FEED_LIMIT = 15;

/** Sparkline inline via SVG puro — sem lib de gráfico, sem client JS. Trecho
 * final do período (~20% dos dias) ganha destaque em `text-primary`; o
 * resto fica em tom neutro (`text-gray-300`/`dark:text-gray-700`), seguindo
 * o mesmo princípio de "período atual em destaque" de um stat-tile comum. */
function Sparkline({ values, days }: { values: number[]; days: number }) {
  const w = 84;
  const h = 28;
  const pad = 4;
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const points = values.map((v, i) => [pad + i * stepX, h - pad - (v / max) * (h - pad * 2)] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [fx] = points[0];
  const [lx] = points[points.length - 1];
  const area = `${line} L${lx.toFixed(1)},${(h - pad).toFixed(1)} L${fx.toFixed(1)},${(h - pad).toFixed(1)} Z`;
  const tailCount = Math.max(2, Math.round(values.length * 0.2));
  const tail = points
    .slice(-tailCount)
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const [ex, ey] = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`Tendência dos últimos ${days} dias`} className="shrink-0">
      <title>{`Tendência dos últimos ${days} dias`}</title>
      <path d={area} className="fill-primary/10 dark:fill-blue-300/15" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="text-gray-300 dark:text-gray-700" />
      <path d={tail} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="text-primary dark:text-blue-300" />
      <circle cx={ex} cy={ey} r={4} className="fill-primary dark:fill-blue-300 stroke-white dark:stroke-gray-900" strokeWidth={2} />
    </svg>
  );
}

function RankingList({
  title,
  items,
  metricLabel,
  MetricIcon,
  days,
}: {
  title: string;
  items: (TrendRankingItem & { coverUrl: string | null })[];
  metricLabel: string;
  MetricIcon: typeof Eye;
  days: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h3>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const urgent = !item.disponivel && (item.isNew || (item.deltaPct ?? 0) > 0);
            return (
              <li key={item.productId} className="rounded-lg border border-gray-200 dark:border-gray-800">
                <div className={`flex min-h-11 flex-wrap items-center gap-3 rounded-lg p-3 ${urgent ? "bg-warning-bg dark:bg-warning-solid/15" : "bg-white dark:bg-gray-900"}`}>
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                    {item.coverUrl ? (
                      <Image src={item.coverUrl} alt={item.name} fill sizes="48px" className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageOff className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-display text-sm font-medium text-gray-900 dark:text-gray-50">{item.name}</span>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold ${
                          item.disponivel
                            ? "bg-success-bg text-success-fg dark:bg-success-solid/15"
                            : "bg-error-bg text-error-fg dark:bg-error-solid/15"
                        }`}
                      >
                        {item.disponivel ? "Disponível" : "Esgotado"}
                      </span>
                    </div>
                    <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {item.secondary}
                      {item.secondary ? " · " : ""}
                      {formatBRLPrice(item.price)}
                    </span>
                  </div>
                  <Sparkline values={item.trend} days={days} />
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="flex items-center gap-1 text-sm font-medium text-gray-900 dark:text-gray-50">
                      <MetricIcon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                      {item.current} {metricLabel}
                    </span>
                    <span
                      className={`rounded-full px-2 py-px text-[10px] font-bold ${
                        item.isNew
                          ? "bg-primary-subtle text-primary dark:bg-blue-400/15 dark:text-blue-300"
                          : "bg-success-bg text-success-fg dark:bg-success-solid/15"
                      }`}
                    >
                      {item.isNew ? "Novo" : `${(item.deltaPct ?? 0) >= 0 ? "+" : ""}${item.deltaPct}%`}
                    </span>
                  </div>
                  {urgent && (
                    <div className="flex w-full items-center justify-between gap-2 border-t border-warning-solid/20 pt-2 text-xs font-semibold text-warning-fg">
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Em alta e esgotado
                      </span>
                      <Link href={`/produtos/${item.productId}/editar`} className="shrink-0 underline underline-offset-2">
                        Atualizar estoque →
                      </Link>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col gap-1 rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center dark:border-gray-700">
          <span className="font-medium text-gray-900 dark:text-gray-50">Sem atividade suficiente nesse período</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">Troque a janela de dias acima ou aguarde mais movimento na vitrine.</span>
        </div>
      )}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireCompletedOnboarding();

  const params = await searchParams;
  const periodo = parsePeriod(params.periodo);

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

  const produtos = await queryProducts(supabase, store.id, {});

  if (produtos.length === 0) {
    return (
      <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl leading-tight font-extrabold text-gray-900 dark:text-gray-50">Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Visão geral da sua vitrine.</p>
          </div>
          <HeaderActions />
        </div>
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 px-6 py-16 text-center dark:border-gray-700">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle dark:bg-blue-400/15">
            <PackagePlus className="h-7 w-7 text-primary dark:text-blue-300" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-display font-bold text-gray-900 dark:text-gray-50">Sua loja ainda não tem produtos</span>
            <span className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
              Assim que você cadastrar o primeiro, o placar do dia, o feed de atividade e os rankings de tendência
              começam a aparecer aqui sozinhos — nada pra configurar.
            </span>
          </div>
          <Link
            href="/produtos/novo"
            className="mt-2 rounded-md bg-primary px-4 py-2 text-center text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
          >
            Cadastrar primeiro produto
          </Link>
        </div>
      </div>
    );
  }

  const [today, feed, maisVisualizados, cliquesWhatsapp, sizeDemand] = await Promise.all([
    queryTodayStats(supabase, store.id),
    queryRecentActivity(supabase, store.id, ACTIVITY_FEED_LIMIT),
    queryTrendRanking(supabase, store.id, "views", periodo),
    queryTrendRanking(supabase, store.id, "clicks", periodo),
    querySizeDemand(supabase, store.id, periodo),
  ]);
  const maxSizeDemand = Math.max(...sizeDemand.map((item) => item.count), 1);

  const disponiveis = produtos.filter((product) => product.disponivel).length;
  const esgotados = produtos.length - disponiveis;

  const resolveCover = (path: string | null) =>
    path ? supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl : null;

  const maisVisualizadosWithCover = maisVisualizados.map((item) => ({ ...item, coverUrl: resolveCover(item.coverPath) }));
  const cliquesWhatsappWithCover = cliquesWhatsapp.map((item) => ({ ...item, coverUrl: resolveCover(item.coverPath) }));

  const feedIcon = (item: ActivityFeedItem) => (item.type === "click" ? MessageCircle : Eye);

  return (
    <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <DashboardAutoRefresh />
      <div className="flex items-center justify-between gap-3">
        <Greeting />
        <HeaderActions activityFeed={feed.items} />
      </div>

      {/* MTR-03: placar do dia — sempre hoje, nunca acumulado */}
      <div className="grid grid-cols-1 divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="flex flex-col gap-0.5 p-4">
          <span className="font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">{today.views}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">Visualizações hoje</span>
        </div>
        <div className="flex flex-col gap-0.5 p-4">
          <span className="font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">{today.clicks}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">Cliques em &quot;Pedir agora&quot; hoje</span>
        </div>
        <div className="flex flex-col gap-0.5 p-4">
          <span className="font-display text-2xl font-extrabold text-primary dark:text-blue-300">{today.conversionPct}%</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">Taxa de conversão (view → clique)</span>
        </div>
      </div>

      {/* Grid assimétrico (2/3 + 1/3, referência de layout tipo bento) —
          feed de atividade é o widget mais alto/denso, então fica na
          coluna larga; Disponíveis/Esgotados/Tamanhos cabem empilhados na
          coluna estreita ao lado, sem disputar espaço com os rankings
          abaixo. Colapsa pra 1 coluna abaixo de lg (mobile-first).
          `lg:items-start`: por padrão o grid estica os 2 itens da linha pra
          bater a altura do mais alto — qualquer lado que crescer (novo card
          na coluna estreita, mais itens no feed) faz o OUTRO esticar e
          sobrar vão vazio dentro dele. `items-start` tira essa dependência
          nos dois sentidos, sem precisar de `self-start` por item nem tocar
          no conteúdo de nenhum dos dois widgets. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* MTR-04: feed de atividade recente, com teto + "Ver mais"/"Ver menos".
            Volta a esticar igual sempre esticou (sem self-start) — em vez de
            deixar vão vazio quando a coluna ao lado for mais alta, a lista
            (`flex-1`) preenche a altura disponível. `justify-center` SÓ quando
            os itens cabem sem scroll (≤4 nos 14rem): centralizado, distribui
            e some o vão embaixo. Com mais que isso volta a top-align — se
            centralizasse com overflow, o primeiro item ficaria cortado no
            topo (fora do alcance do scroll). */}
        <section className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 lg:col-span-2">
          <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Atividade recente</h2>
          {feed.items.length > 0 ? (
            // Wrapper `relative lg:flex-1`: no desktop preenche a altura que
            // sobra na section (que por sua vez é esticada pela coluna dos 3
            // cards ao lado via grid), e a <ul> vira `lg:absolute inset-0` —
            // fora do fluxo, então NÃO empurra a altura da caixa pra fora
            // conforme entram mais itens. Resultado: a caixa fica exatamente
            // do tamanho da coluna irmã (as duas terminam na mesma linha) e a
            // lista rola por dentro. No mobile (sem coluna irmã) a <ul> volta
            // ao fluxo normal com teto de 14rem.
            <div className="relative min-h-0 lg:flex-1">
            <ul className="flex max-h-[14rem] flex-col gap-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:absolute lg:inset-0 lg:max-h-none">
                {feed.items.map((item, index) => {
                  const Icon = feedIcon(item);
                  return (
                    <li key={`${item.type}-${item.productId}-${item.createdAt}-${index}`} className="flex items-start gap-3.5 border-b border-gray-100 py-3 last:border-none dark:border-gray-800">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          item.type === "click"
                            ? "bg-success-bg text-success-fg dark:bg-success-solid/15"
                            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="text-base text-gray-700 dark:text-gray-300">
                        {item.type === "click" ? (
                          <>
                            Alguém clicou em <b className="font-semibold text-gray-900 dark:text-gray-50">&quot;Pedir agora&quot;</b> — {item.productName}
                          </>
                        ) : (
                          <>
                            <b className="font-semibold text-gray-900 dark:text-gray-50">{item.count} visualizaç{item.count > 1 ? "ões" : "ão"}</b> nova{item.count > 1 ? "s" : ""} — {item.productName}
                          </>
                        )}
                        <span className="mt-0.5 block text-sm text-gray-400 dark:text-gray-500">{formatRelativeTime(item.createdAt)}</span>
                      </span>
                    </li>
                  );
                })}
            </ul>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center dark:border-gray-700">
              <span className="font-medium text-gray-900 dark:text-gray-50">Ainda sem atividade</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">Assim que sua vitrine receber acessos ou pedidos, eles aparecem aqui.</span>
            </div>
          )}
        </section>

        {/* MTR-05: Disponíveis/Esgotados/Tamanhos — sem "Total"/"Acessos"
            all-time. Empilhados na coluna estreita (não lado a lado como
            antes) pra caber ao lado do feed sem espremer. `lg:content-start`
            empacota os cards no topo das próprias tracks; o alinhamento
            entre essa coluna e "Atividade recente" (nenhum dos dois estica
            pra acompanhar o outro) é resolvido no grid pai via
            `lg:items-start`, não aqui. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:content-start lg:gap-4">
          <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-bg dark:bg-success-solid/15">
                <CheckCircle2 className="h-5 w-5 text-success-fg" aria-hidden="true" />
              </div>
              <span className="font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">{disponiveis}</span>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">Produtos disponíveis</span>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-error-bg dark:bg-error-solid/15">
                <XCircle className="h-5 w-5 text-error-fg" aria-hidden="true" />
              </div>
              <span className={`font-display text-2xl font-extrabold ${esgotados > 0 ? "text-error-fg" : "text-gray-900 dark:text-gray-50"}`}>{esgotados}</span>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">Produtos esgotados</span>
          </div>

          {/* Tamanhos mais pedidos — cruza order_clicks.size de todos os
              produtos, dado que existia mas nunca era mostrado consolidado.
              col-span-2 no mobile (linha própria, cheia) pra não sobrar meia
              coluna vazia ao lado; segue o mesmo filtro periodo do Ranking
              de tendência, sem seletor próprio. */}
          <div className="col-span-2 flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 lg:col-span-1">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle dark:bg-blue-400/15">
                <SportShoe className="h-5 w-5 text-primary dark:text-blue-300" aria-hidden="true" />
              </div>
              <span className="font-display text-base font-bold text-gray-900 dark:text-gray-50">Tamanhos mais pedidos</span>
            </div>
            {sizeDemand.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {sizeDemand.slice(0, 3).map((item) => (
                  <li key={item.size} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {item.size}
                    </span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className="h-full rounded-full bg-primary dark:bg-blue-400"
                        style={{ width: `${Math.max(8, Math.round((item.count / maxSizeDemand) * 100))}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">{item.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Nenhum pedido &quot;Pedir agora&quot; registrado nesse período ainda.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* MTR-06..MTR-10: ranking de tendência, com filtro de período — linha
          larga própria abaixo do grid assimétrico, os dois rankings lado a
          lado (mesma ideia de "chart ao lado de lista" da referência).
          Cabeçalho "Ranking de tendência" + filtro agora dentro de um card
          (border/bg/rounded), igual a todo outro widget da página — antes
          ficava boiando direto no fundo, sem contexto nem "material"
          consistente com o resto do dashboard. O track do seletor
          (bg-gray-100/800) fica "recuado" dentro do card branco/gray-900,
          mesmo princípio de profundidade já usado no avatar de produto. */}
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Ranking de tendência</h2>
          <div className="inline-flex w-fit gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            {VALID_PERIODS.map((d) => (
              <Link
                key={d}
                href={`/dashboard?periodo=${d}`}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors duration-150 ${
                  d === periodo
                    ? "bg-white text-primary shadow-sm dark:bg-gray-900 dark:text-blue-300"
                    : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
                }`}
              >
                {d}d
              </Link>
            ))}
          </div>
        </div>

        {/* Divisor explícito como coluna própria do grid (não `divide-x` — misturar
            `divide-x` com `gap-x` faz a borda ficar desalinhada dentro do espaço do
            gap, em vez de esticada e centralizada; achado nas capturas do usuário).
            `self-stretch` garante que a linha acompanhe a altura da coluna mais alta
            mesmo se "Mais visualizados"/"Cliques no WhatsApp" tiverem números
            diferentes de itens. */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_auto_1fr]">
          <RankingList title="Mais visualizados" items={maisVisualizadosWithCover} metricLabel="visualizações" MetricIcon={Eye} days={periodo} />
          <div className="hidden self-stretch border-l border-gray-200 md:block dark:border-gray-800" aria-hidden="true" />
          <div className="border-t border-gray-200 pt-6 md:border-t-0 md:pt-0 dark:border-gray-800">
            <RankingList title="Cliques no WhatsApp" items={cliquesWhatsappWithCover} metricLabel="cliques" MetricIcon={MessageCircle} days={periodo} />
          </div>
        </div>
      </div>
    </div>
  );
}
