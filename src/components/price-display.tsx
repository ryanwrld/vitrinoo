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
 * Único lugar que decide a regra de promoção válida: só existe "de/por"
 * quando `promotionalPrice` é um número válido E menor que `price` (a
 * mesma checagem que `updateProductPromotionalPrice`, no painel, já
 * impede de salvar — mas nunca confiar só nisso no client: dado antigo/
 * editado por outra via pode chegar inconsistente). `PriceDisplay` e o
 * selo sobre a foto do card (`product-card.tsx`) usam esta MESMA função —
 * nunca recalcular o percentual em outro lugar, senão os dois podem
 * divergir por arredondamento.
 */
export function calculateDiscountPercent(price: number, promotionalPrice: number | null): number | null {
  const hasPromo = promotionalPrice !== null && promotionalPrice > 0 && promotionalPrice < price;
  if (!hasPromo) return null;
  return Math.round((1 - promotionalPrice / price) * 100);
}

/**
 * Preço com gatilho de conversão (ancoragem "de/por") — usado tanto no
 * card da grade (`product-card.tsx`) quanto na página/modal de detalhe
 * (`product-order-panel.tsx`). O selo de desconto (%) NÃO mora mais aqui
 * no card: foi pra dentro da foto do produto, na mesma linha do coração de
 * favoritar (decisão do usuário) — `product-card.tsx` calcula com
 * `calculateDiscountPercent` e renderiza como overlay próprio. Na
 * variante "detail" o selo continua aqui, ao lado do preço.
 */
export function PriceDisplay({ price, promotionalPrice, variant = "detail", className }: PriceDisplayProps) {
  const discountPct = calculateDiscountPercent(price, promotionalPrice);

  if (discountPct === null) {
    return (
      <span
        className={
          className ??
          (variant === "card"
            ? "font-display text-sm font-bold text-[#00D864]"
            : "font-display text-2xl font-extrabold text-[#00D864]")
        }
      >
        {formatBRLPrice(price)}
      </span>
    );
  }

  // `promotionalPrice` já foi validado por `calculateDiscountPercent` acima
  // (discountPct só é não-nulo quando ele é um número válido) — o cast só
  // reafirma pro TypeScript o que a lógica já garantiu.
  const validPromo = promotionalPrice as number;

  if (variant === "card") {
    return (
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="font-display text-sm font-bold text-[#00D864]">{formatBRLPrice(validPromo)}</span>
        <span className="text-xs text-gray-400 line-through dark:text-gray-500">{formatBRLPrice(price)}</span>
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-base text-gray-400 line-through dark:text-gray-500">{formatBRLPrice(price)}</span>
      <span className="font-display text-2xl font-extrabold text-[#00D864]">{formatBRLPrice(validPromo)}</span>
      <span className="inline-flex items-center rounded-md bg-[#00D864] px-2 py-0.5 text-xs font-bold text-white">
        -{discountPct}%
      </span>
    </span>
  );
}
