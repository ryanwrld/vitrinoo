import type { CSSProperties } from "react";
import Link from "next/link";
import { PriceDisplay, calculateDiscountPercent } from "@/components/price-display";
import { ImageWithFallback } from "./image-with-fallback";
import { FavoriteButton } from "./favorite-button";

export type PublicProductCardData = {
  id: string;
  name: string;
  brand: string;
  brand_other: string | null;
  line: string | null;
  price: number;
  /** Preço promocional (gatilho de conversão, `PriceDisplay`) — `null` sem
   * promoção ativa. */
  promotional_price: number | null;
  disponivel: boolean;
  coverUrl: string | null;
};

/**
 * Card de produto da vitrine pública (Server Component) — adaptado do card
 * de listagem do painel admin (Fase 3: foto/nome/marca/preço/
 * disponibilidade), mas SEM os botões de edição/exclusão (exclusivos do
 * painel do revendedor) e usando ImageWithFallback (onError) em vez do
 * fallback inline "sem foto"
 * do admin — aqui a URL pode existir mas falhar no CDN do Storage (VITR-05).
 *
 * Card envolvido num `<Link>` que abre o produto como modal sobre o grid
 * (D-01, revisado: velocidade de navegação do cliente final), via
 * `?produto=<id>` na PRÓPRIA `/[slug]` — nunca uma rota interceptada/
 * paralela do Next (`@modal/(.)[produto]`, primeira versão): esse padrão
 * corrompeu a árvore de rotas do app inteiro (reproduzido em build de
 * produção isolado, quebrando navegação client-side até em `/admin/*`,
 * segmento sem nenhuma relação com `/[slug]`). Query param é comprovadamente
 * seguro. `id` é o UUID do produto (decisão A3 do 05-RESEARCH.md); `slug` e
 * `query` (filtros/página atuais, preservados no link) chegam como props
 * separadas, nunca poluindo `PublicProductCardData`.
 */
export function ProductCard({
  product,
  slug,
  query,
  staggerIndex = 0,
}: {
  product: PublicProductCardData;
  slug: string;
  query: string;
  /** Posição na entrada escalonada do grid (já com teto aplicado). */
  staggerIndex?: number;
}) {
  const params = new URLSearchParams(query);
  params.set("produto", product.id);
  const discountPct = calculateDiscountPercent(product.price, product.promotional_price);

  return (
    <Link
      href={`/${slug}?${params.toString()}`}
      scroll={false}
      style={{ "--stagger-index": staggerIndex } as CSSProperties}
      className="animate-card-in flex flex-col gap-2 rounded-[1.25rem] transition-transform duration-150 hover:-translate-y-1"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-[1.25rem] bg-gray-100">
        {/* Espelha EXATAMENTE a régua de colunas de product-grid.tsx — se uma
            mudar sem a outra, o navegador escolhe o arquivo errado (borrado se
            pedir de menos, desperdício de banda se pedir demais). */}
        <ImageWithFallback
          src={product.coverUrl}
          alt={product.name}
          sizes="(min-width: 1600px) 190px, (min-width: 1280px) 12.5vw, (min-width: 1024px) 16.6vw, (min-width: 768px) 20vw, (min-width: 640px) 25vw, 33vw"
        />
        {/* Linha única em flex, não dois `absolute top-2` separados: o selo
            (~18px de altura) e o coração (28px, h-7) têm alturas
            diferentes — com `top-2` cada um alinhava pela BORDA superior,
            então o selo, mais baixo, sobrava mais alto que o centro do
            coração (reportado pelo usuário). `items-center` nesta linha
            centraliza os dois na mesma altura, seja qual for a caixa de
            cada um. */}
        <div className="absolute inset-x-2 top-2 z-10 flex items-center justify-between">
          {discountPct !== null ? (
            <span className="inline-flex items-center rounded-md bg-[#00D864] px-1.5 py-0.5 text-[10px] font-bold text-white">
              -{discountPct}%
            </span>
          ) : (
            <span />
          )}
          <FavoriteButton slug={slug} productId={product.id} productName={product.name} variant="overlay" />
        </div>
      </div>

      {/* Nome, preço e disponibilidade — a linha "marca · linha" saiu (decisão
          do usuário): num card de ~140px ela consumia a linha mais escassa
          repetindo o que o nome já diz ("Nike Phantom GX III" → "Nike ·
          Phantom GX III"). A marca segue disponível como FILTRO, que é onde
          ela de fato ajuda a achar o produto. */}
      <div className="flex flex-col gap-0.5">
        <span className="truncate font-display text-sm font-medium text-gray-900">{product.name}</span>
        <PriceDisplay price={product.price} promotionalPrice={product.promotional_price} variant="card" />
        {!product.disponivel && (
          <span className="flex items-center gap-1 text-xs text-error-fg transition-colors duration-150">
            <span className="h-1.5 w-1.5 rounded-full bg-error-solid" aria-hidden="true" />
            Esgotado
          </span>
        )}
      </div>
    </Link>
  );
}
