import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding-guard";
import { createClient } from "@/lib/supabase/server";
import { formatBRLPriceInput } from "@/lib/currency/brl";
import type { ProductInput } from "@/lib/validation/product";
import { ProductForm } from "../../product-form";
import type { SavedPhoto } from "../../photo-uploader";

/**
 * Rota `/admin/produtos/[id]/editar` (PROD-05, Plan 03-05). Mesmo gate combinado de
 * auth + onboarding que `/admin/produtos`/`/admin/dashboard`/`/admin/configuracoes`
 * (`requireCompletedOnboarding` como primeira linha). Totalmente dinâmica
 * (NUNCA `"use cache"` — mesma disciplina de `/admin/produtos`), já que o produto
 * pode ter sido editado/publicado em outra aba.
 *
 * Carrega o produto (+ tamanhos + fotos) escopado à store do dono — o
 * `.eq("store_id", store.id)` é defensivo (RLS já garante o mesmo escopo),
 * mesma disciplina de `/admin/produtos`/`/admin/configuracoes`. Se o produto não existir
 * OU pertencer a outra loja, `redirect("/admin/produtos")` em vez de renderizar um
 * formulário vazio/quebrado (T-03-11).
 */
type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarProdutoPage({ params }: PageProps) {
  await requireCompletedOnboarding();
  const { id } = await params;

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

  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("store_id", store.id)
    .single();

  if (!product) {
    redirect("/admin/produtos");
  }

  const { data: sizeRows } = await supabase
    .from("product_sizes")
    .select("size, available")
    .eq("product_id", id)
    .order("size", { ascending: true });

  const { data: photoRows } = await supabase
    .from("product_photos")
    .select("id, storage_path")
    .eq("product_id", id)
    .order("position", { ascending: true });

  const photos: SavedPhoto[] = (photoRows ?? []).map((photo) => ({
    id: photo.id,
    url: supabase.storage.from("product-images").getPublicUrl(photo.storage_path).data.publicUrl,
  }));

  const defaultValues: Partial<ProductInput> = {
    name: product.name,
    brand: product.brand,
    brandOther: product.brand_other ?? "",
    line: product.line ?? "",
    sole: product.sole ?? "",
    category: product.category ?? "",
    fulfillment: (product.fulfillment as ProductInput["fulfillment"]) ?? undefined,
    price: formatBRLPriceInput(product.price),
    description: product.description ?? "",
    sizes: (sizeRows ?? []).map((row) => ({ size: row.size, available: row.available })),
    // Fecha o ciclo boolean|null <-> string do select (D-09/D-10, mesma
    // disciplina de formatBRLPriceInput para o campo price): null -> "" (sem
    // exceção, herda o padrão da loja), true/false -> a string correspondente.
    hideWhenSoldOut: product.hide_when_sold_out === null ? "" : product.hide_when_sold_out ? "true" : "false",
  };

  return (
    // Mesmo respiro do Dashboard e sem `mx-auto` no CONTAINER — ver
    // configuracoes/page.tsx. O `max-w-6xl 2xl:max-w-7xl` desceu pro wrapper
    // do form (mesma técnica de configuracoes): o cabeçalho fica colado à
    // sidebar em qualquer largura, só o conteúdo (form + painel de fotos)
    // ganha teto e centraliza dentro do espaço restante — precisa da largura
    // real pro painel de fotos ter onde existir ao lado do form em xl.
    <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/produtos" className="text-sm text-gray-500 transition-colors duration-150 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50">
            ← Voltar
          </Link>
          <h1 className="mt-2 font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">Editar produto</h1>
        </div>
        <span
          className={`mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            product.status === "published"
              ? "bg-success-bg text-success-fg dark:bg-success-solid/15"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
          }`}
        >
          {product.status === "published" ? "Publicado" : "Rascunho"}
        </span>
      </div>

      <div className="mx-auto w-full max-w-6xl 2xl:max-w-7xl">
        <ProductForm
          productId={product.id}
          status={product.status}
          initialPhotos={photos}
          defaultValues={defaultValues}
        />
      </div>
    </div>
  );
}
