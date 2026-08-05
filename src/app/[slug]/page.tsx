import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { queryPublicProducts } from "@/lib/products/public-list";
import { EmptyState } from "@/components/empty-state";
import { StoreHero } from "./store-hero";
import { ProductGrid } from "./product-grid";
import { ProductFilters } from "./product-filters";
import { LoadMoreButton } from "./load-more-button";
import { PaginationNumbered } from "./pagination-numbered";

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
    .select("id, name, logo_url, accent_color, tagline, hide_sold_out_default")
    .eq("slug", slug)
    .single();

  if (storeError || !store) {
    notFound();
  }

  const brands = toArray(sp.brand);
  const soles = toArray(sp.sole);
  const fulfillments = toArray(sp.fulfillment);
  const page = Number(sp.page ?? "1") || 1;
  const filters = { q: sp.q, brand: brands, sole: soles, fulfillment: fulfillments };

  const { products, hasMore } = await queryPublicProducts(
    supabase,
    store.id,
    { ...filters, page },
    store.hide_sold_out_default
  );

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

  // Query string atual (filtros) SEM "page" — reusada pela paginação numerada
  // para montar os links anterior/próxima preservando o filtro ativo.
  const filterSearchParams = new URLSearchParams();
  if (sp.q) filterSearchParams.set("q", sp.q);
  brands.forEach((value) => filterSearchParams.append("brand", value));
  soles.forEach((value) => filterSearchParams.append("sole", value));
  fulfillments.forEach((value) => filterSearchParams.append("fulfillment", value));
  const searchParamsString = filterSearchParams.toString();

  return (
    <main className="flex min-h-dvh w-full flex-col bg-white">
      <StoreHero
        store={{
          name: store.name,
          logoUrl: store.logo_url,
          accentColor: store.accent_color,
          tagline: store.tagline,
        }}
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
        {hasAnyPublished && <ProductFilters slug={slug} currentParams={filters} />}

        {hasFilteredResults ? (
          <>
            <ProductGrid products={productsWithCoverUrl} slug={slug} />

            <div className="hidden md:flex md:justify-center">
              <PaginationNumbered slug={slug} currentPage={page} hasMore={hasMore} searchParamsString={searchParamsString} />
            </div>
            <div className="flex md:hidden">
              <LoadMoreButton slug={slug} initialPage={page} initialHasMore={hasMore} filters={filters} />
            </div>
          </>
        ) : hasAnyPublished ? (
          <EmptyState
            icon="search"
            title="Nada encontrado"
            description="Tente outro termo ou remova os filtros aplicados."
          />
        ) : (
          <EmptyState
            icon="box"
            title="Essa loja ainda não tem produtos"
            description="Volte em breve — o vendedor está preparando a vitrine."
          />
        )}
      </div>
    </main>
  );
}
