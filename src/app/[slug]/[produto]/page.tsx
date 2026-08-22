import { redirect } from "next/navigation";

/**
 * A página cheia de produto foi descontinuada (decisão do usuário,
 * 2026-08-19): o único jeito de ver o detalhe de um produto agora é o
 * popup sobre a vitrine (`/[slug]?produto=<id>`, ver `[slug]/page.tsx`) —
 * quem chega de fora por um link de produto compartilhado cai na loja
 * inteira com o popup já aberto, podendo navegar pro resto do catálogo
 * sem sair da página. Esta rota sobrevive só como redirect, pra links
 * antigos (mensagens de WhatsApp já enviadas, QR codes já impressos) que
 * ainda apontam pro formato de URL anterior continuarem funcionando.
 * `generateMetadata`, o guard de visibilidade e o 404 de produto moraram
 * todos pra `[slug]/page.tsx` — ver `buildProductUrl` (store-url.ts) e
 * `loadProductDetail` (product-detail-data.ts), agora a única fonte usada.
 */
type PageProps = {
  params: Promise<{ slug: string; produto: string }>;
};

export default async function ProductDetailRedirect({ params }: PageProps) {
  const { slug, produto } = await params;
  redirect(`/${slug}?produto=${produto}`);
}
