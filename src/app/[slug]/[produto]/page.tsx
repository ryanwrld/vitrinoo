import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { queryPublicProductDetail } from "@/lib/products/public-detail";
import { getProductImagePublicUrl } from "@/lib/storage/product-image-url";
import { buildProductUrl } from "@/lib/slug/store-url";
import { formatBRLPrice } from "@/lib/currency/brl";
import { ProductOrderPanel } from "./product-order-panel";
import { ProductNotFoundContent } from "./product-not-found-content";
import { loadProductDetail } from "./product-detail-data";

/**
 * Rota de detalhe do produto — Server Component totalmente dinâmico, SEM
 * NENHUMA checagem de auth (mesma disciplina de `/[slug]/page.tsx`,
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
 * para a loja" pra `/${slug}` de verdade — `notFound()` só é usado
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

  const result = await loadProductDetail(slug, produto);

  if (!result.ok) {
    // Loja inexistente: não há slug válido pra linkar, então o 404 genérico
    // do not-found.tsx de segmento serve. Loja existe mas produto não é
    // visível: 404 inline pra poder linkar "Voltar para a loja" pra
    // /${slug} de verdade (05-VERIFICATION.md gap #10).
    if (result.reason === "store") notFound();
    return <ProductNotFoundContent backHref={`/${slug}`} />;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 bg-white px-4 py-6">
      <ProductOrderPanel {...result.panel} />
    </main>
  );
}
