"use client";

import { Heart } from "lucide-react";
import clsx from "clsx";
import { useFavorites } from "@/lib/favorites/use-favorites";

export type FavoriteButtonProps = {
  slug: string;
  productId: string;
  productName: string;
  /**
   * "overlay" = círculo translúcido sobre a foto do card do grid (canto
   * superior direito). "inline" = ícone simples ao lado do nome, no painel
   * de pedido (página cheia e modal) — mesma cor do texto ao redor, sem
   * caixa própria.
   */
  variant?: "overlay" | "inline";
  className?: string;
};

/**
 * Coração de favoritar — único ponto de toggle usado tanto no card do grid
 * (`product-card.tsx`) quanto no painel de pedido (`product-order-panel.tsx`,
 * página cheia e modal). Estado 100% local (`useFavorites`, sem tráfego pro
 * backend) — ver `favorites-store.ts` para o porquê de ser por loja.
 *
 * `preventDefault` + `stopPropagation` SEMPRE, mesmo fora de um `<Link>`: no
 * card do grid este botão vive DENTRO da âncora que abre o produto
 * (product-card.tsx), e sem interromper o clique aqui ele também navegaria —
 * favoritar abriria o produto junto, o oposto de um toggle rápido no grid.
 */
export function FavoriteButton({ slug, productId, productName, variant = "overlay", className }: FavoriteButtonProps) {
  const { isFavorite, toggle } = useFavorites(slug);
  const active = isFavorite(productId);

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    toggle(productId);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={active}
      aria-label={active ? `Remover ${productName} dos favoritos` : `Favoritar ${productName}`}
      className={clsx(
        "flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2",
        variant === "overlay" &&
          "h-8 w-8 rounded-full bg-white/85 text-gray-600 shadow-sm backdrop-blur-sm hover:bg-white hover:text-gray-900",
        variant === "inline" && "h-9 w-9 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900",
        className
      )}
    >
      <Heart
        className={clsx("h-[18px] w-[18px] transition-colors duration-150", active && "fill-red-500 text-red-500")}
        aria-hidden="true"
      />
    </button>
  );
}
