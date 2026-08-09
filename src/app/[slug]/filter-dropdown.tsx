"use client";

import { useCallback, useEffect, useId, useRef, useState, type ComponentType, type CSSProperties } from "react";
import { Check, ChevronDown } from "lucide-react";
import clsx from "clsx";
import { getContrastTextColor } from "@/lib/color/contrast";
import { lockScroll } from "@/lib/ui/scroll-lock";

/**
 * Duração do desmonte após pedir o fechamento. Precisa ser MAIOR que a mais
 * longa das animações de saída — desmontar antes cortaria o movimento no
 * meio. Hoje as saídas são: gaveta das pílulas 170ms, bottom-sheet mobile
 * 200ms, gaveta do "Ordenar" 200ms (a única que colapsa em dois eixos).
 * A folga de 20ms existe para o desmonte nunca cair EXATAMENTE no último
 * quadro da animação, que engoliria o fim do movimento.
 */
const EXIT_DURATION_MS = 220;

/**
 * Espera até a gaveta do desktop terminar de abrir (260ms de
 * `animate-drawer-down`/`animate-sort-drawer-down`) antes de a lista de opções
 * virar rolável. Durante a animação a linha da grade vale menos que a altura
 * do conteúdo, então um `overflow-y-auto` ligado desde o primeiro quadro faz o
 * navegador pintar uma barra de rolagem que some sozinha ao fim do movimento.
 * A folga de 20ms é a mesma disciplina de `EXIT_DURATION_MS`.
 */
const SETTLE_DURATION_MS = 280;

export type DropdownOption = {
  value: string;
  label: string;
};

export type FilterDropdownProps = {
  /** Rótulo do botão quando nada está selecionado ("Marca", "Entrega"…). */
  label: string;
  options: readonly DropdownOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  /**
   * `false` = seleção única (Ordenar): escolher uma opção fecha o painel e
   * substitui a anterior. `true` = multi (Marca/Tipo/Entrega): o painel
   * fica aberto para o cliente marcar várias.
   */
  multiple: boolean;
  /** Cor de destaque da loja — pinta o estado ativo. */
  accentColor: string;
  /**
   * `"pill"` (padrão) = botão com borda, texto e chevron — Marca/Tipo de
   * campo/Entrega. `"icon"` = só o SVG de `triggerIcon`, sem texto nem
   * borda — usado por "Ordenar", que ganhou um ícone dedicado em vez do
   * rótulo + seta genérica (pedido do usuário: ordenar já tem semântica
   * visual própria, não precisa de texto pra ser reconhecido).
   */
  triggerVariant?: "pill" | "icon";
  /** Ícone do gatilho no modo `"icon"` — ignorado no modo `"pill"`. */
  triggerIcon?: ComponentType<{ className?: string; style?: CSSProperties; "aria-hidden"?: boolean }>;
};

/**
 * Controle de filtro da vitrine pública: um botão que abre um painel de
 * opções. Substitui as três fileiras de chips soltos da versão anterior,
 * que ocupavam 211px de altura fixa antes de qualquer produto aparecer e
 * não diziam a que categoria cada chip pertencia (o cliente final não tem
 * como saber que "TF" é tipo de solado).
 *
 * Popover no desktop / bottom-sheet no mobile decidido 100% por CSS
 * (`max-md:` vs `md:`) — MESMA disciplina de `[slug]/page.tsx` para a
 * paginação adaptativa: nunca detecção de device em JS, que erraria em
 * tablet, janela redimensionada e webview in-app.
 *
 * Fecha em: clique fora, Escape, e (no modo single) ao escolher. O foco
 * volta para o botão ao fechar — sem isso, quem navega por teclado é jogado
 * para o início do documento a cada uso.
 */
export function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
  multiple,
  accentColor,
  triggerVariant = "pill",
  triggerIcon: TriggerIcon,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  // `closing` mantém o painel MONTADO durante a animação de saída. Sem este
  // estado o React desmonta na hora e o painel pisca e some — o defeito que
  // mais faz uma interface parecer quebrada.
  const [closing, setClosing] = useState(false);
  // `true` só depois que a gaveta terminou de abrir — ver SETTLE_DURATION_MS.
  const [settled, setSettled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();

  // Arrasto-para-fechar do bottom-sheet. `dragY` acompanha o dedo em tempo
  // real (o painel gruda no toque); `dragging` desliga a transição durante
  // o movimento, senão cada quadro ficaria interpolando e o painel
  // pareceria atrasado em relação ao dedo.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; time: number } | null>(null);
  const lastMoveRef = useRef<{ y: number; time: number } | null>(null);

  const hasSelection = selected.length > 0;
  const isDarkText = getContrastTextColor(accentColor) === "dark";
  // Painel presente no DOM: aberto ou ainda animando a saída. O gatilho
  // precisa manter a aparência "fundida" durante todo o fechamento, senão
  // os cantos voltam a arredondar antes do painel sumir e a emenda pisca.
  const isPanelMounted = open || closing;

  /**
   * Fecha o painel ANIMANDO a saída, em vez de desmontar de imediato.
   *
   * `viaDrag` distingue os dois caminhos porque eles escrevem na MESMA
   * propriedade e brigariam: o arrasto já controla `transform` via `dragY`
   * com transição inline, então nesse caso basta empurrar o painel para
   * fora e deixar a transição existente terminar o gesto — aplicar por cima
   * o keyframe de saída faria o painel saltar de volta ao ponto inicial da
   * animação antes de descer.
   */
  const requestClose = useCallback(function requestClose({
    viaDrag = false,
    refocus = true,
  }: { viaDrag?: boolean; refocus?: boolean } = {}) {
    if (closing) return;

    dragStartRef.current = null;
    lastMoveRef.current = null;
    setDragging(false);
    // A saída também encolhe a linha da grade — manter a lista rolável aqui
    // traria a barra de rolagem de volta durante o fechamento.
    setSettled(false);

    if (viaDrag) {
      // Continua de onde o dedo parou até sumir — sem "reset" visível.
      setDragY(typeof window !== "undefined" ? window.innerHeight : 1000);
    }
    setClosing(true);

    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setDragY(0);
      if (refocus) triggerRef.current?.focus();
    }, EXIT_DURATION_MS);
  }, [closing]);

  // Limpa o timer pendente se o componente sumir no meio do fechamento —
  // sem isso, o setState do timeout roda sobre um componente desmontado.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Libera a rolagem da lista só com a gaveta já aberta. Um timer (e não
  // `animationend`) porque com `prefers-reduced-motion` a animação nunca roda
  // e o evento nunca chegaria — a lista ficaria presa sem rolagem.
  useEffect(() => {
    if (!open || closing) return;
    const timer = setTimeout(() => setSettled(true), SETTLE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [open, closing]);

  function handleDragStart(clientY: number) {
    const now = performance.now();
    dragStartRef.current = { y: clientY, time: now };
    lastMoveRef.current = { y: clientY, time: now };
    setDragging(true);
  }

  function handleDragMove(clientY: number) {
    const start = dragStartRef.current;
    if (!start) return;
    lastMoveRef.current = { y: clientY, time: performance.now() };
    const delta = clientY - start.y;
    // Só para baixo. Puxar para cima aplica resistência (divide por 4) em
    // vez de travar seco — travar dá sensação de elemento quebrado.
    setDragY(delta >= 0 ? delta : delta / 4);
  }

  function handleDragEnd() {
    const start = dragStartRef.current;
    const last = lastMoveRef.current;
    dragStartRef.current = null;
    lastMoveRef.current = null;
    setDragging(false);

    if (!start || !last) {
      setDragY(0);
      return;
    }

    // Fecha por DISTÂNCIA (arrastou mais de 96px) OU por VELOCIDADE (flick
    // rápido acima de 0,5px/ms). Só distância obrigaria um arrasto longo
    // mesmo depois de um gesto claro de descarte; só velocidade ignoraria
    // quem arrasta devagar até embaixo.
    const elapsed = Math.max(last.time - start.time, 1);
    const velocity = (last.y - start.y) / elapsed;
    const shouldClose = dragY > 96 || velocity > 0.5;

    if (shouldClose) {
      requestClose({ viaDrag: true });
      return;
    }
    setDragY(0);
  }

  useEffect(() => {
    if (!open) return;

    // Ambos zeram o estado de arrasto junto: sem isso, fechar o painel
    // durante um arrasto (Escape no teclado, toque fora) o deixaria com um
    // `dragY` residual, e ele reabriria já deslocado para baixo.
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        // Sem devolver o foco: quem clicou fora já escolheu outro alvo, e
        // roubar o foco de volta pro gatilho atrapalharia a navegação.
        requestClose({ refocus: false });
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      requestClose();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, requestClose]);

  // Trava o scroll do corpo APENAS enquanto o bottom-sheet mobile está
  // aberto. Acima de md o painel é um popover ancorado e a página deve
  // continuar rolando normalmente, então a trava é condicionada à mesma
  // media query que decide o formato — em JS aqui porque `overflow` do body
  // não é expressável na classe do painel.
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 768px)").matches) return;

    // `lockScroll` (e não `body.style.overflow` na mão) porque travar a
    // rolagem remove a barra da janela e desloca o layout inteiro; o
    // utilitário devolve essa largura em `padding-right`. Ver
    // src/lib/ui/scroll-lock.ts.
    return lockScroll();
  }, [open]);

  function handleSelect(value: string) {
    onToggle(value);
    if (!multiple) requestClose();
  }

  // No modo single (Ordenar) o botão mostra a opção escolhida — "Menor
  // preço" comunica mais que "Ordenar (1)". No multi, um contador é o
  // resumo honesto de "Nike, Adidas" sem estourar a largura do botão.
  const singleLabel = !multiple && hasSelection ? options.find((o) => o.value === selected[0])?.label : null;
  const triggerLabel = singleLabel ?? label;
  // No gatilho só-ícone o texto nunca aparece na tela, então o aria-label
  // precisa carregar sozinho o contexto que a pílula normalmente dava de
  // graça: "Ordenar" quando neutro, "Ordenar: Menor preço" quando ativo —
  // só "Menor preço" perderia a ligação com a ação pro leitor de tela.
  const iconAriaLabel = hasSelection ? `${label}: ${triggerLabel}` : label;

  return (
    <div
      ref={containerRef}
      className={clsx(
        "relative shrink-0",
        // Vaga fixa de 44px no desktop para o gatilho só-ícone, que sai do
        // fluxo ao abrir (ver o botão abaixo). Sem ela o container colapsaria
        // para largura zero e a barra inteira se reorganizaria a cada clique.
        triggerVariant === "icon" && "md:h-11 md:w-11"
      )}
    >
      {triggerVariant === "icon" && TriggerIcon ? (
        // Gatilho só-ícone (Ordenar): sem pílula, sem texto visível — o
        // desenho do próprio SVG já comunica "ordenar". `aria-label` cobre
        // leitor de tela; SEM tooltip visual de propósito (decisão do
        // usuário) — em toque não existe hover pra exibir um balão, e um
        // rótulo condicional só-desktop criaria uma diferença de
        // comportamento entre plataformas maior do que o ganho.
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? requestClose() : setOpen(true))}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? panelId : undefined}
          aria-label={iconAriaLabel}
          className={clsx(
            "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.375rem] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2",
            // DESKTOP: sai do fluxo e cresce PARA A DIREITA, com a borda
            // esquerda ancorada. Crescer dentro do fluxo empurraria os
            // filtros vizinhos a cada abertura — o container mantém uma vaga
            // fixa de 44px (`md:h-11 md:w-11`, mais abaixo) e o botão se
            // expande por cima dela sem tocar no layout de ninguém.
            "md:absolute md:left-0 md:top-0 md:overflow-hidden",
            // Borda sempre presente (só muda de cor): pintá-la apenas ao
            // abrir mudaria a caixa em 1px e o ícone tremeria.
            //
            // As duas cores são MUTUAMENTE EXCLUSIVAS de propósito — nunca
            // as duas classes no mesmo elemento. Quando coexistiam,
            // `md:border-transparent` e `md:border-gray-200` eram variantes
            // `md:` da MESMA propriedade e com a MESMA especificidade: quem
            // vencia era a que o Tailwind emitisse por último no stylesheet
            // (a transparente), não a ordem escrita aqui. Resultado: o
            // contorno cinza nunca aparecia, e um botão branco sem contorno
            // sobre fundo branco lia como um vão entre ele e o painel.
            "md:border",
            isPanelMounted
              ? // Aberto, o botão É o topo da gaveta: mesma largura do painel,
                // cantos de baixo retos, borda inferior apagada (a emenda) e
                // fundo branco — o mesmo desenho das pílulas abertas.
                "md:w-[var(--vt-sort-width)] md:rounded-b-none md:border-gray-200 md:border-b-transparent md:bg-white"
              : "md:w-11 md:border-transparent",
            // Hover cinza só faz sentido no estado fechado; mantê-lo ativo
            // brigaria com o branco do topo da gaveta.
            !isPanelMounted && "hover:bg-gray-100",
            // Régua casada com `animate-sort-drawer-*`. Note que durante
            // `closing` a largura NÃO muda: `isPanelMounted` continua true, e
            // é essa a razão de o gatilho ficar largo até o painel sumir —
            // encolher lateralmente ao lado de texto visível era o que
            // incomodava. A volta para 44px acontece no ramo de baixo
            // (`duration-150`), depois que o painel já foi desmontado.
            closing
              ? "duration-[170ms] ease-[cubic-bezier(0.4,0,1,1)]"
              : isPanelMounted
                ? "duration-[260ms] ease-[var(--vt-drawer-ease)]"
                : "duration-150"
          )}
        >
          {/* Rótulo que preenche o espaço novo. Absoluto e à esquerda: no
              fluxo ele disputaria largura com o ícone e empurraria a âncora.
              Entra com atraso na abertura — aparecer antes de existir espaço
              o mostraria cortado pelo `overflow-hidden`; na saída some na
              hora, porque texto encolhendo junto da caixa é o que mais
              denuncia uma animação mal costurada. */}
          <span
            aria-hidden="true"
            className={clsx(
              "pointer-events-none absolute left-10 top-1/2 hidden -translate-y-1/2 whitespace-nowrap text-sm font-medium text-gray-700 transition-opacity md:block",
              isPanelMounted && !closing
                ? "opacity-100 duration-150 delay-[90ms]"
                : "opacity-0 duration-[90ms]"
            )}
          >
            Ordenar por
          </span>

          {/* Âncora: 11px da borda esquerda = exatamente o centro dos 44px
              fechados (1px de borda + 11 + 10 de meio-ícone = 22). O ícone
              não se move em nenhum quadro da abertura — tudo cresce à direita
              dele. O span externo posiciona, o interno mergulha: as duas
              coisas escrevem em `transform` e uma apagaria a outra. */}
          <span className="pointer-events-none md:absolute md:left-[11px] md:top-1/2 md:-translate-y-1/2">
            <span className={clsx("block", open && !closing && "animate-icon-dip")}>
              <TriggerIcon
                className="h-5 w-5"
                style={hasSelection ? { color: accentColor } : undefined}
                aria-hidden={true}
              />
            </span>
          </span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? requestClose() : setOpen(true))}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? panelId : undefined}
          style={hasSelection ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
          className={clsx(
            "flex min-h-11 items-center gap-1.5 whitespace-nowrap border px-3.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2",
            // O gatilho anda no MESMO tempo e na MESMA curva da gaveta — 260ms
            // abrindo, 170ms fechando. Com os 150ms fixos de antes ele trocava
            // de forma quase instantaneamente e ficava esperando o painel
            // chegar: durante a abertura sobrava uma pílula de cantos retos com
            // a borda de baixo já apagada e NADA embaixo dela. Botão e painel
            // são a mesma peça; se um se transforma antes do outro, a emenda
            // denuncia que são dois elementos animando por conta própria.
            closing
              ? "duration-[170ms] ease-[cubic-bezier(0.4,0,1,1)]"
              : isPanelMounted
                ? "duration-[260ms] ease-[var(--vt-drawer-ease)]"
                : "duration-150",
            // Largura mínima uniforme no desktop: é ela que dá aos painéis
            // (que herdam `w-full` do gatilho) espaço legível mantendo a
            // largura IDÊNTICA à pílula. Sem isso, "Marca" (~95px) geraria
            // um painel onde "New Balance" quebraria em duas linhas.
            // No mobile a barra rola horizontalmente e pílulas largas
            // custariam alcance do polegar, então o piso não se aplica.
            "md:min-w-[11rem] md:justify-between",
            // Aberto: cantos de baixo retos + sem borda inferior, para o
            // painel colado continuar a mesma peça. `rounded-full` viraria
            // uma emenda torta contra o painel reto.
            // Raio EXPLÍCITO (22px = metade da altura de 44px) e não
            // `rounded-full`. `rounded-full` é 9999px na prática, clampado
            // pelo navegador aos 22px visíveis — animar 9999px → 0 gastaria
            // 99,8% da transição num trecho onde o desenho não muda, e o
            // canto só desabaria no último instante. Com 22px reais a
            // interpolação é honesta e o canto acompanha a gaveta.
            "rounded-[1.375rem]",
            // Só os cantos DE BAIXO abrem, e só no desktop. O topo mantém os
            // mesmos 22px — trocar para `rounded-t-xl` (20px) daria um salto
            // de 2px nos cantos de cima que nada justifica.
            isPanelMounted && "md:rounded-b-none md:border-b-transparent",
            hasSelection
              ? isDarkText
                ? "text-gray-900"
                : "text-white"
              : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
          )}
        >
          {triggerLabel}
          {multiple && hasSelection && (
            <span
              className={clsx(
                "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold tabular-nums",
                isDarkText ? "bg-black/15 text-gray-900" : "bg-white/25 text-white"
              )}
            >
              {selected.length}
            </span>
          )}
          <ChevronDown
            /* Mesma duração e MESMA curva da gaveta (`--vt-drawer-ease`, em
               globals.css): botão e painel precisam ler como um mecanismo
               único. Com o chevron em `duration-200`/ease padrão ele
               terminava de girar antes de a gaveta terminar de abrir, e os
               dois pareciam animações independentes que só por acaso
               começaram juntas. */
            className={clsx(
              "h-4 w-4 shrink-0 transition-transform",
              closing
                ? "duration-[170ms] ease-[cubic-bezier(0.4,0,1,1)]"
                : "duration-[260ms] ease-[var(--vt-drawer-ease)]",
              isPanelMounted && "rotate-180"
            )}
            aria-hidden="true"
          />
        </button>
      )}

      {isPanelMounted && (
        <>
          {/* Véu do bottom-sheet — só existe abaixo de md. Precisa fechar
              por clique PRÓPRIO: ele é filho de `containerRef`, então o
              listener global de pointerdown (que só dispara para alvos
              FORA do container) nunca o alcança. Sem isso, tocar na área
              escura não faria nada — um beco sem saída, agora que não há
              mais botão de confirmar. */}
          <div
            onPointerDown={() => requestClose({ refocus: false })}
            className={clsx("fixed inset-0 z-40 bg-black/40 md:hidden", closing ? "animate-fade-out" : "animate-fade-in")}
            aria-hidden="true"
          />

          <div
            id={panelId}
            role="listbox"
            aria-multiselectable={multiple}
            aria-label={label}
            className={clsx(
              "z-50 flex flex-col overflow-hidden bg-white",
              // Desktop vira GRADE de uma linha só: é `grid-template-rows`
              // que a gaveta anima (0fr → 1fr), porque `1fr` resolve para a
              // altura real do conteúdo. Ver o comentário do keyframe em
              // globals.css para o defeito que isto corrige.
              "md:grid md:grid-rows-[0fr]",
              // Mobile: folha ancorada no rodapé, largura total, cantos só
              // no topo. `pb-[env(safe-area-inset-bottom)]` evita que a
              // última opção fique sob a barra de gestos do iOS.
              "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[70dvh] max-md:rounded-t-2xl max-md:pb-[env(safe-area-inset-bottom)] max-md:shadow-2xl",
              // A animação de entrada é suprimida enquanto o dedo arrasta:
              // as duas escrevem em `transform` e brigariam pelo controle.
              !closing && !dragging && dragY === 0 && "max-md:animate-sheet-up",
              // Saída no mobile só via keyframe quando NÃO foi arrasto — no
              // arrasto o próprio `dragY` já leva o painel para fora.
              closing && dragY === 0 && "max-md:animate-sheet-down",

              // ---------------- DESKTOP ----------------
              // COLADO ao gatilho: `top-full` sem margem, borda de cima
              // removida e cantos superiores retos. O painel e a pílula
              // passam a ler como UMA peça contínua, não uma janela solta
              // pairando embaixo (era `mt-2` + `rounded-xl` nos 4 cantos).
              "md:absolute md:top-full md:max-h-80 md:rounded-b-xl md:rounded-t-none md:border md:border-t-0 md:border-gray-200",
              // Ordenar ancora pela borda ESQUERDA e abre para a direita
              // (decisão do usuário), na largura enxuta do token — a MESMA
              // que o gatilho aberto assume, que é o que faz o círculo virar
              // o topo do painel em vez de duas peças encostadas. Antes tinha
              // `md:rounded-tl-xl md:border-t`, ou seja, os quatro cantos
              // arredondados e borda completa — lia como cartão flutuante
              // solto embaixo do círculo, que é o vão que estamos matando.
              // Os demais herdam a largura exata da própria pílula.
              triggerVariant === "icon"
                ? "md:left-0 md:w-[var(--vt-sort-width)]"
                : "md:left-0 md:w-full",
              // Sombra em duas camadas: uma curta e densa (contato) e uma
              // longa e difusa (ambiente) — é o que separa um painel com
              // presença física de uma "caixa flutuante" genérica.
              "md:shadow-[0_2px_4px_-2px_rgb(0_0_0/0.06),0_16px_32px_-12px_rgb(0_0_0/0.20)]",
              // Gaveta: a altura se desdobra a partir da borda do botão.
              // Sem fade, de propósito — ver os keyframes em globals.css.
              // Ordenar usa a variante PAREADA da gaveta, que anima largura e
              // altura no MESMO keyframe — é o único gatilho que muda de
              // largura ao abrir (círculo de 44px → largura do painel). Com a
              // gaveta genérica, que só anima altura, o painel já nascia com
              // a largura final enquanto o botão ainda crescia: no meio da
              // abertura o botão ficava mais estreito que o painel aberto
              // embaixo dele, e isso lê como atraso. Uma animação só em vez
              // de duas em paralelo torna a dessincronia impossível.
              triggerVariant === "icon"
                ? clsx(!closing && "md:animate-sort-drawer-down", closing && "md:animate-sort-drawer-up")
                : clsx(!closing && "md:animate-drawer-down", closing && "md:animate-drawer-up")
            )}
            style={{
              ...(dragY !== 0 ? { transform: `translateY(${dragY}px)` } : null),
              // Sem transição durante o arrasto (o painel tem que colar no
              // dedo); com transição ao soltar, para voltar ao lugar.
              transition: dragging ? "none" : "transform 220ms cubic-bezier(.22,1,.36,1)",
            }}
          >
            {/* Item único da grade no desktop. `min-h-0` é obrigatório: sem
                ele um item de grade se recusa a encolher abaixo da altura do
                próprio conteúdo, a linha nunca chega a 0fr e a gaveta não sai
                do lugar. `overflow-hidden` é o que faz a borda REVELAR a
                lista deslizando, em vez de o conteúdo se comprimir junto.
                No mobile o wrapper desaparece (`display: contents`) para o
                bottom-sheet continuar sendo o mesmo flex de antes. */}
            <div
              className={clsx(
                "contents md:flex md:min-h-0 md:flex-col md:overflow-hidden",
                // Largura FIXA no Ordenar: o painel dele encolhe até 44px
                // durante a animação, e sem travar o conteúdo os rótulos
                // ("Mais recentes") refluiriam quebrando linha a cada quadro.
                // Travado, eles ficam parados e a borda do painel os REVELA,
                // que é o mesmo gesto de persiana da abertura vertical.
                triggerVariant === "icon" && "md:w-[var(--vt-sort-width)]"
              )}
            >
            {/* Alça + título: só no mobile, onde a folha perde a conexão
                visual com o botão que a abriu e precisa se identificar.
                Toda esta faixa é a área de arrasto — não só o tracinho, que
                sozinho seria um alvo de ~4px de altura, impossível de pegar
                com o polegar. `touch-none` impede o navegador de interpretar
                o gesto como rolagem da página por baixo do painel. */}
            <div
              onTouchStart={(event) => handleDragStart(event.touches[0].clientY)}
              onTouchMove={(event) => handleDragMove(event.touches[0].clientY)}
              onTouchEnd={handleDragEnd}
              onTouchCancel={handleDragEnd}
              className="flex touch-none select-none flex-col items-center gap-2 border-b border-gray-100 px-4 pb-3 pt-3 md:hidden"
            >
              <span
                className={clsx(
                  "h-1.5 w-11 rounded-full transition-colors duration-150",
                  dragging ? "bg-gray-400" : "bg-gray-300"
                )}
                aria-hidden="true"
              />
              <span className="font-display text-base font-bold text-gray-900">{label}</span>
            </div>

            {/* Rolagem só no mobile (folha nasce na altura final) e, no
                desktop, só depois de a gaveta assentar — ligada durante a
                animação, a barra de rolagem aparecia e sumia sozinha. */}
            <div
              className={clsx(
                "flex-1 overscroll-contain p-1.5 max-md:overflow-y-auto",
                settled ? "md:overflow-y-auto" : "md:overflow-hidden"
              )}
            >
              {options.map((option) => {
                const active = selected.includes(option.value);
                return (
                  <button
                    key={`${option.value}-${option.label}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => handleSelect(option.value)}
                    className={clsx(
                      "flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm transition-colors duration-150",
                      active ? "font-semibold text-gray-900" : "text-gray-700 hover:bg-gray-50"
                    )}
                    style={active ? { backgroundColor: `${accentColor}14` } : undefined}
                  >
                    {option.label}
                    {active && <Check className="h-4 w-4 shrink-0" style={{ color: accentColor }} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            {/* Rodapé só existe quando há algo para limpar. Não há mais
                botão de confirmar: fechar é gesto — arrastar a alça para
                baixo no mobile, clicar fora no desktop. Um botão "Ver
                produtos" era um passo extra para uma ação que o próprio
                gesto (ou o clique fora) já resolve, e a lista atrás do
                painel já atualiza a cada toque. */}
            {multiple && hasSelection && (
              <div className="border-t border-gray-100 p-2">
                <button
                  type="button"
                  onClick={onClear}
                  className="min-h-11 w-full rounded-lg px-3 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-100 md:min-h-9"
                >
                  Limpar seleção
                </button>
              </div>
            )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
