import type { ReactNode } from "react";
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
  TrendingDown,
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
  HEADER_FEED_LIMIT,
  type ActivityFeedItem,
  type TrendRankingItem,
} from "@/lib/dashboard/metrics";
import { formatBRLPrice } from "@/lib/currency/brl";
import { formatRelativeTime } from "@/lib/dashboard/format-relative-time";
import { resolveTimeZone } from "@/lib/time/store-timezone";
import { buildStoreUrl } from "@/lib/slug/store-url";
import { HeaderActions } from "@/components/header-actions";
import { ShareVitrineButton } from "@/components/share-vitrine-button";
import { DashboardAutoRefresh } from "./dashboard-auto-refresh";
import { Greeting } from "./greeting";

/**
 * Dashboard v1.1 "Dashboard de Tendência" (MTR-03..MTR-11), substituindo o
 * dashboard all-time da Fase 6 (MTR-01/MTR-02). Server Component totalmente
 * dinâmico (sem `"use cache"`) — mesma disciplina de `/admin/produtos`.
 *
 * Filtro de período (7/15/30 dias) e paginação do feed são dirigidos por
 * `searchParams` (mesma convenção já usada em `/admin/produtos` e na vitrine
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
 * (`/admin/dashboard/notificacoes`, paginação real por offset).
 */
// Mesmo teto do pop-up do sino em todas as rotas — o `feed` daqui alimenta
// os dois (o widget desta página e o `HeaderActions`), então importar a
// constante compartilhada evita que o sino mostre quantidades diferentes
// dependendo de onde o usuário estiver.
const ACTIVITY_FEED_LIMIT = HEADER_FEED_LIMIT;

/**
 * Teto de itens REAIS (últimas 24h) mostrados no widget "Atividades
 * recentes" antes de cair no scroll interno original da lista (que já
 * existia antes desta feature — ver `<ul className="... overflow-y-auto ...">`
 * mais abaixo). Faz parte da mecânica de preenchimento do vão: ver
 * `buildActivityGapFill`.
 */
const ACTIVITY_DISPLAY_CAP = 5;

/**
 * Particiona o feed de atividade em "últimas 24h" (recent) e "antes disso"
 * (older) — janela deslizante a partir de agora (o instante é o mesmo real
 * pro usuário, então independe de fuso). Usado SÓ pelo widget "Atividades
 * recentes" do dashboard; o histórico completo (/dashboard/notificacoes) e
 * o sino de notificações seguem sem esse corte. `Date.now()` isolado aqui
 * (não no corpo do Server Component) pela regra de pureza do lint — mesmo
 * padrão de `startOfTodayBR`. Comparação numérica pra não depender do
 * formato exato do timestamp do banco.
 */
function partitionActivityLast24h(items: ActivityFeedItem[]): { recent: ActivityFeedItem[]; older: ActivityFeedItem[] } {
  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
  const recent: ActivityFeedItem[] = [];
  const older: ActivityFeedItem[] = [];
  for (const item of items) {
    (new Date(item.createdAt).getTime() >= cutoffMs ? recent : older).push(item);
  }
  return { recent, older };
}

/**
 * Mecânica de preenchimento do vão do widget (spec validada no mockup de
 * design — 3 estágios, baseados em quantos itens reais já existem):
 *   ① 1 item real → mostra 1 item "antes das últimas 24h" ao lado do CTA de
 *      compartilhar (o que cabe sem sobrar vão).
 *   ② 2-3 itens reais → o histórico já some (o real ocupa espaço sozinho);
 *      o CTA continua.
 *   ③ 4 itens reais → o CTA também some (o real toma esse espaço também).
 *   Em `ACTIVITY_DISPLAY_CAP` (5) reais, nem histórico nem CTA aparecem —
 *   só a lista, com o scroll interno que já existia antes desta feature.
 *   0 itens reais é tratado à parte no componente (CTA sozinho, centralizado).
 */
function buildActivityGapFill(recentCount: number, olderItems: ActivityFeedItem[]) {
  const showHistorical = recentCount === 1 && olderItems.length > 0;
  const historicalItems = showHistorical ? olderItems.slice(0, 1) : [];
  const showShareCta = recentCount >= 1 && recentCount < 4;
  const useCompactLayout = recentCount >= 1 && recentCount < ACTIVITY_DISPLAY_CAP;
  return { historicalItems, showShareCta, useCompactLayout };
}

/**
 * Converte os pontos numa curva suave (Catmull-Rom -> Bézier cúbica) em vez
 * de segmentos retos: é isso que dá o traço arredondado/fluido do modelo de
 * referência, no lugar dos "bicos" de uma polyline. `TENSION` < 1 segura o
 * overshoot da curva pra ela não estourar o padding vertical do SVG.
 */
const SPARKLINE_TENSION = 0.75;

function buildSmoothPath(points: readonly (readonly [number, number])[]): string {
  if (points.length < 2) return "";
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    const c1x = x1 + ((x2 - x0) / 6) * SPARKLINE_TENSION;
    const c1y = y1 + ((y2 - y0) / 6) * SPARKLINE_TENSION;
    const c2x = x2 - ((x3 - x1) / 6) * SPARKLINE_TENSION;
    const c2y = y2 - ((y3 - y1) / 6) * SPARKLINE_TENSION;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  return d;
}

/**
 * Sparkline inline via SVG puro — sem lib de gráfico, sem client JS.
 *
 * Estilo copiado de um modelo de referência trazido pelo usuário: curva
 * suave, traço de cor ÚNICA e preenchimento em degradê que some na base.
 * O desenho anterior (trecho final em destaque + ponto no fim marcando o
 * último dia) foi removido de propósito nessa troca — a informação de
 * "quanto mudou no período" continua no selo de porcentagem ao lado.
 */
function Sparkline({ values, days, instanceId }: { values: number[]; days: number; instanceId: string }) {
  const w = 84;
  const h = 28;
  const pad = 4;
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const points = values.map((v, i) => [pad + i * stepX, h - pad - (v / max) * (h - pad * 2)] as const);
  const line = buildSmoothPath(points);
  const [fx] = points[0];
  const [lx] = points[points.length - 1];
  const area = `${line} L${lx.toFixed(1)},${(h - pad).toFixed(1)} L${fx.toFixed(1)},${(h - pad).toFixed(1)} Z`;
  // `instanceId` PRECISA ser único no documento, não pode derivar só dos
  // dados: cada item renderiza este componente DUAS vezes (uma versão
  // mobile e uma desktop, alternadas por CSS) com exatamente os mesmos
  // valores. Com id repetido, `url(#id)` resolve sempre pro PRIMEIRO do
  // documento — o do mobile — que no desktop está `display:none`, e um
  // degradê dentro de subárvore não renderizada não pinta nada. Resultado:
  // o preenchimento aparecia só no mobile e sumia no desktop.
  //
  // Higienizado aqui (e não na chamada) porque id de SVG não aceita espaço
  // nem acento — o nome da coluna ("Mais visualizados") entra na composição.
  const gradientId = `sparkline-fade-${instanceId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`Tendência dos últimos ${days} dias`} className="shrink-0 text-primary dark:text-blue-300">
      <title>{`Tendência dos últimos ${days} dias`}</title>
      {/* stop-color explícito por tema em vez de `currentColor`: dentro de
          <defs> o currentColor não resolve de forma confiável (o traço
          funcionava, mas o degradê saía sem cor — invisível no escuro).
          Opacidade maior no escuro porque fundo escuro engole preenchimento
          de baixa opacidade mais que fundo claro. */}
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            className="[stop-color:var(--color-primary)] [stop-opacity:0.32] dark:[stop-color:var(--color-blue-300)] dark:[stop-opacity:0.45]"
          />
          <stop
            offset="100%"
            className="[stop-color:var(--color-primary)] [stop-opacity:0] dark:[stop-color:var(--color-blue-300)]"
          />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** No ranking de tendência o nome do produto tem a PRIMEIRA palavra (a marca,
 *  ex.: "Nike") removida — encurta e vai direto ao modelo, ganhando espaço.
 *  Escopo: só este widget. Nome de uma palavra só fica intacto (não zera). */
function stripBrandWord(name: string): string {
  const trimmed = name.trim();
  const firstSpace = trimmed.indexOf(" ");
  return firstSpace === -1 ? trimmed : trimmed.slice(firstSpace + 1);
}

function RankingList({
  title,
  items,
  metricLabel,
  metricLabelMobile = metricLabel,
  MetricIcon,
  days,
  emptyTitle,
  emptyMessage,
}: {
  title: string;
  items: (TrendRankingItem & { coverUrl: string | null })[];
  metricLabel: string;
  /** Rótulo curto usado só no mobile (ex.: "Views" no lugar de "visualizações").
   *  Omitido → cai no metricLabel normal (mesmo texto nos dois breakpoints). */
  metricLabelMobile?: string;
  MetricIcon: typeof Eye;
  days: number;
  /** Copy do estado vazio — específica por métrica (visitas vs. pedidos são
   *  causas raiz diferentes: tráfego vs. conversão do catálogo), não um
   *  texto genérico repetido entre as duas colunas. */
  emptyTitle: ReactNode;
  emptyMessage: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-normal text-gray-700 dark:text-gray-300">{title}</h3>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const urgent = !item.disponivel && (item.isNew || (item.deltaPct ?? 0) > 0);
            // Métrica (contagem + selo de "porcentagem de tendência": Novo / +% / −%)
            // reusada em dois lugares por breakpoint: inline na coluna de texto no
            // mobile (pro nome não disputar espaço com uma coluna à direita) e na
            // coluna à direita no desktop (sm+).
            const metricContent = (
              <>
                <span className="flex items-center gap-1 text-sm font-medium text-gray-900 dark:text-gray-50">
                  <MetricIcon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                  {item.current}{" "}
                  <span className="sm:hidden">{metricLabelMobile}</span>
                  <span className="hidden sm:inline">{metricLabel}</span>
                </span>
                {/* Tendência positiva usa o mesmo azul de marca do badge
                    "Novo" (bg-primary-subtle/text-primary) — só a tendência
                    NEGATIVA continua vermelha. "Disponível"/"Esgotado" (mais
                    abaixo, no card do produto) é outro badge e continua
                    verde/vermelho — não mexer nele por engano. */}
                <span
                  className={`shrink-0 rounded-full px-2 py-px text-[10px] font-bold ${
                    item.isNew || (item.deltaPct ?? 0) >= 0
                      ? "bg-primary-subtle text-primary dark:bg-blue-400/15 dark:text-blue-300"
                      : "bg-error-bg text-error-badge-fg dark:bg-error-solid/15"
                  }`}
                >
                  {item.isNew ? "Novo" : `${(item.deltaPct ?? 0) >= 0 ? "+" : ""}${item.deltaPct}%`}
                </span>
              </>
            );
            return (
              <li key={item.productId} className="rounded-lg border border-gray-200 dark:border-gray-800">
                <div className={`flex min-h-11 flex-wrap items-start gap-3 rounded-lg p-3 sm:items-center ${urgent ? "bg-warning-bg dark:bg-warning-solid/15" : "bg-white dark:bg-gray-900"}`}>
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
                      <span className="truncate font-display text-sm font-medium text-gray-900 dark:text-gray-50">{stripBrandWord(item.name)}</span>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold ${
                          item.disponivel
                            ? "bg-success-bg text-success-fg dark:bg-success-solid/15"
                            : "bg-error-bg text-error-badge-fg dark:bg-error-solid/15"
                        }`}
                      >
                        {item.disponivel ? "Disponível" : "Esgotado"}
                      </span>
                    </div>
                    {/* Subtítulo (marca·modelo·preço) escondido no mobile pra abrir
                        espaço pro gráfico; volta no desktop (sm+), onde há folga. */}
                    <span className="hidden truncate text-xs text-gray-500 sm:block dark:text-gray-400">
                      {item.secondary}
                      {item.secondary ? " · " : ""}
                      {formatBRLPrice(item.price)}
                    </span>
                    {/* Só no mobile: gráfico + métrica numa linha, ocupando o espaço
                        que era do subtítulo. No desktop os dois vivem nas colunas à direita. */}
                    <div className="mt-1 flex items-center gap-3 sm:hidden">
                      <Sparkline values={item.trend} days={days} instanceId={`${title}-${item.productId}-mobile`} />
                      <div className="flex items-center gap-2">{metricContent}</div>
                    </div>
                  </div>
                  {/* Sparkline escondido no mobile: naquele tamanho fica minúsculo e
                      rouba a largura do nome (a info essencial do ranking). */}
                  <div className="hidden shrink-0 sm:block">
                    <Sparkline values={item.trend} days={days} instanceId={`${title}-${item.productId}-desktop`} />
                  </div>
                  <div className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">{metricContent}</div>
                  {urgent && (
                    <div className="flex w-full items-center justify-between gap-2 border-t border-warning-solid/20 pt-2 text-xs font-semibold text-warning-fg">
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Em alta e esgotado
                      </span>
                      <Link href={`/admin/produtos/${item.productId}/editar`} className="shrink-0 underline underline-offset-2">
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
          <span className="font-medium text-gray-900 dark:text-gray-50">{emptyTitle}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</span>
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
    .select("id, slug, name, timezone")
    .eq("owner_id", userData.user!.id)
    .single();

  if (!store) {
    redirect("/admin/onboarding");
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
            href="/admin/produtos/novo"
            className="mt-2 rounded-md bg-primary px-4 py-2 text-center text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
          >
            Cadastrar primeiro produto
          </Link>
        </div>
      </div>
    );
  }

  // Fuso da própria loja (migration 0013) — define o que "hoje" e a janela
  // de N dias significam para ESTE revendedor. Sem isso, quem é de Roraima
  // (UTC-4) via o dia virar às 23h no relógio dele.
  const timeZone = resolveTimeZone(store.timezone);

  const [today, feed, maisVisualizados, cliquesWhatsapp, sizeDemand] = await Promise.all([
    queryTodayStats(supabase, store.id, timeZone),
    queryRecentActivity(supabase, store.id, ACTIVITY_FEED_LIMIT),
    queryTrendRanking(supabase, store.id, "views", periodo, timeZone),
    queryTrendRanking(supabase, store.id, "clicks", periodo, timeZone),
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

  // Uma <li> pra item recente E pra item "antes das últimas 24h" — o `muted`
  // aplica o tratamento visual esmaecido/menor do histórico (spec do mockup)
  // sem duplicar a lógica de click-vs-view em dois lugares com risco de desvio.
  const renderActivityRow = (item: ActivityFeedItem, key: string, muted: boolean) => {
    const Icon = feedIcon(item);
    const boldClass = muted ? "font-medium text-gray-500 dark:text-gray-400" : "font-semibold text-gray-900 dark:text-gray-50";
    return (
      <li key={key} className={`flex items-start gap-3.5 border-b border-gray-100 last:border-none dark:border-gray-800 ${muted ? "py-2" : "py-3"}`}>
        <span
          className={`flex shrink-0 items-center justify-center rounded-full ${muted ? "h-6 w-6" : "h-8 w-8"} ${
            item.type === "click"
              ? "bg-success-bg text-success-fg dark:bg-success-solid/15"
              : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
          }`}
        >
          <Icon className={muted ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
        </span>
        <span className={muted ? "text-sm text-gray-400 dark:text-gray-500" : "text-base text-gray-700 dark:text-gray-300"}>
          {item.type === "click" ? (
            <>
              Alguém clicou em <b className={boldClass}>&quot;Pedir agora&quot;</b> — {item.productName}
            </>
          ) : (
            <>
              <b className={boldClass}>{item.count} visualizaç{item.count > 1 ? "ões" : "ão"}</b>{muted ? "" : ` nova${item.count > 1 ? "s" : ""}`} — {item.productName}
            </>
          )}
          <span className={`mt-0.5 block text-gray-400 dark:text-gray-500 ${muted ? "text-xs" : "text-sm"}`}>{formatRelativeTime(item.createdAt)}</span>
        </span>
      </li>
    );
  };

  // "Atividades recentes" (só este widget do dashboard) mostra apenas eventos
  // das últimas 24h + histórico/CTA de preenchimento (buildActivityGapFill);
  // o sino de notificações continua com o feed completo (`feed.items`).
  const { recent: recentActivityItems, older: olderActivityItems } = partitionActivityLast24h(feed.items);
  const { historicalItems, showShareCta, useCompactLayout } = buildActivityGapFill(recentActivityItems.length, olderActivityItems);

  // CTA "compartilhar vitrine" pra preencher o vão do widget "Atividades
  // recentes" (mockup validado, Proposta 1) — mesmo destino/convenção do
  // link "Ver minha vitrine" da sidebar (`<a target="_blank">`, não <Link>,
  // já que é navegação pra fora do grupo de rotas admin).
  // Mobile: pilha vertical centralizada (já validada). Desktop: vira uma
  // linha HORIZONTAL (ícone | texto | botão) — é isso que resolve a raiz do
  // problema de texto minúsculo: empilhado verticalmente, ícone+título+
  // subtítulo+botão brigavam pela pouca altura que "Tamanhos mais pedidos"
  // permite, forçando fonte cada vez menor. Numa linha só, a altura
  // necessária é só a de UMA linha de texto — cabe folgado em qualquer
  // altura, com fonte em tamanho normal. `lg:min-h`+`lg:flex-1` (no card)
  // continuam garantindo que ele cresce até bater a altura do vizinho;
  // `lg:justify-center` centraliza a linha inteira verticalmente dentro
  // desse espaço extra.
  // Versão HORIZONTAL (desktop) — usada só quando o CTA divide o card com a
  // lista de atividade (1-3 itens): aí ele herda apenas o espaço que sobra
  // depois da lista, naturalmente menor, e o layout em linha cabe folgado
  // com fonte em tamanho normal.
  const shareCta = (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-primary-subtle/40 px-5 py-8 text-center lg:min-h-40 lg:flex-1 lg:flex-row lg:items-center lg:gap-4 lg:px-6 lg:py-5 lg:text-left dark:border-gray-800 dark:bg-blue-400/[0.06]">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary lg:h-11 lg:w-11 dark:bg-blue-400/15 dark:text-blue-300">
        <TrendingDown className="h-6 w-6 lg:h-5 lg:w-5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col items-center gap-1 lg:flex-1 lg:items-start lg:gap-0.5">
        <span className="font-display text-lg font-semibold text-gray-900 lg:text-base dark:text-gray-50">Movimento parado nas últimas 24h?</span>
        {/* Quebra manual só no mobile (card estreito, texto centralizado) —
            no desktop a coluna de texto tem largura própria dentro da linha
            horizontal e o parágrafo quebra naturalmente, sem precisar de
            <br> nem cap de ch. */}
        <span className="max-w-[50ch] text-sm text-gray-500 lg:hidden dark:text-gray-400">
          Priorize compartilhar sua vitrine — é a ação
          <br />
          que mais gera resultado pra sua loja.
        </span>
        <span className="hidden text-sm text-gray-500 lg:block dark:text-gray-400">
          Priorize compartilhar sua vitrine — é a ação que mais gera resultado pra sua loja.
        </span>
      </div>
      <ShareVitrineButton
        url={buildStoreUrl(store!.slug)}
        storeName={store!.name}
        className="mt-1 inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-primary-hover active:bg-primary-active disabled:opacity-70 lg:mt-0"
      />
    </div>
  );

  // Versão COMPACTA (0 atividades) — o CTA fica SOZINHO ocupando o card
  // inteiro, sem lista dividindo o espaço. Em vez de um horizontal menor,
  // usa o MESMO design vertical do mobile em qualquer largura de tela
  // (ícone em cima, título, subtítulo, botão empilhados e centralizados) —
  // só o `lg:min-h-40 lg:flex-1 lg:justify-center` muda por breakpoint, pra
  // o card continuar crescendo/centralizando conforme a altura do vizinho
  // ("Tamanhos mais pedidos") muda.
  const shareCtaCompact = (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-primary-subtle/40 px-5 py-8 text-center lg:min-h-40 lg:flex-1 dark:border-gray-800 dark:bg-blue-400/[0.06]">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary dark:bg-blue-400/15 dark:text-blue-300">
        <TrendingDown className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="font-display text-lg font-semibold text-gray-900 dark:text-gray-50">Movimento parado nas últimas 24h?</span>
      <span className="max-w-[50ch] text-sm text-gray-500 dark:text-gray-400">
        Priorize compartilhar sua vitrine — é a ação
        <br />
        que mais gera resultado pra sua loja.
      </span>
      <ShareVitrineButton
        url={buildStoreUrl(store!.slug)}
        storeName={store!.name}
        className="mt-1 inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-primary-hover active:bg-primary-active disabled:opacity-70"
      />
    </div>
  );

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
          <span className="text-xs text-gray-700 dark:text-gray-300">Visualizações hoje</span>
          <span className="font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">{today.views}</span>
        </div>
        <div className="flex flex-col gap-0.5 p-4">
          <span className="text-xs text-gray-700 dark:text-gray-300">Cliques em &quot;Pedir agora&quot; hoje</span>
          <span className="font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">{today.clicks}</span>
        </div>
        <div className="flex flex-col gap-0.5 p-4">
          <span className="text-xs text-gray-700 dark:text-gray-300">Taxa de conversão (view → clique)</span>
          <span className="font-display text-2xl font-extrabold text-primary dark:text-blue-300">{today.conversionPct}%</span>
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
          <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Atividades recentes</h2>
          {recentActivityItems.length === 0 ? (
            // 0 eventos nas 24h: só o CTA de compartilhar, centralizado na
            // vertical (ocupa todo o vão, não fica no rodapé). `flex-col` +
            // stretch: o card preenche a largura toda do widget (igual ao
            // mockup e ao estado compacto), não encolhe no conteúdo.
            // `lg:pt-8` (só desktop): abre um respiro entre o título
            // "Atividades recentes" e a borda de cima do card — sem tocar no
            // `shareCta` em si. Usa a variante COMPACTA (shareCtaCompact):
            // aqui o CTA fica sozinho preenchendo o card inteiro (sem lista
            // dividindo o espaço), então a escala "normal" ficaria
            // desproporcional numa área tão maior — ver renderShareCta.
            <div className="flex min-h-0 flex-1 flex-col justify-center lg:pt-4">{shareCtaCompact}</div>
          ) : useCompactLayout ? (
            // 1-4 itens reais: lista no fluxo normal (sem `lg:absolute`, pra o
            // conteúdo empurrar de verdade) + preenchimento do vão. `flex-1` +
            // `mt-auto` no bloco de baixo faz o histórico/CTA grudar no rodapé,
            // absorvendo só o vão que sobra (mecânica validada no mockup).
            <div className="flex min-h-0 flex-1 flex-col">
              <ul className="flex flex-col gap-1">
                {recentActivityItems.map((item, index) =>
                  renderActivityRow(item, `${item.type}-${item.productId}-${item.createdAt}-${index}`, false)
                )}
              </ul>
              {historicalItems.length > 0 && (
                <ul className="flex flex-col gap-1">
                  <li className="mt-4 mb-0.5 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    <span className="shrink-0">Antes das últimas 24h</span>
                    <span className="h-px flex-1 bg-gray-100 dark:bg-gray-800" aria-hidden="true" />
                  </li>
                  {historicalItems.map((item, index) =>
                    renderActivityRow(item, `old-${item.type}-${item.productId}-${item.createdAt}-${index}`, true)
                  )}
                </ul>
              )}
              {showShareCta && <div className="flex flex-1 flex-col pt-4">{shareCta}</div>}
            </div>
          ) : (
            // 5 itens reais (teto): a <ul> volta ao comportamento original —
            // `lg:absolute inset-0` fora do fluxo + scroll interno que já
            // existia antes desta feature. Nada de histórico/CTA aqui.
            <div className="relative min-h-0 lg:flex-1">
              <ul className="flex max-h-[14rem] flex-col gap-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:absolute lg:inset-0 lg:max-h-none">
                {recentActivityItems.map((item, index) =>
                  renderActivityRow(item, `${item.type}-${item.productId}-${item.createdAt}-${index}`, false)
                )}
              </ul>
            </div>
          )}
        </section>

        {/* MTR-05: Disponíveis/Esgotados/Tamanhos — sem "Total"/"Acessos"
            all-time. Empilhados na coluna estreita (não lado a lado como
            antes) pra caber ao lado do feed sem espremer. No desktop a coluna
            vira flex-col e o card "Tamanhos" leva `lg:flex-1` SÓ no empty
            state (sizeDemand vazio): aí ele cresce e preenche a altura que o
            grid pai (items-stretch) reserva pra bater o widget "Atividades
            recentes" ao lado — some o vão que sobrava abaixo do aviso. Quando
            há barras de tamanhos, o card volta à altura natural (não estica,
            pra não deixar vão abaixo das barras). O conteúdo fica sempre no
            topo; só o espaço de baixo estica. No mobile segue grid-cols-2
            (Disp./Esg. lado a lado, Tamanhos em linha própria). */}
        <div className="grid grid-cols-2 gap-3 lg:flex lg:flex-col lg:gap-4">
          <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <span className="text-xs text-gray-700 dark:text-gray-300">Produtos disponíveis</span>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-success-fg" aria-hidden="true" />
              </div>
              <span className="font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">{disponiveis}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <span className="text-xs text-gray-700 dark:text-gray-300">Produtos esgotados</span>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center">
                <XCircle className="h-6 w-6 text-error-fg" aria-hidden="true" />
              </div>
              <span className={`font-display text-2xl font-extrabold ${esgotados > 0 ? "text-error-fg" : "text-gray-900 dark:text-gray-50"}`}>{esgotados}</span>
            </div>
          </div>

          {/* Tamanhos mais pedidos — cruza order_clicks.size de todos os
              produtos, dado que existia mas nunca era mostrado consolidado.
              col-span-2 no mobile (linha própria, cheia) pra não sobrar meia
              coluna vazia ao lado; segue o mesmo filtro periodo do Ranking
              de tendência, sem seletor próprio. */}
          {/* min-h calculado pra bater a altura de quando há 2 tamanhos com
              dados (título + 2 linhas h-9 + gaps + padding) — o estado vazio
              ("Nenhum pedido...") não fica mais raso que o estado populado.
              lg:flex-1 (desktop, incondicional): cresce pra preencher a
              altura que o Grid pai (items-stretch) reserva pra essa coluna
              quando "Atividades recentes" for a mais alta — conteúdo
              continua no topo, só o espaço de baixo estica. Par simétrico do
              flex-1 do CTA dentro de "Atividades recentes": qualquer que
              seja o lado mais alto no momento, o outro absorve a diferença
              crescendo, e as duas bordas de baixo ficam sempre alinhadas. */}
          <div className="col-span-2 flex min-h-44 flex-col gap-4 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 lg:col-span-1 lg:flex-1">
            <span className="font-display text-base font-bold text-gray-900 dark:text-gray-50">Tamanhos mais pedidos</span>
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
                Nenhum tamanho pedido nesse período.
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Demanda atual</h2>
          <div className="inline-flex w-fit shrink-0 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            {VALID_PERIODS.map((d) => (
              <Link
                key={d}
                href={`/admin/dashboard?periodo=${d}`}
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
          <RankingList
            title="Mais visualizados"
            items={maisVisualizadosWithCover}
            metricLabel="visualizações"
            metricLabelMobile="Views"
            MetricIcon={Eye}
            days={periodo}
            emptyTitle={
              <>
                Sem visitas registradas
                <br className="lg:hidden" /> nesse período
              </>
            }
            emptyMessage={
              <>
                Compartilhe o link da sua vitrine
                <br className="lg:hidden" />
                <span className="hidden lg:inline"> — </span>é o que traz gente pra ver seus produtos.
              </>
            }
          />
          <div className="hidden self-stretch border-l border-gray-200 md:block dark:border-gray-800" aria-hidden="true" />
          <div className="border-t border-gray-200 pt-6 md:border-t-0 md:pt-0 dark:border-gray-800">
            <RankingList
              title="Cliques no WhatsApp"
              items={cliquesWhatsappWithCover}
              metricLabel="cliques"
              MetricIcon={MessageCircle}
              days={periodo}
              emptyTitle={
                <>
                  Sem pedidos no WhatsApp
                  <br className="lg:hidden" /> nesse período
                </>
              }
              emptyMessage={
                <>
                  Fotos nítidas e preços visíveis
                  <br className="lg:hidden" /> ajudam a transformar visitas em pedidos.
                </>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
