"use client";

import { startTransition, useRef, useState, useTransition, type MouseEvent } from "react";
import Link from "next/link";
import { ChevronLeft, Copy } from "lucide-react";
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { toast } from "sonner";
import { copyText } from "@/lib/clipboard";
import { formatBRLPriceInput } from "@/lib/currency/brl";
import { PriceDisplay } from "@/components/price-display";
import { buildOrderMessage, buildWhatsAppUrl } from "@/lib/whatsapp/order-message";
import { decideOrderAction } from "@/lib/whatsapp/order-guard";
import { logOrderClick } from "@/lib/products/order-clicks-actions";
import { resolveVisitorId } from "@/lib/analytics/visitor-id";
import { useOpensInNewTab } from "@/lib/ui/use-opens-in-new-tab";
import { ImageWithFallback } from "../image-with-fallback";
import { FavoriteButton } from "../favorite-button";

/**
 * Composição condicional de className — mesmo `cn()` local de
 * `size-grid.tsx` (clsx + tailwind-merge). Não extraído para um util
 * compartilhado neste plano: os dois componentes replicam a mesma linha,
 * seguindo o precedente já estabelecido na Fase 3.
 */
function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type ProductOrderPanelProps = {
  product: {
    name: string;
    line: string | null;
    sole: string | null;
    price: number;
    /** Preço promocional (gatilho de conversão, `PriceDisplay`) — `null`
     * sem promoção ativa. */
    promotional_price: number | null;
  };
  sizes: { size: number; available: boolean }[];
  whatsappE164: string;
  messageTemplate: string;
  coverUrl: string | null;
  galleryUrls: string[];
  storeId: string;
  productId: string;
  slug: string;
  productUrl: string;
  /**
   * "page" (padrão) = rota cheia `/[slug]/[produto]` — link "Voltar",
   * coluna única, barra de CTA `fixed` no viewport.
   * "modal" = mesmo conteúdo dentro do diálogo interceptado sobre o grid —
   * sem "Voltar" (o X/overlay do diálogo já fecha), duas colunas no
   * desktop e barra de CTA `sticky` DENTRO do diálogo (um `fixed` aqui
   * grudaria no viewport, fora do card — ver product-modal.tsx).
   */
  variant?: "page" | "modal";
};

const TOOLTIP_DISMISS_MS = 2500;

/**
 * Painel de pedido da página de detalhe (PED-01/02/03/04, D-02/D-03/D-04/
 * D-07/D-08/D-10). Client Component porque exige estado de seleção de
 * tamanho + handlers de clique/teclado — a leitura de dados (store,
 * produto, tamanhos, store_settings) já aconteceu no Server Component pai
 * (page.tsx, Plan 05-04 Task 2).
 *
 * "Pedir agora" é SEMPRE um `<a href>` real (nunca `disabled`, D-02): href
 * alterna entre "#" (sem tamanho) e a URL wa.me real (com tamanho).
 * `decideOrderAction` (05-02) decide se o clique deve navegar ou ser
 * interceptado — só o caminho inválido chama `preventDefault()`; o caminho
 * válido deixa a navegação nativa do anchor acontecer (nunca
 * `window.open`/`router.push`, T-05-11). O log fire-and-forget do clique
 * (`logOrderClick`) é disparado via `startTransition` (a função "solta" do
 * React, não o hook) no caminho válido — resultado sempre ignorado, nunca
 * gateando/atrasando a navegação (D-10).
 *
 * Pílulas de tamanho: `available === false` faz o handler early-return
 * (revalidação no clique) — cobre mouse E teclado, já que `pointer-events-
 * none` sozinho NÃO bloqueia Enter/Space (05-RESEARCH.md Pitfall 1);
 * `tabIndex={-1}` remove a pílula esgotada do fluxo de Tab.
 *
 * "Copiar pedido" (D-07/D-08, label ajustado no checkpoint manual da 05-04
 * — "Copiar mensagem" não fazia sentido pro cliente final) é SEMPRE visível
 * — nunca um fallback
 * condicional — e usa a MESMA string composta do wa.me (incluindo a linha
 * de foto), via `copyText` como primeiro `await` dentro da transition
 * (05-RESEARCH.md Pitfall 6, mesmo padrão de `qr-code-panel.tsx`).
 */
export function ProductOrderPanel({
  product,
  sizes,
  whatsappE164,
  messageTemplate,
  coverUrl,
  galleryUrls,
  storeId,
  productId,
  slug,
  productUrl,
  variant = "page",
}: ProductOrderPanelProps) {
  const isModal = variant === "modal";
  const [selectedSize, setSelectedSize] = useState<number | null>(null);
  // Shake key e tooltip são rastreados POR BOTÃO ("order" = Pedir agora,
  // "copy" = Copiar pedido) — cada CTA só sacode/mostra o tooltip acima de
  // si mesmo quando é o alvo real do clique, nunca os dois ao mesmo tempo
  // (ajuste pedido no checkpoint manual da 05-04, alinhamento básico de
  // UX a revisitar quando o design do front-end for trabalhado a fundo).
  const [orderShakeKey, setOrderShakeKey] = useState(0);
  const [copyShakeKey, setCopyShakeKey] = useState(0);
  const [tooltipTarget, setTooltipTarget] = useState<"order" | "copy" | null>(null);
  const [isPending, startCopyTransition] = useTransition();
  const opensInNewTab = useOpensInNewTab();

  const galleryRef = useRef<HTMLDivElement>(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  function handleGalleryScroll() {
    const el = galleryRef.current;
    if (!el || el.clientWidth === 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActivePhotoIndex(index);
  }

  function handleSelectSize(size: number, available: boolean) {
    // Revalidação no clique (mouse E teclado, Pitfall 1) — pointer-events-none
    // não bloqueia Enter/Space, então este early-return é a defesa real.
    if (!available) return;
    setSelectedSize(size);
  }

  // A1 (05-RESEARCH.md): {modelo} interpola product.name, com product.line
  // "folded in" quando presente — o template não tem placeholder próprio
  // para line.
  const modelo = product.line ? `${product.name} - ${product.line}` : product.name;
  // A2 (05-RESEARCH.md): sole ausente vira string vazia, nunca "null"/"undefined"
  // literal na mensagem.
  const solado = product.sole ?? "";
  // Gatilho de conversão (preço promocional): a mensagem do WhatsApp cita
  // SÓ o valor que o cliente vai pagar de fato — nunca "de/por" aqui, texto
  // limpo pro revendedor confirmar rápido (decisão do usuário). Mesma regra
  // de validade de `PriceDisplay`: só conta como promo ativa quando
  // `promotional_price` é um número válido e menor que `price`.
  const hasPromo =
    product.promotional_price !== null && product.promotional_price > 0 && product.promotional_price < product.price;
  const precoFormatado = formatBRLPriceInput(hasPromo ? product.promotional_price! : product.price);

  // fotoUrl aqui é a URL da PÁGINA do produto (não o arquivo de imagem cru
  // do Storage) — no iOS, um link wa.me cujo texto termina numa URL que
  // resolve como image/* dispara o fluxo nativo de "compartilhar como
  // foto" do sistema, pulando a composição da mensagem inteira (achado do
  // checkpoint de verificação manual, 05-04 Task 4). A página do produto é
  // HTML com Open Graph (generateMetadata em page.tsx), então o WhatsApp
  // ainda gera o preview visual da foto sem esse desvio.
  const message = buildOrderMessage(messageTemplate, {
    modelo,
    solado,
    tamanho: selectedSize !== null ? String(selectedSize) : "",
    preco: precoFormatado,
    fotoUrl: productUrl,
  });

  const href = selectedSize !== null ? buildWhatsAppUrl(whatsappE164, message) : "#";

  // Sacode/mostra o tooltip só do botão-alvo. O timeout confere se o alvo
  // ainda é o mesmo antes de limpar — um clique rápido no OUTRO botão não
  // pode ter seu tooltip apagado pelo timer mais antigo (mesma lógica do
  // Pitfall 4 do 05-RESEARCH.md, agora por botão em vez de global).
  function triggerSizeRequiredFeedback(target: "order" | "copy") {
    if (target === "order") {
      setOrderShakeKey((key) => key + 1);
    } else {
      setCopyShakeKey((key) => key + 1);
    }
    setTooltipTarget(target);
    setTimeout(() => {
      setTooltipTarget((current) => (current === target ? null : current));
    }, TOOLTIP_DISMISS_MS);
  }

  function handleOrderClick(event: MouseEvent<HTMLAnchorElement>) {
    const { shouldNavigate, shouldShake } = decideOrderAction(selectedSize);

    if (!shouldNavigate) {
      event.preventDefault();
      if (shouldShake) {
        triggerSizeRequiredFeedback("order");
      }
      return;
    }

    // Caminho válido: NUNCA chamar preventDefault aqui — é o que garante a
    // navegação nativa do <a> em webviews in-app (T-05-11). Registro
    // fire-and-forget do clique via startTransition — resultado ignorado,
    // NUNCA usado para gatear/atrasar esta navegação (D-10). selectedSize é
    // garantidamente não-nulo aqui: decideOrderAction só retorna
    // shouldNavigate=true quando há tamanho selecionado.
    if (selectedSize !== null) {
      // `resolveVisitorId()` tem que rodar AQUI, fora do startTransition:
      // ele lê `localStorage`, que só existe no cliente, e passar o id
      // pronto mantém a Server Action sem nenhuma dependência de browser.
      // É o MESMO id usado pelos trackers de visualização (módulo
      // compartilhado) — se fossem ids diferentes, a deduplicação por
      // (visitante, produto, dia) da migration 0012 pararia de casar com a
      // da 0010 e a taxa de conversão voltaria a comparar réguas distintas.
      const visitorId = resolveVisitorId();
      startTransition(() => {
        logOrderClick(storeId, productId, selectedSize, visitorId).catch(() => {});
      });
    }
  }

  function handleCopy() {
    // Mesmo guard do "Pedir agora" (decideOrderAction) — "Copiar pedido" só
    // copia com tamanho selecionado; sem tamanho, sacode + mostra o mesmo
    // tooltip "Selecione um tamanho" em vez de copiar uma mensagem
    // incompleta (ajuste pedido no checkpoint manual da 05-04).
    const { shouldNavigate: shouldCopy, shouldShake } = decideOrderAction(selectedSize);

    if (!shouldCopy) {
      if (shouldShake) {
        triggerSizeRequiredFeedback("copy");
      }
      return;
    }

    startCopyTransition(async () => {
      const ok = await copyText(message);
      if (ok) {
        toast.success("Pedido copiado!");
      } else {
        toast.error("Não foi possível copiar.");
      }
    });
  }

  const photosToRender = galleryUrls.length > 0 ? galleryUrls : [coverUrl];

  const gallery = (
    <div className={cn("flex flex-col gap-2", isModal && "md:w-1/2 md:shrink-0")}>
      <div
        ref={galleryRef}
        onScroll={handleGalleryScroll}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto"
      >
        {photosToRender.map((url, index) => (
          <div
            key={url ?? index}
            className="relative aspect-square w-full shrink-0 snap-center overflow-hidden rounded-[1.25rem] bg-gray-100"
          >
            <ImageWithFallback src={url} alt={product.name} />
          </div>
        ))}
      </div>
      {photosToRender.length > 1 && (
        <span className="text-center text-xs text-gray-500">
          Foto {activePhotoIndex + 1} de {photosToRender.length}
        </span>
      )}
    </div>
  );

  const details = (
    <div className={cn("flex flex-col gap-6", isModal && "md:min-w-0 md:flex-1")}>
      <div className="flex flex-col gap-1.5">
        {/* `gap-2` grudado no nome, NUNCA `justify-between`: no modal,
            desktop põe galeria e detalhes lado a lado (`md:flex-row` mais
            abaixo), então esta linha nasce rente ao topo da coluna — a
            MESMA posição do "X" de fechar do modal
            (`absolute right-3 top-3`, ProductModal). Com `justify-between`
            o coração ia pro canto direito da linha e caía exatamente sobre
            o X (as duas caixas de ~36px se sobrepunham por completo,
            coração invisível e inclicável). Grudado no nome ele nunca
            chega perto daquele canto, em nenhuma largura de tela. */}
        <div className="flex items-start gap-2">
          <h1 className="font-display text-xl font-extrabold text-gray-900">{product.name}</h1>
          <FavoriteButton slug={slug} productId={productId} productName={product.name} variant="inline" className="shrink-0" />
        </div>
        <PriceDisplay price={product.price} promotionalPrice={product.promotional_price} variant="detail" />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Escolha o tamanho</h2>
        <div className="grid grid-cols-5 gap-2">
          {sizes.map(({ size, available }) => (
            <button
              key={size}
              type="button"
              onClick={() => handleSelectSize(size, available)}
              aria-pressed={selectedSize === size}
              tabIndex={available ? 0 : -1}
              className={cn(
                "flex min-h-11 min-w-11 items-center justify-center rounded-xl border text-base transition-colors duration-150",
                available && selectedSize !== size && "border-gray-300 bg-white text-gray-900 hover:border-primary",
                available && selectedSize === size && "border-primary bg-primary text-white",
                !available &&
                  "pointer-events-none border-gray-200 bg-gray-100 text-gray-400 line-through opacity-60"
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn("flex flex-col", isModal ? "min-h-0 flex-1" : "gap-6 pb-24")}>
      {!isModal && (
        <Link href={`/${slug}`} className="flex w-fit items-center gap-1 text-sm text-gray-500">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Voltar
        </Link>
      )}

      {isModal ? (
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4 md:flex-row md:gap-6">
          {gallery}
          {details}
        </div>
      ) : (
        <>
          {gallery}
          {details}
        </>
      )}

      <div
        className={cn(
          "z-10 border-t border-gray-200 bg-white p-4 shadow-lg",
          isModal ? "shrink-0" : "fixed inset-x-0 bottom-0"
        )}
      >
        <div className={cn("flex w-full gap-3", !isModal && "mx-auto max-w-2xl")}>
          <div className="relative shrink-0">
            {tooltipTarget === "copy" && (
              <div className="absolute -top-10 left-0 whitespace-nowrap rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white">
                Selecione um tamanho
              </div>
            )}
            <button
              key={`copy-${copyShakeKey}`}
              type="button"
              onClick={handleCopy}
              disabled={isPending}
              aria-label="Copiar pedido"
              className={cn(
                "flex h-full min-h-11 items-center justify-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-center text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-60",
                copyShakeKey > 0 && "animate-shake"
              )}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copiar pedido
            </button>
          </div>

          <div className="relative flex-1">
            {tooltipTarget === "order" && (
              <div className="absolute -top-10 left-0 whitespace-nowrap rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white">
                Selecione um tamanho
              </div>
            )}
            <a
              key={`order-${orderShakeKey}`}
              href={href}
              /* Aba nova SÓ no desktop com mouse (ver `useOpensInNewTab`).
                 No celular fica na mesma aba de propósito: `_blank` abre um
                 novo contexto de navegação, e é exatamente isso que os
                 navegadores in-app do Instagram e do WhatsApp — o canal
                 principal de tráfego da vitrine — tratam mal. Na mesma aba,
                 quem intercepta o `wa.me` é o sistema operacional, e o app
                 assume por cima com a aba do navegador intacta atrás.
                 No desktop não existe esse risco e sair da vitrine seria
                 perda pura, então lá o `_blank` volta. */
              target={opensInNewTab ? "_blank" : undefined}
              rel={opensInNewTab ? "noopener noreferrer" : undefined}
              onClick={handleOrderClick}
              className={cn(
                "block min-h-11 w-full rounded-full bg-whatsapp px-4 py-2 text-center text-sm font-semibold text-white transition-all duration-150 hover:bg-whatsapp-hover active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2",
                orderShakeKey > 0 && "animate-shake"
              )}
            >
              Pedir agora
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
