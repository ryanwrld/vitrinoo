"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { formatBRLPrice } from "@/lib/currency/brl";
import { buildWhatsAppUrl } from "@/lib/whatsapp/order-message";
import { buildMultiOrderMessage, type MultiOrderMessageItem } from "@/lib/whatsapp/multi-order-message";
import { buildProductUrl } from "@/lib/slug/store-url";
import { useOpensInNewTab } from "@/lib/ui/use-opens-in-new-tab";
import { getContrastTextColor } from "@/lib/color/contrast";
import { lockScroll } from "@/lib/ui/scroll-lock";
import type { PublicFavoriteProduct } from "@/lib/products/public-favorites";
import { ImageWithFallback } from "./image-with-fallback";
import { FavoriteButton } from "./favorite-button";

export type FavoritesViewProps = {
  slug: string;
  whatsappE164: string;
  products: PublicFavoriteProduct[];
  /** Query string atual (SEMPRE contém "ids=...", sem "produto") — reusada
   *  pelo link de cada linha, mesmo padrão de `query` em product-card.tsx,
   *  pra abrir o produto como modal SEM perder a aba Favoritos por baixo. */
  query: string;
  accentColor: string;
};

/**
 * Aba "Favoritos" da vitrine pública (Nível 2 do roadmap de valor —
 * favoritos locais sem login). Lista (não grid de imagem, ao contrário do
 * catálogo normal): cada linha já mostra o essencial pra decidir o tamanho
 * ali mesmo, sem precisar abrir o produto.
 *
 * Produto favoritado que ficou esgotado CONTINUA aparecendo aqui (decisão do
 * usuário) — só os tamanhos ficam marcados indisponíveis no popup, em vez de
 * sumir da lista sem explicação (a regra de esgotado do resto da vitrine,
 * `isVisible()`/`hide_when_sold_out`, deliberadamente NÃO se aplica a esta
 * view — ver public-favorites.ts).
 *
 * A barra "Pedir tudo" só existe com 2+ FAVORITOS na lista (não 2+ tamanhos
 * escolhidos): com um único favorito, abrir o produto pelo link da linha e
 * usar o painel de pedido de sempre já resolve — duplicar esse caminho aqui
 * seria o mesmo CTA duas vezes na tela.
 */
export function FavoritesView({ slug, whatsappE164, products, query, accentColor }: FavoritesViewProps) {
  const isDarkText = getContrastTextColor(accentColor) === "dark";
  const [selectedSizes, setSelectedSizes] = useState<Record<string, number>>({});
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const opensInNewTab = useOpensInNewTab();

  const items: MultiOrderMessageItem[] = useMemo(() => {
    return products
      .filter((product) => selectedSizes[product.id] !== undefined)
      .map((product) => ({
        modelo: product.line ? `${product.name} - ${product.line}` : product.name,
        tamanho: selectedSizes[product.id],
        price: product.price,
        productUrl: buildProductUrl(slug, product.id),
      }));
  }, [products, selectedSizes, slug]);

  const totalSelected = items.reduce((sum, item) => sum + item.price, 0);
  const href = items.length > 0 ? buildWhatsAppUrl(whatsappE164, buildMultiOrderMessage(items)) : "#";

  function handleSelectSize(productId: string, size: number) {
    setSelectedSizes((current) => ({ ...current, [productId]: size }));
    setOpenProductId(null);
  }

  function handleOrderClick(event: MouseEvent<HTMLAnchorElement>) {
    // Mesmo guard de decideOrderAction (product-order-panel.tsx), adaptado
    // pra "0 tamanhos escolhidos" em vez de "0 tamanho": o caminho válido
    // NUNCA chama preventDefault, pra não quebrar a navegação nativa do
    // `<a>` nos webviews in-app (T-05-11).
    if (items.length === 0) {
      event.preventDefault();
      toast.error("Escolha o tamanho de pelo menos um favorito antes de pedir.");
    }
  }

  const openProduct = products.find((product) => product.id === openProductId) ?? null;

  return (
    <div className={clsx("flex flex-col gap-4", products.length > 1 && "pb-24")}>
      <ul className="flex flex-col divide-y divide-gray-100">
        {products.map((product) => {
          const disponivel = product.sizes.some((size) => size.available);
          const selectedSize = selectedSizes[product.id];
          const productParams = new URLSearchParams(query);
          productParams.set("produto", product.id);

          return (
            // Abaixo de `sm` a linha EMPILHA (foto+nome em cima, controles
            // embaixo alinhados à direita) — numa linha só, foto(64px) +
            // "Escolher tamanho" + coração já tomavam ~250px de um viewport
            // de ~390px, sobrando menos de 100px pro nome do produto
            // ("Nike Streetgato Elite Campo" virava "Nike Stre…", ilegível).
            // A partir de `sm` (640px) sobra espaço de sobra e volta a ser
            // uma linha só, igual sempre foi no tablet/desktop.
            <li key={product.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
              {/* `max-w-md` trava o crescimento — sem ele, `flex-1` sozinho
                  esticava a coluna de nome/preço até o fim do container
                  (max-w-[100rem] da página inteira), abrindo um vão de
                  espaço morto de centenas de px até o botão "Escolher
                  tamanho" em monitor grande. Capado, a linha vira um bloco
                  compacto ancorado à esquerda — a mesma leitura em qualquer
                  largura de tela. */}
              <Link
                href={`/${slug}?${productParams.toString()}`}
                scroll={false}
                className="flex min-w-0 max-w-md flex-1 items-center gap-3"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                  <ImageWithFallback src={product.coverUrl} alt={product.name} sizes="64px" />
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-display text-sm font-medium text-gray-900">{product.name}</span>
                  <span className="font-display text-sm font-bold text-primary">{formatBRLPrice(product.price)}</span>
                  <span
                    className={clsx(
                      "flex items-center gap-1 text-xs transition-colors duration-150",
                      disponivel ? "text-success-fg" : "text-gray-500"
                    )}
                  >
                    <span
                      className={clsx("h-1.5 w-1.5 rounded-full", disponivel ? "bg-success-solid" : "bg-gray-400")}
                      aria-hidden="true"
                    />
                    {disponivel ? "Disponível" : "Esgotado"}
                  </span>
                </div>
              </Link>

              <div className="flex shrink-0 items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpenProductId(product.id)}
                  aria-label={
                    selectedSize !== undefined
                      ? `Tamanho ${selectedSize} escolhido para ${product.name} — alterar`
                      : `Escolher tamanho de ${product.name}`
                  }
                  className={clsx(
                    "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                    selectedSize !== undefined
                      ? isDarkText
                        ? "text-gray-900"
                        : "text-white"
                      : "border-gray-300 text-gray-700 hover:border-gray-400"
                  )}
                  style={selectedSize !== undefined ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
                >
                  {selectedSize !== undefined ? `Tam ${selectedSize}` : "Escolher tamanho"}
                </button>

                <FavoriteButton
                  slug={slug}
                  productId={product.id}
                  productName={product.name}
                  variant="inline"
                  className="shrink-0"
                />
              </div>
            </li>
          );
        })}
      </ul>

      {openProduct && (
        <FavoriteSizeDialog
          product={openProduct}
          selectedSize={selectedSizes[openProduct.id] ?? null}
          onSelect={(size) => handleSelectSize(openProduct.id, size)}
          onClose={() => setOpenProductId(null)}
        />
      )}

      {products.length > 1 && (
        // MESMA régua de largura/padding do resto da página (page.tsx,
        // store-hero.tsx): esta barra some sob o grid/cabeçalho se usar um
        // teto próprio — `max-w-2xl` (herdado por engano do painel de pedido
        // de UM produto, que é coluna única de propósito) deixava a faixa
        // estreita e descolada da coluna real da vitrine em telas largas.
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white px-4 py-4 shadow-lg sm:px-6 md:px-12 lg:px-20 xl:px-24 2xl:px-28">
          <div className="mx-auto flex w-full max-w-[100rem] items-center gap-3">
            <span className="flex-1 text-sm text-gray-600">
              {items.length > 0
                ? `${items.length} ${items.length === 1 ? "produto" : "produtos"} — ${formatBRLPrice(totalSelected)}`
                : "Escolha o tamanho de cada favorito"}
            </span>
            <a
              href={href}
              target={opensInNewTab ? "_blank" : undefined}
              rel={opensInNewTab ? "noopener noreferrer" : undefined}
              onClick={handleOrderClick}
              className="block min-h-11 shrink-0 rounded-md bg-whatsapp px-4 py-2 text-center text-sm font-semibold text-white transition-all duration-150 hover:bg-whatsapp-hover active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
            >
              Pedir tudo
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Popup de escolha de tamanho por favorito — MESMA superfície visual dos
 * pop-ups já existentes na vitrine/painel (`qr-code-button.tsx`,
 * `notification-bell.tsx`, pedido explícito do usuário): vidro sem cor
 * própria (`backdrop-blur-lg backdrop-saturate-75`), `.notification-glow-border`
 * (o anel de 1px com brilho vindo do topo, globals.css) e `rounded-3xl`.
 * Overlay `fixed` + `createPortal` em vez de `<dialog showModal()>`, mesma
 * disciplina de `product-modal.tsx`/`qr-code-button.tsx`: `::backdrop`/
 * top-layer tem suporte irregular nos webviews in-app que são o canal
 * principal de tráfego daqui.
 */
function FavoriteSizeDialog({
  product,
  selectedSize,
  onSelect,
  onClose,
}: {
  product: PublicFavoriteProduct;
  selectedSize: number | null;
  onSelect: (size: number) => void;
  onClose: () => void;
}) {
  useEffect(() => lockScroll(), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-6 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Escolher tamanho — ${product.name}`}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="notification-glow-border animate-scale-in relative w-full max-w-sm overflow-hidden rounded-3xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.55)] backdrop-blur-lg backdrop-saturate-75 outline-none"
      >
        <div className="relative flex max-h-[80dvh] flex-col gap-4 overflow-y-auto px-6 pb-6 pt-12">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="flex flex-col gap-1 text-center">
            <span className="font-display text-lg font-extrabold text-white">{formatBRLPrice(product.price)}</span>
            <span className="text-sm text-white/60">{product.name}</span>
          </div>

          {product.sizes.length > 0 ? (
            // Colunas iguais em UMA linha só, contagem de colunas = contagem
            // de tamanhos (via `style`, não classe: Tailwind não compila
            // `grid-cols-N` dinâmico). `grid-cols-5` fixo deixava pílula
            // órfã numa 2ª fileira sempre que a contagem não era múltiplo de
            // 5 (7 tamanhos = 5+2 desalinhado); `flex` + scroll horizontal
            // cortava a última pílula na borda do popup em telas estreitas.
            // Aqui cada botão DIVIDE a largura disponível — nunca corta,
            // nunca quebra linha, nunca precisa rolar.
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${product.sizes.length}, minmax(0, 1fr))` }}
            >
              {product.sizes.map(({ size, available }) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => available && onSelect(size)}
                  disabled={!available}
                  aria-pressed={selectedSize === size}
                  className={clsx(
                    "flex h-11 w-full items-center justify-center rounded-lg border text-sm transition-colors duration-150",
                    available && selectedSize !== size && "border-white/30 bg-white/5 text-white hover:border-white/60",
                    available && selectedSize === size && "border-white bg-white text-gray-900",
                    !available && "border-white/10 bg-white/5 text-white/30 line-through"
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-white/60">Nenhum tamanho cadastrado.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
