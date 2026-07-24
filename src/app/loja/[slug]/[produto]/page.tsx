import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { queryPublicProductDetail } from "@/lib/products/public-detail";
import { getProductImagePublicUrl } from "@/lib/storage/product-image-url";
import { buildProductUrl } from "@/lib/slug/store-url";
import { formatBRLPrice } from "@/lib/currency/brl";
import { DEFAULT_MESSAGE_TEMPLATE } from "@/lib/validation/onboarding";
import { ProductOrderPanel } from "./product-order-panel";
import { ProductNotFoundContent } from "./product-not-found-content";

/**
 * Rota de detalhe do produto — Server Component totalmente dinâmico, SEM
 * NENHUMA checagem de auth (mesma disciplina de `/loja/[slug]/page.tsx`,
 * Fase 4, SC-7). NUNCA adicionar a diretiva de cache do App Router aqui —
 * o estoque precisa refletir o painel do revendedor com delay de segundos
 * (VITR-03/CLAUDE.md), e Cache Components do Next 16 é opt-in por padrão
 * (basta nunca optar por cache).
 *
 * `createClient()` funciona sem sessão nesta rota (papel `anon` no
 * Postgres, RLS pública). `queryPublicProductDetail` (05-03) já resolve o
 * guard de visibilidade completo (inexistente, rascunho OU oculto pela
 * regra de esgotado — Pitfall 8, sem bypass por link direto): os três
 * casos retornam `null` igualmente, e o 404 é renderizado inline via
 * `ProductNotFoundContent` (não `notFound()`) pra poder linkar "Voltar
 * para a loja" pra `/loja/${slug}` de verdade — `notFound()` só é usado
 * quando a PRÓPRIA loja não existe (nesse caso não há slug válido pra
 * linkar, então o fallback genérico do not-found.tsx de segmento serve).
 *
 * `store_settings` (whatsapp_e164/message_template) é lido via a nova
 * policy anon `public_read_store_settings_for_published_stores` (05-01) —
 * a segurança dessa exposição é inteiramente responsabilidade da RLS, não
 * deste código.
 */
type PageProps = {
  params: Promise<{ slug: string; produto: string }>;
};

/**
 * Open Graph mínimo (título/descrição/imagem) — existe só pra dar ao link
 * "Foto: <url>" da mensagem de pedido (buildProductUrl, ver store-url.ts)
 * uma página HTML real com preview visual, em vez da URL crua da imagem no
 * Storage (o desvio de "compartilhar como foto" no iOS, ver product-order-
 * panel.tsx). Falha silenciosa (sem metadata) se store/produto não existem
 * — a página em si já chama notFound() nesse caso; generateMetadata só
 * precisa não quebrar o build.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, produto } = await params;
  const supabase = await createClient();

  const { data: store } = await supabase
    .from("stores")
    .select("id, hide_sold_out_default")
    .eq("slug", slug)
    .single();

  if (!store) return {};

  const detail = await queryPublicProductDetail(supabase, store.id, produto, store.hide_sold_out_default);
  if (!detail) return {};

  const coverPhoto = detail.photos[0];
  const coverUrl = coverPhoto ? getProductImagePublicUrl(supabase, coverPhoto.storage_path) : null;
  const title = detail.line ? `${detail.name} - ${detail.line}` : detail.name;
  const description = `${formatBRLPrice(detail.price)} — disponível no Vitrinoo`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: coverUrl ? [{ url: coverUrl }] : [],
      url: buildProductUrl(slug, detail.id),
    },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug, produto } = await params;
  const supabase = await createClient();

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, name, slug, hide_sold_out_default")
    .eq("slug", slug)
    .single();

  if (storeError || !store) {
    notFound();
  }

  const detail = await queryPublicProductDetail(supabase, store.id, produto, store.hide_sold_out_default);

  // Loja existe (slug válido), mas o produto não é visível — renderiza o
  // 404 diretamente aqui (em vez de notFound(), que delegaria pro
  // not-found.tsx de segmento, que não recebe params) pra poder linkar
  // "Voltar para a loja" pra /loja/${slug} de verdade, não pra raiz do
  // site (05-VERIFICATION.md gap #10).
  if (!detail) {
    return <ProductNotFoundContent backHref={`/loja/${slug}`} />;
  }

  const { data: storeSettings } = await supabase
    .from("store_settings")
    .select("whatsapp_e164, message_template")
    .eq("store_id", store.id)
    .single();

  const whatsappE164 = storeSettings?.whatsapp_e164 ?? "";
  const messageTemplate = storeSettings?.message_template ?? DEFAULT_MESSAGE_TEMPLATE;

  const galleryUrls = detail.photos
    .map((photo) => getProductImagePublicUrl(supabase, photo.storage_path))
    .filter((url): url is string => url !== null);
  const coverUrl = galleryUrls[0] ?? null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 bg-white px-4 py-6">
      <ProductOrderPanel
        product={{
          name: detail.name,
          line: detail.line,
          sole: detail.sole,
          price: detail.price,
        }}
        sizes={detail.sizes}
        whatsappE164={whatsappE164}
        messageTemplate={messageTemplate}
        coverUrl={coverUrl}
        galleryUrls={galleryUrls}
        storeId={store.id}
        productId={detail.id}
        slug={slug}
        productUrl={buildProductUrl(slug, detail.id)}
      />
    </main>
  );
}
