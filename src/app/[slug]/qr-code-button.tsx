"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Download, QrCode, X } from "lucide-react";
import { drawShareCard, SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from "@/lib/qr-share-card";
import { lockScroll } from "@/lib/ui/scroll-lock";

export type QrCodeButtonProps = {
  url: string;
  storeName: string;
  className?: string;
};

/**
 * Botão de QR code da vitrine pública (ao lado do compartilhar) + o diálogo
 * que ele abre.
 *
 * O que aparece no diálogo é o MESMO cartão de divulgação que o lojista baixa
 * em `/admin/configuracoes` (`drawShareCard`) — não um QR cru. Duas artes
 * diferentes para a mesma loja é o tipo de inconsistência que só aparece
 * depois, quando o cliente compara o print da vitrine com o cartão que o
 * lojista postou no story.
 *
 * O canvas só é montado quando o diálogo abre: gerar o QR + esperar
 * `document.fonts.ready` no primeiro paint da vitrine custa trabalho para
 * quem provavelmente nunca vai tocar nesse botão.
 *
 * Mesmas decisões de shell do `product-modal.tsx` (overlay `fixed` em vez de
 * `<dialog showModal()>`, Escape e trava de scroll explícitos) pelo mesmo
 * motivo: `::backdrop`/top-layer tem suporte irregular nos webviews in-app do
 * Instagram/WhatsApp, que são o canal principal de tráfego daqui. A diferença
 * é o `createPortal`: este componente vive dentro do `<header>`, então sem o
 * portal o overlay ficaria preso ao contexto de empilhamento do cabeçalho.
 */
export function QrCodeButton({ url, storeName, className }: QrCodeButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`QR code da vitrine de ${storeName}`}
        className={className}
      >
        <QrCode className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      {open && (
        <QrCodeDialog
          url={url}
          storeName={storeName}
          triggerRef={triggerRef}
          onClose={() => {
            setOpen(false);
            // Devolve o foco ao botão que abriu — sem isso o foco volta para o
            // `<body>` e quem navega por teclado recomeça do topo da página.
            triggerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

/** Duração da entrada e da saída. A saída é mais curta de propósito: expandir
 *  é o gesto que o usuário pediu e merece ser visto; recolher é só o desfecho,
 *  e uma saída na mesma duração da entrada dá sensação de travamento. */
const ENTER_MS = 560;
const EXIT_MS = 400;
/**
 * Curva de saída longa e sem repique (a mesma família usada em bottom sheets
 * de iOS). Ela sai rápido do repouso e desacelera durante quase todo o
 * percurso — é a desaceleração longa que faz o movimento ler como calmo.
 *
 * NÃO é a `cubic-bezier(.2,0,0,1)` do `vt-scale-in`: aquela é para um dropdown
 * de 280ms, e esticada para meio segundo vira um movimento que parece parar
 * duas vezes.
 */
const EASE = "cubic-bezier(.32,.72,0,1)";

/**
 * O véu escurece animando a COR DE FUNDO, nunca a opacidade.
 *
 * Um ancestral com `opacity` menor que 1 — inclusive durante uma animação de
 * opacidade — vira "backdrop root": o `backdrop-filter` de qualquer descendente
 * passa a amostrar só o que está dentro desse grupo, ou seja, nada. Era isso
 * que apagava o vidro do card durante a abertura e o fazia "ligar" no último
 * quadro, quando a animação terminava e a opacidade voltava a 1.
 *
 * Verificado em teste isolado (Chromium): filtro + transform no mesmo elemento
 * desfoca normalmente; filtro com um pai em `opacity: .99` não desfoca.
 */
const VEIL_TRANSPARENT = { backgroundColor: "rgba(0,0,0,0)" };
const VEIL_OPAQUE = { backgroundColor: "rgba(0,0,0,0.3)" };

function QrCodeDialog({
  url,
  storeName,
  triggerRef,
  onClose,
}: {
  url: string;
  storeName: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Um clique no "X" enquanto a saída já está rodando não pode disparar uma
  // segunda animação por cima da primeira.
  const closingRef = useRef(false);
  const [ready, setReady] = useState(false);

  /**
   * O estado "recolhido": o painel encolhido até o botão de QR e deslocado até
   * a posição dele na tela.
   *
   * Recalculado a cada uso, nunca memorizado: o cabeçalho rola e o painel muda
   * de largura na virada de breakpoint, então um valor guardado na abertura
   * mandaria o fechamento para onde o botão ESTAVA.
   */
  const collapsedTransform = useCallback((): string | null => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return null;

    const t = trigger.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    if (p.width === 0 || p.height === 0) return null;

    // Escala única (não uma por eixo): distorcer a proporção deformaria o
    // cartão do QR junto.
    //
    // O piso de 0,3 é o que separa "expandir" de "explodir": um botão de 40px
    // contra um painel de 324px daria 0,12, e crescer 8× no mesmo intervalo
    // obriga o painel a atravessar a tela numa velocidade que nenhuma curva
    // suaviza.
    const scale = Math.max(t.width / p.width, 0.3);

    const dx = t.left + t.width / 2 - (p.left + p.width / 2);
    const dy = t.top + t.height / 2 - (p.top + p.height / 2);

    return `translate(${dx}px, ${dy}px) scale(${scale})`;
  }, [triggerRef]);

  const prefersReducedMotion = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Recolhe o painel de volta para dentro do botão e SÓ ENTÃO desmonta. */
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;

    const panel = panelRef.current;
    const collapsed = collapsedTransform();
    if (!panel || !collapsed || !ready || prefersReducedMotion()) {
      onClose();
      return;
    }

    const options: KeyframeAnimationOptions = {
      duration: EXIT_MS,
      easing: EASE,
      // `fill: forwards` para nada piscar de volta no estado cheio entre o fim
      // da animação e o desmonte no próximo render do React.
      fill: "forwards",
    };

    overlayRef.current?.animate([VEIL_OPAQUE, VEIL_TRANSPARENT], options);

    // Só `transform`. Nem aqui nem no véu pode haver animação de opacidade —
    // ela apagaria o `backdrop-filter` do card (ver a nota em VEIL_*).
    const animation = panel.animate([{ transform: "none" }, { transform: collapsed }], options);

    animation.finished.then(onClose, onClose);
  }, [collapsedTransform, onClose, ready]);

  /**
   * Entrada: o painel se abre a partir do botão.
   *
   * SÓ COMEÇA QUANDO O CARTÃO ESTÁ DESENHADO (`ready`). O `drawShareCard` é
   * assíncrono (gera o QR e espera `document.fonts.ready`), então animar no
   * mount fazia o painel se abrir VAZIO e o cartão aparecer depois, já parado
   * — duas coisas acontecendo em tempos diferentes. Até lá o painel fica
   * escondido, sem nada na tela além do véu.
   *
   * Véu e painel compartilham `duration` e `easing` pelo mesmo motivo: são um
   * movimento só.
   */
  useEffect(() => {
    const panel = panelRef.current;
    const collapsed = collapsedTransform();
    if (!panel || !collapsed || !ready || prefersReducedMotion()) return;

    const options: KeyframeAnimationOptions = { duration: ENTER_MS, easing: EASE };

    overlayRef.current?.animate([VEIL_TRANSPARENT, VEIL_OPAQUE], options);

    panel.animate([{ transform: collapsed }, { transform: "none" }], options);
  }, [collapsedTransform, ready]);

  /**
   * A trava de rolagem vive num efeito SÓ DELA, com dependências vazias.
   *
   * Antes ela dividia efeito com o listener de Escape, que depende de
   * `requestClose` — e `requestClose` muda quando `ready` vira `true`. Ou
   * seja: no meio da abertura o efeito era limpo e reaplicado, destravando e
   * retravando a rolagem. Cada uma dessas transições é um salto de 15px na
   * largura do conteúdo. Separar é o que garante uma trava só, do primeiro ao
   * último quadro.
   */
  useEffect(() => lockScroll(), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    panelRef.current?.focus();

    let cancelled = false;
    drawShareCard(canvas, { publicUrl: url, storeName })
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url, storeName]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "cartao-vitrine.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  // O diálogo só é montado por um clique, então este ramo nunca acontece na
  // renderização do servidor — a guarda existe só para o `document` do portal.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      // Só o véu escuro. NENHUM desfoque aqui: o vidro é do card, e a área
      // externa nunca é filtrada — quem faz isso é a camada logo abaixo, que
      // fica recortada no tamanho do card.
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-6 sm:p-4"
      onClick={requestClose}
      role="presentation"
    >
      {/* MESMA SUPERFÍCIE DO POP-UP DE NOTIFICAÇÕES (`notification-bell.tsx`):
          vidro sem cor própria (`backdrop-blur-lg` + `backdrop-saturate-75`),
          o anel de 1px com o brilho vindo do topo (`.notification-glow-border`
          em globals.css), as mesmas `rounded-3xl` e sombra. A entrada não é a
          `animate-scale-in` do sino, é a expansão a partir do botão.

          O filtro é DESTE elemento: a área externa nunca é desfocada, só
          escurecida pelo véu. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`QR code da vitrine de ${storeName}`}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        // Escondido até o cartão estar desenhado — é o efeito de entrada
        // (acima) que o traz à tona, saindo do botão. Sem isto o painel
        // apareceria inteiro, no centro, e só depois animaria.
        style={{ visibility: ready ? "visible" : "hidden" }}
        // LARGURA DERIVADA DO CARTÃO, não escolhida à parte.
        //
        // No celular: 220px de cartão + 28px de respiro de cada lado = 276px.
        // Antes o painel tinha 304px fixos, então sobravam 42px de cada lado
        // do cartão contra 20px de padding em cima — o cartão ficava boiando
        // num painel largo demais para ele. Com a largura amarrada ao
        // conteúdo, a distância do cartão até a borda é a MESMA nos quatro
        // lados, e a frase e o botão herdam exatamente a largura do cartão.
        //
        // No desktop, a mesma conta com os valores de lá: 260px de cartão +
        // 32px de cada lado = 324px. Antes eram 384px (`max-w-sm`), um número
        // escolhido pela escala do Tailwind e não pelo que está dentro —
        // sobravam 62px de cada lado do cartão.
        //
        // Quando o pedido for "alargar o pop-up", o que muda é ESTE respiro,
        // nunca o cartão: a largura do painel é sempre cartão + 2×padding.
        className="notification-glow-border relative w-full max-w-[17.25rem] overflow-hidden sm:max-w-[20.25rem] rounded-3xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.55)] backdrop-blur-lg backdrop-saturate-75 outline-none"
      >
        {/* `relative` porque o `::before` da moldura é posicionado e, sem
            isso, pintaria por cima do conteúdo em fluxo. */}
        {/* `pt-14` (56px) nas duas larguras reserva a faixa do "X": ele é
            `absolute`, ocupa até 48px a partir do topo, e com o painel agora
            amarrado à largura do cartão ele cairia EM CIMA da arte nos dois
            casos. 56px deixam 8px de folga abaixo dele.

            O resto do padding continua diferente por tamanho (28px no celular,
            32px no desktop) — é ele que define a largura do painel logo
            acima. */}
        <div className="relative flex max-h-[88dvh] flex-col items-center gap-3.5 overflow-y-auto px-7 pb-7 pt-14 sm:gap-4 sm:px-8 sm:pb-8">
          <button
            type="button"
            onClick={requestClose}
            aria-label="Fechar"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>

          {/* `width`/`height` são a resolução real do arquivo (1080×1350); o
              CSS só reduz a exibição — é o mesmo canvas do painel admin, então
              o que está na tela é literalmente o PNG que o botão baixa. */}
          <canvas
            ref={canvasRef}
            width={SHARE_CARD_WIDTH}
            height={SHARE_CARD_HEIGHT}
            role="img"
            aria-label={`QR code da vitrine de ${storeName}`}
            className="h-auto w-full max-w-[220px] sm:max-w-[260px]"
          />

          {/* `text-balance`: em 220px a frase quebra em duas linhas, e sem
              balanceamento a segunda fica com uma palavra solta. */}
          <p className="text-balance text-center text-sm leading-snug text-white/60">
            Aponte a câmera do celular para abrir a vitrine.
          </p>

          {/* Azul da marca com texto branco — o mesmo par de cores do cartão
              logo acima, e o mesmo botão primário do resto do produto.
              `rounded-xl` (12px) em vez de `rounded-md` (6px): o cartão logo
              acima arredonda ~11px na escala em que é exibido, e dois raios
              diferentes empilhados a 14px de distância leem como desalinho.

              `hidden sm:flex`: no celular quem abre isto está com a câmera de
              OUTRO aparelho apontada para a tela, ou vai usar o compartilhar
              ao lado — baixar o PNG para a galeria do próprio telefone que já
              está na vitrine não leva a lugar nenhum. `display:none` também
              tira o botão do leitor de tela, ao contrário de escondê-lo por
              opacidade. */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={!ready}
            className="hidden w-full items-center justify-center gap-2 rounded-xl bg-primary p-3 sm:flex text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:bg-white/20 disabled:text-white/40 disabled:pointer-events-none"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Baixar imagem
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
