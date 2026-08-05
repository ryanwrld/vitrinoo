import Link from "next/link";
import { formatBRLPrice } from "@/lib/currency/brl";
import { ImageWithFallback } from "./image-with-fallback";

export type PublicProductCardData = {
  id: string;
  name: string;
  brand: string;
  brand_other: string | null;
  line: string | null;
  price: number;
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
 * Card envolvido num `<Link>` para `/[slug]/[produto]` (D-01: página de
 * detalhe dedicada, não modal/accordion inline no grid) — `[produto]` é o
 * `id` (UUID) do produto (decisão A3 do 05-RESEARCH.md: URL compartilhável
 * satisfeita sem coluna slug nova). `slug` chega como prop separada, nunca
 * poluindo `PublicProductCardData` (que descreve só o dado do produto).
 */
export function ProductCard({ product, slug }: { product: PublicProductCardData; slug: string }) {
  const brandLabel = product.brand === "Outra" && product.brand_other ? product.brand_other : product.brand;
  const secondaryLine = [brandLabel, product.line].filter(Boolean).join(" · ");

  return (
    <Link href={`/${slug}/${product.id}`} className="flex flex-col gap-2 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-gray-100">
        <ImageWithFallback src={product.coverUrl} alt={product.name} />
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="truncate font-display font-medium text-gray-900">{product.name}</span>
        {secondaryLine && <span className="truncate text-xs text-gray-500">{secondaryLine}</span>}
        <span className="font-display text-sm font-bold text-primary">{formatBRLPrice(product.price)}</span>
        <span
          className={`flex items-center gap-1 text-xs transition-colors duration-150 ${
            product.disponivel ? "text-success-fg" : "text-gray-500"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${product.disponivel ? "bg-success-solid" : "bg-gray-400"}`}
            aria-hidden="true"
          />
          {product.disponivel ? "Disponível" : "Esgotado"}
        </span>
      </div>
    </Link>
  );
}
