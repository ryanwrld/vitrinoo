import { formatBRLPrice } from "@/lib/currency/brl";

export type PriceDisplayProps = {
  price: number;
  promotionalPrice: number | null;
  /**
   * "card" = grid da vitrine (compacto, ~140px de largura) — selo de
   * desconto e preço "de" menores, pra não estourar o card.
   * "detail" = página/modal de detalhe do produto — preço promocional em
   * destaque grande, mesmo tamanho que o preço único já tinha ali.
   */
  variant?: "card" | "detail";
  className?: string;
};

/**
 * Preço com gatilho de conversão (ancoragem: "de/por" + selo de %) — usado
 * tanto no card da grade (`product-card.tsx`) quanto na página/modal de
 * detalhe (`product-order-panel.tsx`), único lugar que decide a regra:
 * só existe "de/por" quando `promotionalPrice` é um número válido E menor
 * que `price` (a mesma checagem que `updateProductPromotionalPrice`, no
 * painel, já impede de salvar — mas nunca confiar só nisso no client:
 * dado antigo/editado por outra via pode chegar inconsistente, e aqui é
 * onde a vitrine pública decide o que o cliente final vê). Fora dessa
 * condição, cai no comportamento de sempre: só o preço normal, destacado.
 */
export function PriceDisplay({ price, promotionalPrice, variant = "detail", className }: PriceDisplayProps) {
  const hasPromo = promotionalPrice !== null && promotionalPrice > 0 && promotionalPrice < price;

  if (!hasPromo) {
    return (
      <span
        className={
          className ??
          (variant === "card"
            ? "font-display text-sm font-bold text-primary"
            : "font-display text-2xl font-extrabold text-primary")
        }
      >
        {formatBRLPrice(price)}
      </span>
    );
  }

  const discountPct = Math.round((1 - promotionalPrice / price) * 100);

  if (variant === "card") {
    return (
      <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className="font-display text-sm font-bold text-primary">{formatBRLPrice(promotionalPrice)}</span>
        <span className="text-xs text-gray-400 line-through dark:text-gray-500">{formatBRLPrice(price)}</span>
        <span className="inline-flex items-center rounded-full bg-error-bg px-1.5 py-0.5 text-[10px] font-bold text-error-badge-fg dark:bg-error-solid/15 dark:text-error-solid">
          -{discountPct}%
        </span>
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="font-display text-2xl font-extrabold text-primary">{formatBRLPrice(promotionalPrice)}</span>
      <span className="text-base text-gray-400 line-through dark:text-gray-500">{formatBRLPrice(price)}</span>
      <span className="inline-flex items-center rounded-full bg-error-bg px-2 py-0.5 text-xs font-bold text-error-badge-fg dark:bg-error-solid/15 dark:text-error-solid">
        -{discountPct}% OFF
      </span>
    </span>
  );
}
