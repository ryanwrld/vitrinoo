import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Agregações de métricas do dashboard (MTR-01, 06-03-PLAN.md Task 2,
 * 06-PATTERNS.md §metrics.ts). Funções PURAS que recebem o `supabase` já
 * autenticado do chamador (mesma disciplina de `queryProducts` em
 * src/lib/products/list.ts — nunca criam client próprio), para serem
 * testáveis diretamente fora do Server Component
 * (`tests/dashboard/metrics-aggregation.test.ts`).
 *
 * `storeId` é sempre passado explicitamente e aplicado via `.eq(...)`
 * (mesma defesa em profundidade de T-03-13/T-06-08) — a RLS
 * (`owner_read_pageviews`/views `security_invoker=true` da migration 0006)
 * é a rede final: um `storeId` de outra loja nunca retorna dado, mesmo que
 * o storeId em si seja um valor válido de outra loja.
 *
 * `total`/`disponível`/`esgotado`/`recentes` NÃO são recalculados aqui —
 * esses vêm de `queryProducts` chamado diretamente no page.tsx
 * (06-RESEARCH.md "Don't Hand-Roll", zero SQL nova para isso).
 */

export type TopViewedProduct = {
  productId: string;
  name: string;
  secondary: string;
  views: number;
  coverPath: string | null;
};

export type TopOrderClickProduct = {
  productId: string;
  name: string;
  secondary: string;
  clicks: number;
  coverPath: string | null;
};

/**
 * Conta só os acessos ao grid principal da vitrine (`product_id is null`,
 * D-01) — visualização de um produto específico NUNCA soma nesse contador
 * geral (essa é a responsabilidade de `queryTopViewedProducts`).
 */
export async function queryAccessCount(supabase: SupabaseClient<Database>, storeId: string): Promise<number> {
  const { count } = await supabase
    .from("pageviews")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .is("product_id", null);

  return count ?? 0;
}

/**
 * Deriva a linha secundária de marca/linha exibida abaixo do nome do
 * produto — mesmo espírito do `secondaryLine` de `product-list.tsx`
 * (brand_other quando `brand === "Outra"`, senão brand; + line quando
 * houver).
 */
function buildSecondaryLine(product: { brand: string; brand_other: string | null; line: string | null }): string {
  const brandLabel = product.brand === "Outra" && product.brand_other ? product.brand_other : product.brand;
  return [brandLabel, product.line].filter(Boolean).join(" · ");
}

/**
 * Top-10 de produtos mais visualizados (D-08), consultando a view
 * `product_pageview_counts` (migration 0006) e resolvendo o nome via join
 * em memória com `products` — a view NUNCA embute o nome (06-PATTERNS.md).
 * `limit(10)` é uma constante fixa no código (D-10/V5) — nunca aceita via
 * input do usuário, para prevenir enumeração/DoS por limite arbitrário
 * (T-06-09).
 */
export async function queryTopViewedProducts(
  supabase: SupabaseClient<Database>,
  storeId: string
): Promise<TopViewedProduct[]> {
  const { data: topViews } = await supabase
    .from("product_pageview_counts")
    .select("product_id, views")
    .eq("store_id", storeId)
    .order("views", { ascending: false })
    .limit(10);

  const rankedRows = (topViews ?? []).filter(
    (row): row is { product_id: string; views: number } => row.product_id !== null && row.views !== null
  );
  if (rankedRows.length === 0) {
    return [];
  }

  const productIds = rankedRows.map((row) => row.product_id);
  const { data: products } = await supabase
    .from("products")
    .select("id, name, brand, brand_other, line")
    .in("id", productIds);

  // Busca a foto de capa de cada produto (position asc, primeira = capa)
  const { data: photoRows } = await supabase
    .from("product_photos")
    .select("product_id, storage_path, position")
    .in("product_id", productIds)
    .order("position", { ascending: true });

  const coverPathByProductId = new Map<string, string>();
  for (const photo of photoRows ?? []) {
    if (!coverPathByProductId.has(photo.product_id)) {
      coverPathByProductId.set(photo.product_id, photo.storage_path);
    }
  }

  const productById = new Map((products ?? []).map((product) => [product.id, product]));

  return rankedRows.flatMap((row) => {
    const product = productById.get(row.product_id);
    if (!product) return [];
    return [
      {
        productId: row.product_id,
        name: product.name,
        secondary: buildSecondaryLine(product),
        views: row.views,
        coverPath: coverPathByProductId.get(row.product_id) ?? null,
      },
    ];
  });
}

/**
 * Top-10 de produtos com mais cliques no botão "Pedir agora" (D-09),
 * consultando a view `product_order_click_counts` (migration 0006) —
 * mesmo padrão de `queryTopViewedProducts`, mas NUNCA fundida com ela: são
 * duas listas paralelas e independentes (D-08/D-09).
 */
export async function queryTopOrderClickProducts(
  supabase: SupabaseClient<Database>,
  storeId: string
): Promise<TopOrderClickProduct[]> {
  const { data: topClicks } = await supabase
    .from("product_order_click_counts")
    .select("product_id, clicks")
    .eq("store_id", storeId)
    .order("clicks", { ascending: false })
    .limit(10);

  const rankedRows = (topClicks ?? []).filter(
    (row): row is { product_id: string; clicks: number } => row.product_id !== null && row.clicks !== null
  );
  if (rankedRows.length === 0) {
    return [];
  }

  const productIds = rankedRows.map((row) => row.product_id);
  const { data: products } = await supabase
    .from("products")
    .select("id, name, brand, brand_other, line")
    .in("id", productIds);

  // Busca a foto de capa de cada produto (position asc, primeira = capa)
  const { data: photoRows } = await supabase
    .from("product_photos")
    .select("product_id, storage_path, position")
    .in("product_id", productIds)
    .order("position", { ascending: true });

  const coverPathByProductId = new Map<string, string>();
  for (const photo of photoRows ?? []) {
    if (!coverPathByProductId.has(photo.product_id)) {
      coverPathByProductId.set(photo.product_id, photo.storage_path);
    }
  }

  const productById = new Map((products ?? []).map((product) => [product.id, product]));

  return rankedRows.flatMap((row) => {
    const product = productById.get(row.product_id);
    if (!product) return [];
    return [
      {
        productId: row.product_id,
        name: product.name,
        secondary: buildSecondaryLine(product),
        clicks: row.clicks,
        coverPath: coverPathByProductId.get(row.product_id) ?? null,
      },
    ];
  });
}

// =============================================================================
// v1.1 — Dashboard de Tendência (MTR-03..MTR-10)
//
// As três funções abaixo substituem, na UI do dashboard, o uso de
// queryAccessCount/queryTopViewedProducts/queryTopOrderClickProducts
// (mantidas acima, intocadas, porque tests/dashboard/metrics-aggregation.test.ts
// as testa diretamente — remover seria descartar cobertura sem necessidade).
// =============================================================================

/**
 * Início do dia civil em horário de Brasília, expresso como instante UTC
 * correto. Brasil não observa horário de verão desde 2019 (Decreto
 * 9.826/2019), então o offset fixo -03:00 é seguro sem depender de uma lib
 * de timezone — simplificação consciente, não uma tabela de timezone por
 * loja (fora de escopo do v1.1).
 */
function startOfTodayBR(referenceMs: number = Date.now()): Date {
  const BR_OFFSET_MS = 3 * 60 * 60 * 1000;
  const shifted = new Date(referenceMs - BR_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() + BR_OFFSET_MS);
}

export type TodayStats = {
  views: number;
  clicks: number;
  conversionPct: number;
};

/**
 * MTR-03: views/cliques/conversão sempre relativos a hoje (dia civil BR),
 * nunca acumulado histórico. `views` conta TODO pageview de hoje (grid +
 * produto) — diferente de `queryAccessCount`, que isola só o grid (D-01);
 * aqui o objetivo é "quanto minha loja se moveu hoje", não o contador
 * histórico do card antigo.
 */
export async function queryTodayStats(supabase: SupabaseClient<Database>, storeId: string): Promise<TodayStats> {
  const start = startOfTodayBR().toISOString();

  const [{ count: views }, { count: clicks }] = await Promise.all([
    supabase.from("pageviews").select("id", { count: "exact", head: true }).eq("store_id", storeId).gte("created_at", start),
    supabase.from("order_clicks").select("id", { count: "exact", head: true }).eq("store_id", storeId).gte("created_at", start),
  ]);

  const viewsCount = views ?? 0;
  const clicksCount = clicks ?? 0;
  const conversionPct = viewsCount > 0 ? Math.round((clicksCount / viewsCount) * 100) : 0;

  return { views: viewsCount, clicks: clicksCount, conversionPct };
}

export type ActivityFeedItem =
  | { type: "click"; productId: string; productName: string; createdAt: string }
  | { type: "view"; productId: string; productName: string; count: number; createdAt: string };

export type ActivityFeedPage = {
  items: ActivityFeedItem[];
  hasMore: boolean;
};

/**
 * MTR-04: feed cronológico substituindo "Produtos recentes". Cliques viram
 * 1 linha cada (sinal de intenção, baixo volume); pageviews são agrupados
 * por produto+hora (bucket determinístico via prefixo do timestamp) pra
 * não virar 1 linha por view individual numa loja de tráfego alto — mesma
 * preocupação de escala já levantada no mockup (30-500 produtos).
 */
export async function queryRecentActivity(
  supabase: SupabaseClient<Database>,
  storeId: string,
  limit: number,
  offset = 0
): Promise<ActivityFeedPage> {
  const overfetch = offset + limit + 20;

  const [{ data: clickRows }, { data: viewRows }] = await Promise.all([
    supabase
      .from("order_clicks")
      .select("id, product_id, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(overfetch),
    supabase
      .from("pageviews")
      .select("id, product_id, created_at")
      .eq("store_id", storeId)
      .not("product_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(overfetch),
  ]);

  const productIds = new Set<string>();
  for (const row of clickRows ?? []) productIds.add(row.product_id);
  for (const row of viewRows ?? []) if (row.product_id) productIds.add(row.product_id);

  const { data: products } =
    productIds.size > 0
      ? await supabase.from("products").select("id, name").in("id", Array.from(productIds))
      : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((products ?? []).map((p) => [p.id, p.name]));

  const clickItems: ActivityFeedItem[] = (clickRows ?? []).map((row) => ({
    type: "click",
    productId: row.product_id,
    productName: nameById.get(row.product_id) ?? "Produto",
    createdAt: row.created_at,
  }));

  const viewBuckets = new Map<string, { productId: string; count: number; latest: string }>();
  for (const row of viewRows ?? []) {
    if (!row.product_id) continue;
    const hourBucket = row.created_at.slice(0, 13); // "YYYY-MM-DDTHH" — mesmo formato em toda linha (vem do mesmo client)
    const key = `${row.product_id}:${hourBucket}`;
    const existing = viewBuckets.get(key);
    if (existing) {
      existing.count += 1;
      if (row.created_at > existing.latest) existing.latest = row.created_at;
    } else {
      viewBuckets.set(key, { productId: row.product_id, count: 1, latest: row.created_at });
    }
  }
  const viewItems: ActivityFeedItem[] = Array.from(viewBuckets.values()).map((bucket) => ({
    type: "view",
    productId: bucket.productId,
    productName: nameById.get(bucket.productId) ?? "Produto",
    count: bucket.count,
    createdAt: bucket.latest,
  }));

  const merged = [...clickItems, ...viewItems].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return {
    items: merged.slice(offset, offset + limit),
    hasMore: merged.length > offset + limit,
  };
}

export type TrendRankingItem = {
  productId: string;
  name: string;
  secondary: string;
  price: number;
  disponivel: boolean;
  coverPath: string | null;
  current: number;
  /**
   * Porcentagem de tendência (o selo do ranking) — compara a janela atual com a
   * janela anterior de mesmo tamanho. `deltaPct` é a VARIAÇÃO da porcentagem de
   * tendência (+ subiu, − caiu); fica null quando `isNew`, pois sem período
   * anterior não há variação pra calcular. `isNew` = teve 0 na janela anterior
   * e passou a ter movimento agora → o selo mostra "Novo" no lugar do %.
   */
  deltaPct: number | null;
  isNew: boolean;
  /** Contagem por dia dentro do período atual (length === days) — alimenta o sparkline sem query extra, reaproveitando as linhas já buscadas pro cálculo de tendência. */
  trend: number[];
};

const TREND_MIN_CURRENT = 2; // piso pra entrar no ranking — corta ruído e evita porcentagem de tendência enganosa com número quase zero

/**
 * MTR-06..MTR-10: ranking por TENDÊNCIA (período atual vs. período anterior
 * de mesma duração), não soma acumulada — `queryTopViewedProducts`/
 * `queryTopOrderClickProducts` continuam existindo (all-time), mas não
 * alimentam mais o dashboard.
 *
 * Uma única query busca os eventos em `[hoje - 2*days, hoje]` e faz TUDO em
 * memória (contagem atual, contagem anterior, série diária pro sparkline) —
 * mesmo padrão "duas queries + junção em memória" já estabelecido no
 * projeto (03-RESEARCH.md "Don't Hand-Roll"), sem tabela nova.
 */
export async function queryTrendRanking(
  supabase: SupabaseClient<Database>,
  storeId: string,
  metric: "views" | "clicks",
  days: 7 | 15 | 30
): Promise<TrendRankingItem[]> {
  const table = metric === "views" ? "pageviews" : "order_clicks";
  const dayMs = 24 * 60 * 60 * 1000;

  const todayStart = startOfTodayBR();
  const periodStartMs = todayStart.getTime() - days * dayMs;
  const priorStartMs = todayStart.getTime() - days * 2 * dayMs;

  let query = supabase
    .from(table)
    .select("product_id, created_at")
    .eq("store_id", storeId)
    .gte("created_at", new Date(priorStartMs).toISOString());

  if (metric === "views") {
    query = query.not("product_id", "is", null);
  }

  const { data: rows } = await query;

  const stats = new Map<string, { current: number; prior: number; daily: number[] }>();
  for (const row of rows ?? []) {
    const productId = row.product_id as string | null;
    if (!productId) continue;

    const entry = stats.get(productId) ?? { current: 0, prior: 0, daily: new Array(days).fill(0) };
    const ts = new Date(row.created_at).getTime();

    if (ts >= periodStartMs) {
      entry.current += 1;
      const dayIndex = Math.min(days - 1, Math.floor((ts - periodStartMs) / dayMs));
      entry.daily[dayIndex] += 1;
    } else {
      entry.prior += 1;
    }
    stats.set(productId, entry);
  }

  const candidates = Array.from(stats.entries())
    .map(([productId, { current, prior, daily }]) => {
      const isNew = prior === 0 && current > 0;
      const deltaPct = isNew ? null : prior === 0 ? 0 : Math.round(((current - prior) / prior) * 100);
      return { productId, current, prior, daily, isNew, deltaPct };
    })
    .filter((candidate) => candidate.current >= TREND_MIN_CURRENT);

  if (candidates.length === 0) {
    return [];
  }

  // Pondera a variação da porcentagem de tendência com volume (raiz quadrada) — sem isso, um
  // produto de 3→6 eventos (+100%) furaria na frente de um de 50→80
  // (+60%), mesmo o segundo sendo objetivamente mais relevante.
  const scored = candidates
    .map((candidate) => {
      const pctForScore = candidate.isNew ? 150 : Math.max(candidate.deltaPct ?? 0, 0);
      return { ...candidate, score: pctForScore * Math.sqrt(candidate.current) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const productIds = scored.map((candidate) => candidate.productId);

  const [{ data: products }, { data: sizeRows }, { data: photoRows }] = await Promise.all([
    supabase.from("products").select("id, name, brand, brand_other, line, price").in("id", productIds),
    supabase.from("product_sizes").select("product_id, available").in("product_id", productIds),
    supabase
      .from("product_photos")
      .select("product_id, storage_path, position")
      .in("product_id", productIds)
      .order("position", { ascending: true }),
  ]);

  const availableProductIds = new Set((sizeRows ?? []).filter((row) => row.available).map((row) => row.product_id));
  const coverPathByProductId = new Map<string, string>();
  for (const photo of photoRows ?? []) {
    if (!coverPathByProductId.has(photo.product_id)) {
      coverPathByProductId.set(photo.product_id, photo.storage_path);
    }
  }
  const productById = new Map((products ?? []).map((product) => [product.id, product]));

  return scored.flatMap((candidate) => {
    const product = productById.get(candidate.productId);
    if (!product) return [];
    return [
      {
        productId: candidate.productId,
        name: product.name,
        secondary: buildSecondaryLine(product),
        price: product.price,
        disponivel: availableProductIds.has(candidate.productId),
        coverPath: coverPathByProductId.get(candidate.productId) ?? null,
        current: candidate.current,
        deltaPct: candidate.deltaPct,
        isNew: candidate.isNew,
        trend: candidate.daily,
      },
    ];
  });
}

export type SizeDemandItem = {
  size: number;
  count: number;
};

/**
 * Demanda por tamanho, cruzando todos os produtos da loja — `order_clicks.size`
 * é gravado em todo pedido (`order-clicks-actions.ts`) mas nunca lido em
 * nenhuma métrica hoje. É o padrão que o revendedor sente ("o 42 sempre
 * falta") mas nunca viu consolidado, porque o dado fica só por produto,
 * nunca agregado pela loja inteira. `days` reaproveita o MESMO filtro
 * 7d/15d/30d do Ranking de tendência (mesmo `periodo` do searchParam) — sem
 * seletor de período próprio, pra não duplicar controle na mesma tela.
 */
export async function querySizeDemand(
  supabase: SupabaseClient<Database>,
  storeId: string,
  days = 30
): Promise<SizeDemandItem[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("order_clicks")
    .select("size")
    .eq("store_id", storeId)
    .gte("created_at", cutoff);

  const counts = new Map<number, number>();
  for (const row of data ?? []) {
    counts.set(row.size, (counts.get(row.size) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([size, count]) => ({ size, count }))
    .sort((a, b) => b.count - a.count);
}
