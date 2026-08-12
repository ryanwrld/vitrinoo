import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveCoverFrame } from "@/lib/store/cover-frame";
import { queryPublicProducts, resolveSort } from "@/lib/products/public-list";
import { queryFavoriteProducts, parseFavoriteIds } from "@/lib/products/public-favorites";
import { queryStorefrontProfile, EMPTY_PROFILE } from "@/lib/store/storefront-profile";
import { EmptyState } from "@/components/empty-state";
import { StoreHero } from "./store-hero";
import { ProductGrid } from "./product-grid";
import { FilterBar } from "./filter-bar";
import { FavoritesView } from "./favorites-view";
import { ClearFiltersButton } from "./clear-filters-button";
import { LoadMoreButton } from "./load-more-button";
import { PaginationNumbered } from "./pagination-numbered";
import { ProductModal } from "./product-modal";
import { ProductViewTracker } from "./product-view-tracker";
import { loadProductDetail } from "./[produto]/product-detail-data";
import { ProductOrderPanel } from "./[produto]/product-order-panel";
import { ProductNotFoundContent } from "./[produto]/product-not-found-content";

/**
 * Vitrine pública — Server Component sem NENHUMA checagem de auth. Esta
 * rota prova, por construção, que a vitrine pública (Fase 4) nunca é
 * bloqueada por login (restrição rígida do PROJECT.md/CLAUDE.md, SC-7) — o
 * matcher do middleware (`/admin/:path*`) já torna esta rota inalcançável
 * por ele, e nenhuma checagem de sessão é adicionada aqui.
 *
 * NUNCA adicionar a diretiva de cache do App Router nesta rota nem em
 * public-list.ts — o estoque precisa refletir o painel do revendedor com
 * delay de segundos (VITR-03, CLAUDE.md), e Cache Components do Next 16 é
 * opt-in por padrão (basta nunca optar por cache aqui).
 *
 * createClient() (mesmo helper server-side de sempre) funciona sem sessão
 * nesta rota — sem cookie de sessão presente, o Postgres resolve o papel
 * como `anon` automaticamente, consumindo as policies RLS públicas do
 * Plan 04-01.
 *
 * `searchParams` (q/brand/sole/fulfillment/page) são a única fonte de
 * verdade dos filtros (VITR-02) e da paginação (VITR-04) — múltiplos
 * valores do mesmo nome chegam como array no App Router; `toArray`
 * normaliza para o caso de um único valor (que chega como string simples,
 * não array). `page` é 1-based (mesma convenção de public-list.ts).
 *
 * Paginação adaptativa (D-05): ambos os controles são renderizados no
 * servidor, a decisão de qual aparece é 100% CSS (`hidden md:flex` /
 * `flex md:hidden`) — nunca detecção de device em JS.
 */
type LojaSearchParams = {
  q?: string;
  brand?: string | string[];
  sole?: string | string[];
  fulfillment?: string | string[];
  page?: string;
  /** Ordenação (recentes | menor_preco | maior_preco). */
  sort?: string;
  /** Abre o produto como modal sobre o grid quando presente (UUID). */
  produto?: string;
  /** Lista de ids favoritados (localStorage do comprador, ver
   *  favorites-store.ts) separados por vírgula — presente = aba Favoritos
   *  ativa em vez do catálogo filtrado normal. */
  ids?: string;
};

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<LojaSearchParams>;
};

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function LojaPublicaPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, name, slug, logo_url, cover_url, cover_band_ratio, cover_zoom, cover_pos_x, cover_pos_y, accent_color, tagline, instagram, timezone, hide_sold_out_default")
    .eq("slug", slug)
    .single();

  if (storeError || !store) {
    notFound();
  }

  // Aba Favoritos (Nível 2 do roadmap de valor): `?ids=` presente e válido
  // troca o modo de exibição inteiro — bypassa busca/marca/solado/entrega/
  // paginação, que não fazem sentido sobre uma lista fixa de favoritos.
  // `parseFavoriteIds` já filtra qualquer valor que não seja UUID antes de
  // qualquer `.in()` (mesma disciplina de VALID_BRANDS em public-list.ts).
  const favoriteIds = parseFavoriteIds(sp.ids);
  const favoritesActive = favoriteIds.length > 0;
  const favoritesQueryString = favoritesActive ? `ids=${favoriteIds.join(",")}` : "";

  const brands = toArray(sp.brand);
  const soles = toArray(sp.sole);
  const fulfillments = toArray(sp.fulfillment);
  const page = Number(sp.page ?? "1") || 1;
  const sort = resolveSort(sp.sort);
  const filters = { q: sp.q, brand: brands, sole: soles, fulfillment: fulfillments, sort };

  const { products, hasMore } = favoritesActive
    ? { products: [], hasMore: false }
    : await queryPublicProducts(supabase, store.id, { ...filters, page }, store.hide_sold_out_default);

  let favoriteProducts: Awaited<ReturnType<typeof queryFavoriteProducts>> = [];
  let favoritesWhatsappE164 = "";
  if (favoritesActive) {
    const [products, { data: storeSettings }] = await Promise.all([
      queryFavoriteProducts(supabase, store.id, favoriteIds),
      supabase.from("store_settings").select("whatsapp_e164").eq("store_id", store.id).single(),
    ]);
    favoriteProducts = products;
    favoritesWhatsappE164 = storeSettings?.whatsapp_e164 ?? "";
  }

  const productsWithCoverUrl = products.map((product) => ({
    ...product,
    coverUrl: product.coverPath
      ? supabase.storage.from("product-images").getPublicUrl(product.coverPath).data.publicUrl
      : null,
  }));

  // Dois empty states distintos (mesma disciplina do painel admin): "loja
  // sem produtos publicados ainda" (independente de filtro) vs. "filtro sem
  // resultado" — nunca a mesma mensagem para os dois casos.
  const { count: totalPublished } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("store_id", store.id)
    .eq("status", "published");

  const hasAnyPublished = (totalPublished ?? 0) > 0;
  const hasFilteredResults = productsWithCoverUrl.length > 0;

  // Marcas do filtro + os três números do cartão de perfil, numa consulta
  // só: as duas coisas precisam exatamente das mesmas linhas de `products`,
  // e esta rota não tem cache nenhum (o estoque precisa refletir o painel em
  // segundos), então ler o catálogo duas vezes seria pagar em dobro a cada
  // carregamento. Só faz sentido consultar quando a loja tem algo publicado.
  const profile = hasAnyPublished
    ? await queryStorefrontProfile(supabase, store.id, store.hide_sold_out_default)
    : EMPTY_PROFILE;

  // Distingue "loja vazia" de "filtro sem resultado": o empty state do
  // segundo caso precisa oferecer a saída (limpar filtros), não só informar.
  const hasActiveFilters =
    Boolean(sp.q) || brands.length > 0 || soles.length > 0 || fulfillments.length > 0;

  // Query string atual (filtros) SEM "page" — reusada pela paginação numerada
  // (anterior/próxima) e pelos cards do grid (link "?produto=<id>" preserva
  // o filtro ativo ao abrir o modal).
  const filterSearchParams = new URLSearchParams();
  if (sp.q) filterSearchParams.set("q", sp.q);
  brands.forEach((value) => filterSearchParams.append("brand", value));
  soles.forEach((value) => filterSearchParams.append("sole", value));
  fulfillments.forEach((value) => filterSearchParams.append("fulfillment", value));
  const searchParamsString = filterSearchParams.toString();

  // Modal do produto: query param `produto`, resolvido com o MESMO helper
  // da página cheia (`[produto]/page.tsx`) — sem query duplicada, guard de
  // visibilidade (rascunho/esgotado oculto) idêntico nos dois caminhos.
  const productDetail = sp.produto ? await loadProductDetail(slug, sp.produto) : null;

  return (
    <main className="flex min-h-dvh w-full flex-col bg-white">
      <StoreHero
        store={{
          name: store.name,
          slug: store.slug,
          logoUrl: store.logo_url,
          coverUrl: store.cover_url,
          accentColor: store.accent_color,
          tagline: store.tagline,
          instagram: store.instagram,
          coverFrame: resolveCoverFrame({
            bandRatio: store.cover_band_ratio,
            zoom: store.cover_zoom,
            posX: store.cover_pos_x,
            posY: store.cover_pos_y,
          }),
          timezone: store.timezone,
        }}
        stats={{
          modelCount: profile.modelCount,
          minPrice: profile.minPrice,
          lastUpdatedAt: profile.lastUpdatedAt,
        }}
      />

      {/* Centralizado (decisão do usuário), mas com teto LARGO: 1600px, não
          os 1024px de antes. Em `max-w-5xl` as mesmas 8 colunas dariam cards
          de 116px; 1600px é o ponto escolhido entre margem visível (~160px de
          cada lado numa tela de 1920px) e card legível (~184px). Abaixo de
          1600px o teto nem entra em jogo e a página usa a largura inteira.
          Este valor e o padding (`px-4 sm:px-6 md:px-12 lg:px-20 xl:px-24
          2xl:px-28`) são os MESMOS do cabeçalho e
          da barra fixa de propósito: é o par que define a coluna onde logo,
          nome da loja, busca e primeiro produto se alinham. Mudar um sem os
          outros desalinha a página inteira. */}
      <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-5 px-4 py-5 sm:px-6 md:px-12 lg:px-20 xl:px-24 2xl:px-28">
        {hasAnyPublished && (
          <FilterBar
            slug={slug}
            currentParams={{ q: sp.q, brand: brands, sole: soles, fulfillment: fulfillments, sort }}
            brandFacets={profile.brandFacets}
            accentColor={store.accent_color ?? "#000000"}
            resultCount={productsWithCoverUrl.length}
            favoritesActive={favoritesActive}
          />
        )}

        {favoritesActive ? (
          favoriteProducts.length > 0 ? (
            <FavoritesView
              slug={slug}
              whatsappE164={favoritesWhatsappE164}
              products={favoriteProducts}
              query={favoritesQueryString}
              accentColor={store.accent_color ?? "#000000"}
            />
          ) : (
            // ids veio preenchido mas nenhum produto casou: os favoritos
            // guardados no navegador do comprador foram excluídos/viraram
            // rascunho — distinto de "nunca favoritou nada" (esse caso nem
            // chega aqui, o toggle da filter-bar bloqueia a navegação antes).
            <EmptyState
              icon="search"
              title="Nenhum favorito encontrado"
              description="Os produtos que você favoritou não estão mais disponíveis nesta loja."
            />
          )
        ) : hasFilteredResults ? (
          <>
            <ProductGrid products={productsWithCoverUrl} slug={slug} query={searchParamsString} />

            <div className="hidden md:flex md:justify-center">
              <PaginationNumbered slug={slug} currentPage={page} hasMore={hasMore} searchParamsString={searchParamsString} />
            </div>
            <div className="flex md:hidden">
              <LoadMoreButton slug={slug} initialPage={page} initialHasMore={hasMore} filters={filters} />
            </div>
          </>
        ) : hasActiveFilters ? (
          <EmptyState
            icon="search"
            title="Nenhum produto com esses filtros"
            description="Tente remover algum filtro ou buscar outro termo."
            action={<ClearFiltersButton slug={slug} accentColor={store.accent_color ?? "#000000"} />}
          />
        ) : hasAnyPublished ? (
          // Sem filtro ativo e sem resultado: a loja publicou produtos, mas
          // todos estão esgotados e ocultos pela regra de visibilidade —
          // caso distinto de "ainda não cadastrou nada".
          <EmptyState
            icon="box"
            title="Nenhum produto disponível agora"
            description="Os modelos desta loja estão esgotados no momento. Volte em breve."
          />
        ) : (
          <EmptyState
            icon="box"
            title="Essa loja ainda não tem produtos"
            description="Volte em breve — o vendedor está preparando a vitrine."
          />
        )}
      </div>

      {productDetail && (
        <ProductModal>
          {productDetail.ok ? (
            <ProductOrderPanel {...productDetail.panel} variant="modal" />
          ) : (
            <ProductNotFoundContent backHref={`/${slug}`} variant="modal" />
          )}
        </ProductModal>
      )}

      {/* Visita ao produto (métrica "Mais visualizados" do painel). Precisa
          morar aqui, e não no PageviewTracker do layout: layouts não
          re-renderizam quando só a query string muda, então lá o
          `?produto=` chegava sempre nulo. Só conta produto REAL — um id
          inválido na URL não é visualização de nada. */}
      {productDetail?.ok && (
        <ProductViewTracker storeId={productDetail.storeId} productId={productDetail.productId} />
      )}
    </main>
  );
}
