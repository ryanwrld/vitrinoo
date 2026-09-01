"use client";

import { memo, startTransition, useMemo, useState, useTransition, type CSSProperties, type MouseEvent } from "react";
import { Copy } from "lucide-react";
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
import { RichText } from "@/components/rich-text";
import { parseRichText } from "@/lib/rich-text/document";
import { ImageWithFallback } from "../image-with-fallback";
import { FavoriteButton } from "../favorite-button";
import { PaymentBadges } from "./payment-badges";

/**
 * Composição condicional de className — mesmo `cn()` local de
 * `size-grid.tsx` (clsx + tailwind-merge). Não extraído para um util
 * compartilhado neste plano: os dois componentes replicam a mesma linha,
 * seguindo o precedente já estabelecido na Fase 3.
 */
function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Ícone do WhatsApp — sem equivalente no lucide-react (só ícones
 * genéricos, sem marcas), então é um SVG inline (path padrão do
 * glifo oficial, `fill="currentColor"` pra herdar a cor branca do
 * botão "Pedir agora" sem precisar de asset externo).
 */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2Zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.264 8.264 0 0 1-1.26-4.42c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.183 8.183 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42-.14 0-.31-.01-.48-.01-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.57.12.17 1.75 2.67 4.24 3.74.59.26 1.06.41 1.42.52.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.23-.17-.48-.29Z" />
    </svg>
  );
}

/**
 * Galeria de fotos isolada num componente próprio com `memo`: sem isso, ela
 * re-renderiza a cada tecla/clique do painel (ex.: selecionar tamanho), e o
 * `next/image` reaplica o atributo `src` do zero em cada `<img>` mesmo
 * quando o valor não muda — Chromium ignora essa reescrita, mas engines
 * WebKit (Safari real, inclusive iOS) redecodificam a imagem de qualquer
 * jeito, e ISSO é a piscada visível ao escolher um tamanho (bug reportado
 * pelo usuário, 2026-08-19). Como `photosToRender` é a MESMA referência de
 * array entre renders do pai (vem de props que não mudam quando só
 * `selectedSize` muda), `memo` evita o re-render inteiro da galeria, não só
 * a escrita do atributo.
 */
const ProductGallery = memo(function ProductGallery({
  photos,
  alt,
}: {
  photos: (string | null)[];
  alt: string;
}) {
  return (
    <div className="flex flex-col gap-2 md:w-1/2 md:shrink-0">
      {/* `overflow-y-hidden` é OBRIGATÓRIO aqui, não cosmético: a barra de
          rolagem HORIZONTAL (`overflow-x-auto`, a única que devia existir
          — é como o cliente passa de foto em foto) reserva ~14px de
          altura pra si mesma; isso empurra o conteúdo além da área
          visível, e o CSS libera `overflow-y: auto` sozinho pra cobrir
          esse espaço que a PRÓPRIA barra horizontal ocupou (regra do
          spec: eixo não-`visible` força o outro a `auto`). Sem esta
          linha, medido ao vivo: scrollHeight 488 vs clientHeight 474 —
          scroll vertical genuíno, não só estética (usuário pediu pra
          confirmar isso antes de aceitar, 2026-08-20). */}
      <div className="flex snap-x snap-mandatory items-start gap-2 overflow-x-auto overflow-y-hidden">
        {photos.map((url, index) => (
          <div
            key={url ?? index}
            className="relative aspect-square w-full shrink-0 snap-center overflow-hidden rounded-[1.25rem] bg-gray-100"
          >
            {/* Sem isto o `fill` assume 100vw e baixa a maior variante do
                otimizador (3840px de largura) pra uma caixa de ~600px no
                máximo — bytes desperdiçados que também deixam a
                redecodificação acima mais lenta/perceptível. */}
            <ImageWithFallback
              src={url}
              alt={alt}
              sizes="(min-width: 768px) 480px, 100vw"
            />
          </div>
        ))}
      </div>
    </div>
  );
});

export type ProductOrderPanelProps = {
  product: {
    name: string;
    line: string | null;
    sole: string | null;
    price: number;
    /** Preço promocional (gatilho de conversão, `PriceDisplay`) — `null`
     * sem promoção ativa. */
    promotional_price: number | null;
    /** Descrição formatada (JSON do TipTap) ou texto legado — `null`/vazia
     * simplesmente não renderiza a seção. */
    description?: string | null;
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
  /** Cor de destaque da loja (`stores.accent_color`) — pílula de tamanho
   * selecionada usa esta cor, não o azul de marca do Vitrinoo (mesmo
   * padrão de `filter-bar.tsx`: cor dinâmica por loja vai inline, nunca
   * como classe Tailwind fixa). */
  accentColor: string;
};

const TOOLTIP_DISMISS_MS = 2500;

/**
 * Painel de pedido do popup de produto (PED-01/02/03/04, D-02/D-03/D-04/
 * D-07/D-08/D-10) — único lugar onde o detalhe do produto é exibido hoje,
 * sempre dentro de `ProductModal` sobre a vitrine. Client Component porque
 * exige estado de seleção de tamanho + handlers de clique/teclado — a
 * leitura de dados (store, produto, tamanhos, store_settings) já aconteceu
 * no Server Component pai (`[slug]/page.tsx`).
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
  accentColor,
}: ProductOrderPanelProps) {
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

  // Regra do usuário (2026-08-23): SÓ com 9 tamanhos ou mais na grade, a
  // borda direita de "Pedir agora" recua um pouco (não bate mais exatamente
  // na borda do último tamanho) — 12px (`mr-3`), ajustado a pedido do
  // usuário a partir de 8px (`mr-2`). A margem no wrapper `flex-1` "come"
  // do espaço que ele ocupava, empurrando só a borda DIREITA pra dentro; a
  // esquerda (onde o botão começa, logo após "Copiar pedido") não muda.
  // Com 8 ou menos, sem alteração nenhuma.
  const manySizes = sizes.length >= 9;

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

  // fotoUrl aqui é a URL da vitrine com o popup do produto aberto
  // (buildProductUrl, não o arquivo de imagem cru do Storage) — no iOS, um
  // link wa.me cujo texto termina numa URL que resolve como image/*
  // dispara o fluxo nativo de "compartilhar como foto" do sistema, pulando
  // a composição da mensagem inteira (achado do checkpoint de verificação
  // manual, 05-04 Task 4). Essa URL é HTML com Open Graph (generateMetadata
  // em [slug]/page.tsx), então o WhatsApp ainda gera o preview visual da
  // foto sem esse desvio.
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

  // useMemo (não só o `if` de antes): garante que `photos` seja a MESMA
  // referência de array entre renders quando `galleryUrls`/`coverUrl` não
  // mudam — inclusive no ramo de fallback `[coverUrl]`, que sem isto criava
  // um array NOVO a cada render e quebraria o `memo` de `ProductGallery`
  // logo abaixo (a própria razão de existir deste useMemo).
  const photosToRender = useMemo(
    () => (galleryUrls.length > 0 ? galleryUrls : [coverUrl]),
    [galleryUrls, coverUrl]
  );
  const descriptionDoc = parseRichText(product.description);

  const gallery = <ProductGallery photos={photosToRender} alt={product.name} />;

  const details = (
    <div className="flex min-w-0 flex-col gap-6 md:flex-1">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {hasPromo && (
            <span className="inline-flex items-center rounded-md bg-gray-900 px-3 py-1 text-xs font-bold text-white">
              PROMOÇÃO
            </span>
          )}
          <span
            style={{ backgroundColor: accentColor }}
            className="inline-flex items-center rounded-md px-3 py-1 text-xs font-bold text-white"
          >
            UNIDADES LIMITADAS
          </span>
        </div>
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

      <PaymentBadges />

      {/* `md:w-fit md:max-w-full md:self-start` — SÓ desktop (2026-08-23,
          3ª tentativa). As duas tentativas anteriores usavam uma largura
          CALCULADA (aritmética `tamanhos × 44px + gaps`): funcionava na
          maioria dos casos, mas com 9-10 pílulas o valor calculado
          divergia por poucos pixels da largura REAL renderizada pelo
          navegador (arredondamento de sub-pixel em telas reais — visto ao
          vivo no MacBook do usuário, "Pedir agora" sobrando visivelmente
          além do último tamanho só nesses casos). `w-fit` não calcula
          nada: mede o `max-content` de verdade, então NUNCA diverge do
          que está na tela. Reage sozinho à ocasião — produtos com poucos
          tamanhos (grade mais estreita que os botões) usam a largura
          natural dos botões; produtos com muitos tamanhos (grade mais
          larga) usam a largura da grade — sem regra fixa, sem tratar
          nenhum produto como exceção. `max-w-full` é o teto de segurança
          (era `min(...,100%)` antes): se a grade natural for mais larga
          que a coluna disponível, trava em 100% dela e a grade quebra
          linha sozinha (`flex-wrap` já existente) em vez de estourar o
          card. `self-start` cancela o `align-items: stretch` padrão do
          flex-col pai (`details`), senão esta div sempre esticaria pra
          largura cheia da coluna, disfarçando o `w-fit`. */}
      <div className="flex flex-col gap-6 md:w-fit md:max-w-full md:self-start">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Escolha o tamanho</h2>
        <div className="flex flex-wrap gap-2">
          {sizes.map(({ size, available }) => (
            <button
              key={size}
              type="button"
              onClick={() => handleSelectSize(size, available)}
              aria-pressed={selectedSize === size}
              tabIndex={available ? 0 : -1}
              style={
                available && selectedSize === size
                  ? { backgroundColor: accentColor, borderColor: accentColor }
                  : available
                    ? ({ "--hover-border": accentColor } as CSSProperties)
                    : undefined
              }
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-base transition-colors duration-150",
                available && selectedSize !== size && "border-gray-300 bg-white text-gray-900 hover:border-[var(--hover-border)]",
                available && selectedSize === size && "text-white",
                !available &&
                  "pointer-events-none border-gray-200 bg-gray-100 text-gray-400 line-through opacity-60"
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* Botões de pedido — SÓ no desktop (`hidden md:flex`). Decisão do
          usuário (2026-08-20): no desktop saem da barra fixa do rodapé,
          entram no fluxo normal logo abaixo da grade de tamanhos. No
          mobile CONTINUAM na barra fixa de sempre (ver fora de `details`,
          mais abaixo) — a mudança era só pro desktop, não pro celular.
          `md:w-full` — SÓ desktop (2026-08-21): preenche a largura do
          wrapper `w-fit` logo acima (que já parou na largura real da
          grade de tamanhos), não a coluna inteira — é isso que faz a
          borda direita de "Pedir agora" bater exatamente com a borda
          direita do "43". */}
      <div className="hidden flex-wrap gap-3 md:flex md:w-full">
        <div className="relative">
          {tooltipTarget === "copy" && (
            <div className="absolute -top-10 left-0 whitespace-nowrap rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white">
              Selecione um tamanho
            </div>
          )}
          <button
            key={`copy-desktop-${copyShakeKey}`}
            type="button"
            onClick={handleCopy}
            disabled={isPending}
            aria-label="Copiar pedido"
            className={cn(
              "flex h-11 items-center justify-center gap-1 rounded-full border border-gray-300 bg-white px-4 text-center text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-60",
              copyShakeKey > 0 && "animate-shake"
            )}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copiar pedido
          </button>
        </div>

        {/* `flex-1` — alarga o botão pra direita (decisão do usuário,
            2026-08-21): "Copiar pedido" fica do tamanho do próprio
            conteúdo (`shrink-0` no wrapper dele), e "Pedir agora no
            WhatsApp" ocupa todo o espaço que sobra na linha. */}
        <div className={cn("relative flex-1", manySizes && "md:mr-3")}>
          {tooltipTarget === "order" && (
            <div className="absolute -top-10 left-0 whitespace-nowrap rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white">
              Selecione um tamanho
            </div>
          )}
          <a
            key={`order-desktop-${orderShakeKey}`}
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
              "flex h-11 w-full items-center justify-center gap-2 rounded-full bg-whatsapp px-6 text-center text-sm font-semibold text-white transition-all duration-150 hover:bg-whatsapp-hover active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2",
              orderShakeKey > 0 && "animate-shake"
            )}
          >
            <WhatsAppIcon className="h-4 w-4 shrink-0" />
            Pedir agora
          </a>
        </div>
      </div>
      </div>
    </div>
  );

  // Descrição continua renderizada (nunca `md:hidden` — tentativa
  // rejeitada pelo usuário, 2026-08-20: sem ela no DOM não tinha como
  // rolar até a descrição de jeito nenhum). O card fecha visualmente na
  // mesma altura da referência (foto + tamanhos + botões) porque o teto
  // de altura do modal (`md:max-h-[75dvh]`, product-modal.tsx) já corta a
  // visão ali por padrão — quem quiser ler a descrição rola o popup
  // (mesmo `overflow-y-auto` de sempre) pra revelar o resto abaixo.
  const description = descriptionDoc && (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-gray-900">Descrição</h2>
      <RichText doc={descriptionDoc} className="text-gray-600" />
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="product-panel-scroll flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-6">
        {/* `md:items-start` — sem isto o flex `align-items: stretch`
            (padrão) esticava a foto pra bater com a altura da coluna de
            texto ao lado, brigando com o `aspect-square` da galeria: a
            largura vinha de `w-1/2` (correta, fluida), mas a ALTURA vinha
            do stretch em vez do quadrado — dava caixas tipo 353×488,
            imagem visivelmente esticada/deformada em certas larguras de
            tela (reportado pelo usuário, 2026-08-20). `items-start` deixa
            cada coluna com a própria altura natural. */}
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-6">
          {gallery}
          {details}
        </div>
        {description}
      </div>

      {/* Barra fixa do rodapé — SÓ no mobile (`md:hidden`), o comportamento
          de sempre: fica pinada embaixo do card do modal (não da viewport
          — este `div` é `shrink-0`, não `fixed`; quem cria a ilusão de
          "grudado" é o irmão `flex-1 overflow-y-auto` acima empurrando
          tudo que sobra pra baixo). No desktop os mesmos botões já
          aparecem dentro de `details`, logo abaixo da grade de tamanhos
          (ver acima, `hidden md:flex`) — só o mobile continua com a barra
          fixa, decisão do usuário (2026-08-20): a mudança de layout era
          exclusiva do desktop. */}
      <div className="z-10 shrink-0 border-t border-gray-200 bg-white p-4 shadow-lg md:hidden">
        <div className="flex w-full gap-3">
          <div className="relative shrink-0">
            {tooltipTarget === "copy" && (
              <div className="absolute -top-10 left-0 whitespace-nowrap rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white">
                Selecione um tamanho
              </div>
            )}
            <button
              key={`copy-mobile-${copyShakeKey}`}
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
              key={`order-mobile-${orderShakeKey}`}
              href={href}
              target={opensInNewTab ? "_blank" : undefined}
              rel={opensInNewTab ? "noopener noreferrer" : undefined}
              onClick={handleOrderClick}
              className={cn(
                "flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-whatsapp px-4 py-2 text-center text-sm font-semibold text-white transition-all duration-150 hover:bg-whatsapp-hover active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2",
                orderShakeKey > 0 && "animate-shake"
              )}
            >
              <WhatsAppIcon className="h-4 w-4 shrink-0" />
              Pedir agora
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
