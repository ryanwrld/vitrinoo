import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding-guard";
import { createClient } from "@/lib/supabase/server";
import { queryProducts, type QueryProductsParams } from "@/lib/products/list";
import { queryRecentActivity, HEADER_FEED_LIMIT } from "@/lib/dashboard/metrics";
import { EmptyState } from "@/components/empty-state";
import { HeaderActions } from "@/components/header-actions";
import { ProductList } from "./product-list";
import { ProductToolbar } from "./product-toolbar";

type ProdutosSearchParams = {
  q?: string;
  status?: string;
  brand?: string;
  sole?: string;
  sort?: string;
};

/**
 * Rota `/admin/produtos` — listagem com busca/filtro/ordenação (PROD-06, Plan
 * 03-06, 03-RESEARCH.md Pattern 3). Totalmente dinâmica (NUNCA
 * `"use cache"` — mesma disciplina de `/admin/configuracoes`/Plan 03-02) para que
 * produtos recém-salvos/editados/publicados apareçam imediatamente.
 *
 * `searchParams` (q/status/brand/sole/sort) são a única fonte de verdade dos
 * filtros — abrir a URL filtrada reproduz exatamente a mesma visualização
 * (must_have do plano). `queryProducts` (src/lib/products/list.ts) já
 * escopa por `store_id` do dono (T-03-13); esta rota só resolve a loja e
 * repassa os params já parseados.
 *
 * Dois empty states distintos (03-UI-SPEC.md §Copywriting): "nenhum produto
 * cadastrado ainda" quando a loja não tem NENHUM produto (independente de
 * filtro); "nenhum produto encontrado" quando existem produtos na loja mas
 * o filtro/busca atual não bateu com nenhum. A distinção exige uma segunda
 * contagem (`totalCount`, sem filtro nenhum) além do resultado filtrado.
 *
 * A toolbar de busca/filtro/ordenação (`<ProductToolbar>`, Plan 03-06 Task 3)
 * só é renderizada quando a loja já tem pelo menos 1 produto — não há o que
 * filtrar/buscar quando o catálogo está vazio.
 */
export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<ProdutosSearchParams>;
}) {
  await requireCompletedOnboarding();

  const params = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", userData.user!.id)
    .single();

  if (!store) {
    redirect("/admin/onboarding");
  }

  const queryParams: QueryProductsParams = {
    q: params.q,
    status: params.status,
    brand: params.brand,
    sole: params.sole,
    sort: params.sort,
  };

  // O feed alimenta o pop-up do sino no cabeçalho — ele agora abre em toda
  // rota do painel, não só no Dashboard, então cada rota precisa buscar os
  // próprios itens. Em paralelo com a listagem: são consultas independentes.
  const [products, headerFeed] = await Promise.all([
    queryProducts(supabase, store.id, queryParams),
    queryRecentActivity(supabase, store.id, HEADER_FEED_LIMIT),
  ]);

  const { count: totalCount } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("store_id", store.id);

  const hasAnyProduct = (totalCount ?? 0) > 0;
  const hasFilteredResults = products.length > 0;

  const productsWithCoverUrl = products.map((product) => ({
    ...product,
    coverUrl: product.coverPath
      ? supabase.storage.from("product-images").getPublicUrl(product.coverPath).data.publicUrl
      : null,
  }));

  return (
    // Mesmo respiro do Dashboard e sem `mx-auto` — ver o comentário em
    // configuracoes/page.tsx: centralizar faria a distância até a sidebar
    // variar com a largura da janela e desalinhar o h1 entre as rotas.
    //
    // O CONTAINER é largura total (sem max-w) só pra que o `HeaderActions`
    // encoste na borda direita da tela, na mesma posição de toda outra rota
    // do painel — se ele herdasse o `max-w-4xl` da lista, os três ícones
    // pulariam de lugar ao navegar Dashboard → Produtos. O `max-w-4xl` desceu
    // pra coluna de conteúdo abaixo, que é quem realmente precisa dele.
    <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">Produtos</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {totalCount ?? 0} {(totalCount ?? 0) === 1 ? "produto cadastrado" : "produtos cadastrados"}
          </p>
        </div>
        <HeaderActions activityFeed={headerFeed.items} />
      </div>

      <div className="flex w-full max-w-4xl flex-col gap-6">
      {/* "Novo produto" saiu da linha do h1: os três ícones do cabeçalho
          ocupam a direita agora, e disputar essa borda faria o botão mais
          importante da tela brigar por espaço com controles utilitários. */}
      <Link
        href="/admin/produtos/novo"
        className="w-full shrink-0 rounded-md bg-primary px-5 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow active:translate-y-0 active:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 sm:w-auto sm:self-start"
      >
        Novo produto
      </Link>

      {hasAnyProduct && (
        <div className="flex flex-col gap-2">
          <ProductToolbar currentParams={params} />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {products.length} {products.length === 1 ? "produto" : "produtos"}
          </p>
        </div>
      )}

      {hasFilteredResults ? (
        <ProductList products={productsWithCoverUrl} />
      ) : hasAnyProduct ? (
        <EmptyState
          icon="search"
          title="Nenhum produto encontrado"
          description="Tente ajustar os filtros ou buscar por outro termo."
        />
      ) : (
        <EmptyState
          icon="box"
          title="Nenhum produto ainda"
          description="Cadastre seu primeiro produto para começar a vender pelo WhatsApp."
          action={
            <Link
              href="/admin/produtos/novo"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
            >
              Cadastrar produto
            </Link>
          }
        />
      )}
      </div>
    </div>
  );
}
