"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";
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

/**
 * = `--vt-sort-width` (10rem, ver globals.css) convertido para px. Duplicado
 * de propósito — MESMO acoplamento explícito que o keyframe
 * `vt-sort-drawer-down` já assume lá ("2.75rem = w-11 = os 44px do círculo
 * fechado. Se a vaga do gatilho no container mudar, este valor muda junto.").
 * Usado só para decidir, em JS, se o painel de "Ordenar" cabe crescendo para
 * a direita sem estourar a viewport — ver `growLeft` abaixo.
 */
const SORT_PANEL_WIDTH_PX = 160;

/**
 * Piso de largura do painel de "Ordenar" quando nem empurrar os vizinhos
 * (até o limite seguro — ver `useLayoutEffect` abaixo) abre espaço
 * suficiente pros 160px cheios. ~134px é o que "Menor preço"/"Maior preço"
 * (as opções mais longas) precisam com o check e os respiros — MESMO número
 * já citado no comentário de `--vt-sort-width` em globals.css. Abaixo disso
 * os rótulos quebrariam linha, então o painel para de encolher aqui mesmo
 * que ainda sobre pouco espaço (preferível a um resíduo de sobreposição em
 * telas muito apertadas do que texto cortado).
 */
const MIN_SORT_PANEL_WIDTH_PX = 136;

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
  // Só importa no gatilho SÓ-ÍCONE ("Ordenar"): decide se o painel cresce
  // para a DIREITA (comportamento padrão, o mesmo de sempre) ou, quando não
  // há espaço, para a ESQUERDA. Ver o `useLayoutEffect` de medição abaixo.
  const [growLeft, setGrowLeft] = useState(false);
  // `null` = usa `--vt-sort-width` padrão (160px). Um número sobrescreve essa
  // variável só neste container quando, mesmo empurrando os vizinhos até o
  // limite seguro (sem invadir a busca), ainda falta espaço — ver
  // `useLayoutEffect` abaixo.
  const [sortPanelWidthPx, setSortPanelWidthPx] = useState<number | null>(null);
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

  // Detecção de colisão do painel de "Ordenar" com a borda da viewport.
  // `useLayoutEffect` (não `useEffect`): mede e decide o lado ANTES do
  // navegador pintar o primeiro quadro da abertura, senão o painel nasceria
  // crescendo para a direita por um quadro e só depois "pularia" para a
  // esquerda — o próprio flip ficaria visível.
  //
  // POR QUE ISSO E NÃO UM FLIP ESTÁTICO: "Ordenar" é hoje o último controle
  // da barra, mas em telas grandes sobra ~480px+ de margem à direita da
  // barra — crescer para a esquerda ali sobreporia "Entrega" à toa. Medindo
  // o espaço real, o painel só troca de lado quando genuinamente não cabe.
  useLayoutEffect(() => {
    if (!open || triggerVariant !== "icon") return;
    if (typeof window === "undefined") return;

    // Busca encolhida pra abrir espaço real pro painel crescer pra DIREITA
    // (sem precisar flipar) — ver `measure` abaixo. Guardado aqui (não em
    // estado) porque é um efeito colateral direto no DOM de um elemento que
    // este componente NÃO renderiza (é irmão dentro da mesma barra, em
    // filter-bar.tsx) — não há por que re-renderizar por causa disso, e
    // precisamos limpar exatamente esse nó no cleanup.
    let shrunkSearchEl: HTMLElement | null = null;

    function clearSearchShrink() {
      if (!shrunkSearchEl) return;
      shrunkSearchEl.style.flex = "";
      shrunkSearchEl.style.transition = "";
      shrunkSearchEl = null;
    }

    function measure() {
      const el = containerRef.current;
      if (!el) return;

      // Sempre remede a partir do estado NEUTRO (sem encolher nada) — senão
      // um encolhimento de uma medição anterior somaria com o da próxima a
      // cada resize.
      clearSearchShrink();

      // 48rem = 768px = breakpoint `md`. Abaixo disso "Ordenar" é o
      // bottom-sheet mobile (`max-md:fixed inset-x-0 bottom-0`) — o
      // círculo/painel desktop nem está posicionado por `left`/`right`, e
      // medir/encolher a busca ali não faz sentido nenhum (o painel mobile
      // não compete por espaço horizontal com mais nada). Recalculado a
      // cada chamada (não só na primeira) porque `measure` também roda em
      // `resize` — sem isso, girar o celular ou redimensionar a janela pela
      // borda do breakpoint deixaria a decisão presa no valor de quando o
      // painel abriu.
      const isDesktopViewport = window.matchMedia("(min-width: 48rem)").matches;
      if (!isDesktopViewport) {
        setGrowLeft(false);
        setSortPanelWidthPx(null);
        return;
      }

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const shrinkTransition = reduceMotion ? "none" : "flex 200ms var(--vt-drawer-ease)";

      // Ancoragem padrão cresce a partir da borda ESQUERDA do container
      // (mesma origem de sempre); cabe se essa borda + a largura total do
      // painel não ultrapassar a viewport. 8px de folga: o mesmo respiro
      // visual que qualquer popover deveria manter da borda da tela.
      //
      // `document.documentElement.clientWidth`, NÃO `window.innerWidth`: o
      // segundo inclui a barra de rolagem vertical (~14-17px no Chrome
      // desktop), então usá-lo aqui deixava o painel "achar" que cabia
      // crescendo pra direita com uns 6-14px de sobra que na verdade eram a
      // própria barra de rolagem — resultado: um overflow residual pequeno
      // (o mesmo defeito original, só que bem menor).
      const rect = el.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      let overflow = rect.left + SORT_PANEL_WIDTH_PX + 8 - viewportWidth;

      if (overflow > 0) {
        // Primeira tentativa: encolher a BUSCA (não empurrar mais ninguém —
        // ela é o único elemento genuinamente elástico da barra, `md:flex-1`
        // por design, então dar espaço é o papel dela). Isso desloca TUDO
        // que vem depois dela — inclusive o próprio "Ordenar" — pra esquerda
        // via reflow real do flex, não transform: se abrir espaço suficiente,
        // "Ordenar" nem precisa flipar. `MIN_SEARCH_WIDTH_PX` evita a busca
        // sumir num caso extremo de tela muito estreita.
        const MIN_SEARCH_WIDTH_PX = 160;
        // A busca é IRMÃ da faixa de pílulas (não filha) — as duas vivem
        // lado a lado sob um wrapper comum (`flex-col md:flex-row` em
        // filter-bar.tsx). Sobe os ancestrais até achar um que CONTENHA um
        // `<input>` em algum lugar dentro, em vez de assumir uma
        // profundidade fixa — sobrevive a filter-bar.tsx ganhar/perder
        // wrappers no meio (ex.: o toggle "Favoritos" novo).
        let searchScope: HTMLElement | null = el.parentElement;
        let searchInput: HTMLInputElement | null = null;
        for (let hops = 0; searchScope && hops < 6 && !searchInput; hops++) {
          searchInput = searchScope.querySelector("input");
          if (!searchInput) searchScope = searchScope.parentElement;
        }
        const searchEl = searchInput?.parentElement as HTMLElement | null;
        if (searchEl) {
          const searchWidth = searchEl.getBoundingClientRect().width;
          const shrink = Math.max(0, Math.min(overflow, searchWidth - MIN_SEARCH_WIDTH_PX));
          if (shrink > 0) {
            // Duas escritas, não uma: transicionar o SHORTHAND `flex` direto
            // de `flex-1` (1 1 0%) pro alvo (0 0 Npx) anima `flex-grow` e
            // `flex-basis` AO MESMO TEMPO, e a largura renderizada sob
            // `flex-grow` não é um valor fixo — é recalculada pelo algoritmo
            // de flex a cada quadro, então o meio do caminho não é "meio
            // termo" nenhum. Medido ao vivo: a busca encolhia até 345px
            // (bem abaixo do alvo de 442px) antes de voltar pra cima — uma
            // curva em V, não uma transição limpa.
            //
            // Primeiro passo: CONGELA a largura atual (sem transição,
            // `flex-grow`/`shrink` já em 0) — a busca não se move neste
            // instante, só troca de "elástica" pra "largura fixa" na largura
            // que já tinha. `void searchEl.offsetWidth` força o navegador a
            // aplicar esse quadro ANTES do próximo passo, senão as duas
            // escritas colapsariam numa só e a transição pegaria o `flex-1`
            // original de novo como ponto de partida.
            searchEl.style.transition = "none";
            searchEl.style.flex = `0 0 ${searchWidth}px`;
            void searchEl.offsetWidth;
            // Segundo passo: agora é só `flex-basis` andando de um px fixo
            // pro outro — interpolação monotônica garantida, sem o
            // algoritmo de flex redistribuindo espaço no meio do caminho.
            searchEl.style.transition = shrinkTransition;
            searchEl.style.flex = `0 0 ${searchWidth - shrink}px`;
            shrunkSearchEl = searchEl;
            // Calculado, não remedido: encolher a busca em X sempre desloca
            // tudo depois dela em X, então `overflow -= shrink` é exato — e
            // não depende de reler o layout no meio de uma transição CSS
            // recém-disparada, onde o valor "atual" de largura pode não ter
            // se assentado ainda (o `rect.left` fica desatualizado até o
            // reflow do quadro seguinte).
            overflow -= shrink;
          }
        }
      }

      const fitsGrowingRight = overflow <= 0;
      setGrowLeft(!fitsGrowingRight);

      if (fitsGrowingRight) {
        setSortPanelWidthPx(null); // encolher a busca já foi suficiente (ou nem precisou).
        return;
      }

      // Encolher a busca até o piso não foi suficiente: flipa. Mede se cabe
      // exatamente entre a borda ancorada (direita do círculo, + os 6px do
      // `-right-1.5` do gatilho/painel — ver className abaixo) e o elemento
      // anterior de verdade na barra (pula o separador `aria-hidden`; por
      // trás dele está "Entrega"/"Tipo de campo"/etc — sem hardcodar QUAL
      // pílula é). 12px de respiro: suficiente pra ler como duas camadas
      // separadas.
      const GAP_PX = 12;
      const ANCHOR_INSET_PX = 6; // = `-right-1.5` em px
      let boundaryEl = el.previousElementSibling as HTMLElement | null;
      while (boundaryEl && boundaryEl.getAttribute("aria-hidden") === "true") {
        boundaryEl = boundaryEl.previousElementSibling as HTMLElement | null;
      }
      const anchorRight = rect.right + ANCHOR_INSET_PX;
      const boundaryRight = boundaryEl ? boundaryEl.getBoundingClientRect().right : 0;
      const available = anchorRight - boundaryRight - GAP_PX;
      const deficit = SORT_PANEL_WIDTH_PX - available;

      // Último recurso: encolhe só o PAINEL (piso legível, ver
      // `MIN_SORT_PANEL_WIDTH_PX`) — nunca empurra nenhuma pílula. Em telas
      // muito apertadas ainda pode sobrar uma sobreposição pequena com o
      // vizinho; nunca mais com a busca (essa já foi resolvida acima).
      setSortPanelWidthPx(deficit > 0 ? Math.max(MIN_SORT_PANEL_WIDTH_PX, SORT_PANEL_WIDTH_PX - deficit) : null);
    }

    measure();
    // Cobre resize/rotação de tela com o painel já aberto — caso raro, mas
    // sem isso o painel ficaria preso do lado errado (ou com um encolhimento
    // desatualizado) até fechar e reabrir.
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      clearSearchShrink();
    };
  }, [open, triggerVariant]);

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
      // Sobrescreve `--vt-sort-width` (globals.css) só NESTE subtree, só no
      // caso residual em que nem empurrar os vizinhos até o limite seguro
      // abre os 160px inteiros (ver `sortPanelWidthPx`/`useLayoutEffect`
      // acima). `undefined` remove a propriedade — volta a herdar os 160px
      // padrão do `:root`.
      style={sortPanelWidthPx != null ? ({ "--vt-sort-width": `${sortPanelWidthPx}px` } as CSSProperties) : undefined}
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
            // DESKTOP: sai do fluxo e cresce para um dos lados, com a borda
            // OPOSTA ancorada — por padrão para a DIREITA (comportamento
            // original: a borda esquerda fica parada e tudo cresce a partir
            // dela), crescendo pra ESQUERDA só quando `growLeft` (medido no
            // `useLayoutEffect` acima) detecta que os 116px extras (160px do
            // painel menos os 44px do círculo) não cabem sem passar da borda
            // direita da viewport — o bug relatado (scroll horizontal em
            // telas ~1700px ou menos). Flip ESTÁTICO (sempre pra esquerda)
            // foi cogitado e descartado: sobreporia "Entrega" à toa em telas
            // grandes, onde sobra espaço de sobra à direita. Crescer dentro
            // do fluxo empurraria os filtros vizinhos a cada abertura — o
            // container mantém uma vaga fixa de 44px (`md:h-11 md:w-11`,
            // mais abaixo) e o botão se expande por cima dela sem tocar no
            // layout de ninguém.
            // `-right-1.5` (não `right-0`) no lado flipado: empurra a caixa
            // 6px para DENTRO da margem da página (que agora sempre sobra —
            // ver o padding responsivo em page.tsx), abrindo um respiro do
            // mesmo tanto entre o painel e a pílula "Entrega" vizinha. Sem
            // isso as duas bordas se tocavam sem nenhuma folga, lendo como
            // colisão em vez de uma camada flutuando por cima.
            growLeft
              ? "md:absolute md:-right-1.5 md:top-0 md:overflow-hidden"
              : "md:absolute md:left-0 md:top-0 md:overflow-hidden",
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
          {/* Rótulo que preenche o espaço novo. Absoluto e do lado OPOSTO ao
              ícone (que ancora do mesmo lado do botão, ver `growLeft`): no
              fluxo ele disputaria largura com o ícone e empurraria a âncora.
              Entra com atraso na abertura — aparecer antes de existir espaço
              o mostraria cortado pelo `overflow-hidden`; na saída some na
              hora, porque texto encolhendo junto da caixa é o que mais
              denuncia uma animação mal costurada. */}
          <span
            aria-hidden="true"
            className={clsx(
              "pointer-events-none absolute top-1/2 hidden -translate-y-1/2 whitespace-nowrap text-sm font-medium text-gray-700 transition-opacity md:block",
              growLeft ? "right-10" : "left-10",
              isPanelMounted && !closing
                ? "opacity-100 duration-150 delay-[90ms]"
                : "opacity-0 duration-[90ms]"
            )}
          >
            Ordenar por
          </span>

          {/* Âncora: 11px da borda ancorada (esquerda por padrão, direita
              quando `growLeft`) = exatamente o centro dos 44px fechados
              (1px de borda + 11 + 10 de meio-ícone = 22), simétrico dos dois
              lados porque a caixa fechada é 44×44. O ícone não se move em
              nenhum quadro da abertura — tudo cresce do lado oposto a ele.
              O span externo posiciona, o interno mergulha: as duas coisas
              escrevem em `transform` e uma apagaria a outra. */}
          <span
            className={clsx(
              "pointer-events-none md:absolute md:top-1/2 md:-translate-y-1/2",
              growLeft ? "md:right-[11px]" : "md:left-[11px]"
            )}
          >
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
              // Ordenar ancora pela mesma borda do gatilho (ver `growLeft`),
              // na largura enxuta do token — a MESMA que o gatilho aberto
              // assume, que é o que faz o círculo virar o topo do painel em
              // vez de duas peças encostadas. Por padrão ancora pela
              // ESQUERDA (cresce pra direita, comportamento original); só
              // ancora pela direita (cresce pra esquerda) quando o
              // `useLayoutEffect` acima detecta que os 116px extras (160px
              // do painel menos os 44px do círculo) não cabem sem passar da
              // borda direita da viewport — "Ordenar" é o último controle da
              // barra, então em telas menores esses 116px vazavam para fora
              // da página, empurrando o documento inteiro e criando scroll
              // horizontal. Um flip ESTÁTICO (sempre pela direita) resolveria
              // o overflow mas sobreporia "Entrega" também em telas grandes,
              // onde nunca faltou espaço — por isso a decisão é medida, não
              // fixa. Antes tinha `md:rounded-tl-xl md:border-t`, ou seja, os
              // quatro cantos arredondados e borda completa — lia como
              // cartão flutuante solto embaixo do círculo, que é o vão que
              // estamos matando. Os demais herdam a largura exata da própria
              // pílula.
              // `-right-1.5`, não `right-0`, quando flipado: mesma folga de
              // 6px do gatilho acima — as duas caixas precisam mover
              // JUNTAS, senão o círculo aberto (que É o topo do painel)
              // ficaria desalinhado da gaveta que abre embaixo dele.
              triggerVariant === "icon"
                ? clsx("md:w-[var(--vt-sort-width)]", growLeft ? "md:-right-1.5" : "md:left-0")
                : "md:left-0 md:w-full",
              // Sombra em duas camadas: uma curta e densa (contato) e uma
              // longa e difusa (ambiente) — é o que separa um painel com
              // presença física de uma "caixa flutuante" genérica. O VALOR
              // vem de `--vt-sort-shadow` (globals.css), lido pelos
              // keyframes `vt-sort-drawer-*` — não um `shadow-[...]` fixo
              // aqui, porque o componente precisa poder reforçá-lo.
              growLeft &&
                triggerVariant === "icon" &&
                // Reforçada só quando o painel flipa por cima de "Entrega":
                // a calibragem padrão (pensada pra pairar sobre a lista de
                // produtos, fundo branco vazio) some visualmente quando
                // encosta em outra pílula com borda própria — as duas bordas
                // ficam com o mesmo peso e a sobreposição lê como colisão,
                // não como uma camada flutuando por cima.
                "[--vt-sort-shadow:0_2px_8px_-2px_rgb(0_0_0/0.10),0_24px_48px_-8px_rgb(0_0_0/0.30)]",
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
