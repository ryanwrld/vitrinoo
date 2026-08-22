"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { Monitor, Smartphone } from "lucide-react";
import { StoreHero, type StoreHeroData } from "@/app/[slug]/store-hero";

type Device = "desktop" | "mobile";

const WIDE_SCREEN_QUERY = "(min-width: 1024px)";

function subscribeToWideScreen(onChange: () => void) {
  const media = window.matchMedia(WIDE_SCREEN_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function readWideScreen() {
  return window.matchMedia(WIDE_SCREEN_QUERY).matches;
}

/**
 * Larguras-alvo de cada modo.
 *
 * `DESKTOP_WIDTH` é o PISO do modo computador (1024px = onde o hero já lê
 * como desktop), não a largura que ele tenta ocupar: acima disso o diálogo
 * acompanha a janela até o teto de 1120px da classe. O teto existe porque a
 * 96vw a prévia cobria a tela inteira de um laptop e virava uma segunda
 * página em cima do painel, em vez de um cartão sobre ele — e o que importa
 * aqui é o enquadramento, que a 1120px já é o mesmo de um desktop real.
 */
const DESKTOP_WIDTH = 1024;
const MOBILE_WIDTH = 390;

/**
 * Prévia do topo da vitrine pública.
 *
 * O QUE ELA MOSTRA
 *
 * O componente `StoreHero` DE VERDADE — o mesmo arquivo que a rota `/[slug]`
 * renderiza — alimentado pelo estado ATUAL do formulário, inclusive o que
 * ainda não foi salvo. A versão anterior desta prévia era um markup
 * reescrito à mão (faixa chapada na cor da loja, logo centralizado) que
 * ficou para trás quando o cabeçalho foi redesenhado: quem clicava no olho
 * via uma vitrine que não existia mais. Reusar o componente é o que impede
 * essa divergência de voltar — se o hero mudar amanhã, a prévia muda junto,
 * sem ninguém lembrar de sincronizar.
 *
 * TAMANHO REAL, NÃO MINIATURA
 *
 * Nada de `scale`. Uma prévia encolhida mente sobre o que importa aqui:
 * quanto do banner cabe, se o nome quebra em duas linhas, se a frase some
 * na terceira. O conteúdo é desenhado na largura real do dispositivo
 * escolhido, e quando a janela do painel é menor que essa largura o bloco
 * ROLA na horizontal em vez de encolher — as proporções continuam as da
 * vitrine.
 *
 * A ALTERNÂNCIA
 *
 * Dois modos, porque os dois enquadramentos são legitimamente diferentes
 * (no celular a capa tem altura fixa de 128px; no desktop ela segue a
 * proporção do arquivo). O modo inicial acompanha a tela de quem está
 * editando — quem abre num notebook começa no desktop, quem abre no celular
 * começa no mobile —, e o botão troca a partir daí:
 *
 * - Desktop num monitor grande: largura real da janela, até o teto de 1400px
 *   do diálogo. É o cenário do print do usuário.
 * - Desktop num celular/janela estreita: 1180px fixos com rolagem lateral.
 *   É a única forma honesta de mostrar um layout largo numa tela estreita.
 * - Mobile em qualquer tela: coluna de 390px centralizada, com moldura, para
 *   não ler como "site quebrado no meio da página".
 */
export function VitrinePreviewDialog({
  dialogRef,
  store,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  store: StoreHeroData;
}) {
  // Modo PADRÃO = largura da tela de quem edita, lido por `useSyncExternalStore`
  // (e não por um `setState` dentro de efeito, que dispara render em cascata):
  // no servidor devolve `true`, o mesmo valor que o painel desktop assume, então
  // a hidratação bate. Assim que o revendedor clica num dos dois botões, o
  // `override` passa a mandar e o redimensionamento da janela nunca mais desfaz
  // a escolha dele no meio da conferência.
  const isWideScreen = useSyncExternalStore(subscribeToWideScreen, readWideScreen, () => true);
  const [override, setOverride] = useState<Device | null>(null);

  const device: Device = override ?? (isWideScreen ? "desktop" : "mobile");
  const isMobile = device === "mobile";

  /**
   * A moldura de celular (cantos, borda, respiro em volta) só faz sentido
   * quando se SIMULA um celular a partir de um desktop. Aberta no próprio
   * celular, ela cobrava caro: o respiro de 16px de cada lado mais a borda
   * deixavam a vitrine em 320px num aparelho de 390px — o revendedor conferia
   * quebras de linha, tamanho do nome e enquadramento da capa num aparelho
   * 18% mais estreito que o dele. Numa prévia, isso não é decoração perdida,
   * é informação errada.
   *
   * Então no celular o modo celular é a vitrine na largura inteira do
   * diálogo, sem moldura — é o próprio aparelho fazendo o papel de moldura.
   */
  const showPhoneFrame = isMobile && isWideScreen;
  // Marca que a troca veio de um CLIQUE, e não da primeira abertura: o fade do
  // palco deve rodar ao alternar, nunca sobre o conteúdo que acabou de abrir.
  const switchedRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const setDevice = useCallback((value: Device) => {
    switchedRef.current = true;
    setOverride(value);
  }, []);

  /**
   * A alternância no CELULAR.
   *
   * Aqui NÃO existe animação própria de altura — e isso é a correção de uma
   * que existiu. A primeira versão media a altura antes e depois da troca e
   * interpolava entre as duas com a Web Animations API. Funcionava enquanto a
   * moldura interna trocava de tamanho num quadro só; parou de funcionar
   * quando ela passou a animar a largura junto com a caixa, porque a altura do
   * cabeçalho depende da largura em que ele é desenhado (o nome quebra em duas
   * linhas, a capa muda de proporção). O destino medido no primeiro quadro
   * ficava desatualizado no segundo: a caixa percorria 471→537px em 440ms e
   * então SALTAVA para 613px ao terminar — exatamente o defeito que a animação
   * deveria remover, só que adiado.
   *
   * Com a largura interpolando, a altura já acompanha sozinha, quadro a
   * quadro, porque o conteúdo reflui a cada passo. O fade do palco continua,
   * para o conteúdo novo não aparecer de estalo no meio do caminho.
   */
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !switchedRef.current) return;
    switchedRef.current = false;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    stage.animate(
      [{ opacity: 0.35 }, { opacity: 1 }],
      // Mais curto que os 440ms da caixa de propósito: o conteúdo termina de
      // aparecer enquanto ela ainda se acomoda, em vez de os dois pararem no
      // mesmo instante.
      { duration: 340, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }
    );
  }, [device]);

  // Ao FECHAR, a escolha manual é descartada: a próxima abertura volta ao modo
  // do aparelho de quem está editando. Sem isso, quem espiou o enquadramento de
  // computador uma vez no celular reabriria a prévia sempre em 1180px rolando
  // de lado — um estado que ele escolheu para uma conferência pontual, não uma
  // preferência que quis guardar.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const reset = () => setOverride(null);
    dialog.addEventListener("close", reset);
    return () => dialog.removeEventListener("close", reset);
  }, [dialogRef]);

  return (
    <dialog
      ref={dialogRef}
      // A largura acompanha o MODO, não um valor único. No modo celular um
      // diálogo de 1400px deixaria a moldura de 390px boiando no meio de um
      // palco vazio; no modo computador um diálogo estreito esconderia
      // justamente o que o modo existe para mostrar.
      // `vt-preview-resize` nos DOIS tamanhos de tela. Ela ficou restrita ao
      // desktop enquanto o miolo trocava de tamanho num quadro só; agora que a
      // moldura interna desliza, uma caixa que salta em volta de um conteúdo
      // que desliza é pior do que os dois saltando juntos — no celular a
      // largura muda pouco (390px ↔ 343px), mas é justamente essa diferença
      // pequena que fica evidente quando uma parte anda e a outra pula.
      className={`dialog-modal vt-preview-resize m-auto max-h-[92dvh] overflow-hidden bg-white p-0 shadow-lg backdrop:bg-black/45 backdrop:backdrop-blur-[2px] dark:bg-gray-900 ${
        // Em largura total não sobra fundo nas laterais para o canto
        // arredondado recortar: ele viraria uma falha nas bordas da tela.
        // `max-w-none` derruba o `max-width: calc(100% - 2em - 6px)` que o
        // navegador aplica a todo `<dialog>` — eram exatamente esses 38px que
        // impediam a prévia de bater com a largura do aparelho.
        isMobile && !isWideScreen ? "max-w-none rounded-none" : "rounded-[2rem]"
      }`}
      // A largura sai daqui, e não de uma classe, porque é ela que a transição
      // de `.vt-preview-resize` interpola — duas classes trocando de lugar
      // dariam o salto que a animação existe para remover.
      // 100vw quando o modo celular é aberto NO celular: aí a prévia tem
      // exatamente a largura do aparelho, e uma quebra de linha que aparece
      // aqui é a mesma que o cliente vai ver. Os 96vw que valiam antes
      // custavam 38px num aparelho de 390 — quase 10% da tela, o bastante
      // para o nome da loja quebrar aqui e não quebrar lá.
      style={{
        width: isMobile ? (isWideScreen ? "min(96vw, 460px)" : "100vw") : "min(88vw, 1120px)",
      }}
    >
      <div className="flex max-h-[92dvh] flex-col">
        {/* `bg-gray-50` no tema claro: sem ele o cabeçalho do diálogo é branco,
            a faixa de identidade da vitrine logo abaixo também é branca, e os
            dois viram uma superfície só — o revendedor lê o título e os botões
            como se fizessem parte da vitrine. O tom mais frio separa o que é
            controle do painel do que é a loja dele. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
          {/* Um degrau maior só a partir de `lg`: no celular o título divide a
              linha com o alternador e o "Fechar", e crescer lá empurraria os
              controles para uma segunda linha. */}
          <h3 className="font-display text-sm font-bold text-gray-900 lg:text-base dark:text-gray-50">
            Assim fica o topo da sua vitrine
          </h3>

          <div className="flex items-center gap-2">
            {/* Grupo de dois estados, não dois botões soltos: `role=group` +
                `aria-pressed` para o leitor de tela anunciar qual está ativo. */}
            <div
              role="group"
              aria-label="Formato da prévia"
              className="flex items-center gap-1 rounded-full border border-gray-300 p-1 dark:border-gray-700"
            >
              {(
                [
                  { value: "desktop" as const, label: "Computador", Icon: Monitor },
                  { value: "mobile" as const, label: "Celular", Icon: Smartphone },
                ]
              ).map(({ value, label, Icon }) => {
                const active = device === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDevice(value)}
                    aria-pressed={active}
                    title={label}
                    // 40px no celular contra 32px no desktop: no toque um alvo
                    // de 32px fica abaixo do mínimo confortável, e estes dois
                    // botões são o único controle da prévia além do "Fechar".
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:h-8 lg:w-8 ${
                      active
                        ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                        : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">{label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:scale-[.98] active:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
            >
              Fechar
            </button>
          </div>
        </div>

        {/* Quando o modo é COMPUTADOR e a janela é estreita, o palco tem menos
            largura que os 1180px do conteúdo e ele rola de lado. Sem esta
            linha, quem abre a prévia no celular vê um cabeçalho cortado ao
            meio e conclui que a vitrine está quebrada — a rolagem lateral não
            se anuncia sozinha em tela de toque. */}
        {!isMobile && !isWideScreen && (
          <p className="border-b border-gray-200 bg-gray-50 px-5 py-2 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-925/40 dark:text-gray-400">
            Arraste para o lado para ver a largura inteira do computador.
          </p>
        )}

        {/* Palco da prévia. Cinza claro nos DOIS temas do painel de propósito:
            a vitrine é sempre branca, e um palco escuro faria o revendedor
            julgar o contraste do cabeçalho contra um fundo que o cliente
            final nunca vai ver. */}
        <div
          ref={stageRef}
          // O respiro do palco (que existe no modo celular, para a moldura não
          // encostar nas bordas, e é zero no computador, onde a vitrine sangra)
          // também é interpolado. Um padding que aparece de uma vez empurra a
          // moldura inteira num quadro só, e o salto é justamente o que a
          // animação existe para eliminar.
          //
          // Mesma régua da caixa (440ms + `--vt-drawer-ease`, ver
          // `.vt-preview-resize` em globals.css), escrita como utilitário aqui
          // porque é uma transição de UM componente — não há segundo lugar no
          // app que precise dela.
          className={`min-h-0 flex-1 overflow-auto bg-gray-100 transition-[padding] duration-[440ms] ease-[var(--vt-drawer-ease)] motion-reduce:transition-none dark:bg-gray-950 ${
            showPhoneFrame ? "px-4 py-6" : "px-0 py-0"
          }`}
        >
          <div
            // `width` calculada, e não a troca entre `maxWidth` e `minWidth` de
            // antes: são propriedades DIFERENTES em cada modo, e o navegador
            // não interpola de uma para a outra — a moldura pulava direto para
            // o tamanho final enquanto o diálogo em volta ainda estava a meio
            // caminho. Com uma única propriedade e dois valores computáveis, o
            // miolo acompanha a caixa.
            //
            // `min()` no celular: num aparelho de 360px, 390px fixos
            // estourariam o diálogo e cortariam o lado direito da prévia. E
            // `max()` no computador: o conteúdo nunca fica abaixo dos 1024px
            // que fazem o cabeçalho ler como desktop, mas cresce junto com o
            // diálogo quando há espaço.
            style={{
              width: isMobile
                ? `min(${MOBILE_WIDTH}px, 100%)`
                : `max(${DESKTOP_WIDTH}px, 100%)`,
            }}
            // A moldura (canto arredondado, borda, sombra) existe SEMPRE, e no
            // computador ela apenas fica transparente e sem raio. Renderizá-la
            // só num dos modos faria o contorno piscar no meio do movimento.
            className={`mx-auto overflow-hidden border shadow-sm transition-[width,border-radius,border-color] duration-[440ms] ease-[var(--vt-drawer-ease)] motion-reduce:transition-none ${
              showPhoneFrame
                ? "rounded-[1.5rem] border-gray-300 dark:border-gray-700"
                : "rounded-none border-transparent"
            }`}
          >
            <div inert>
              <StoreHero
                store={store}
                // Zeros: com `censorStats` o cabeçalho desenha as três tarjas
                // sem consultar nada, então não há número real a passar aqui.
                stats={{ modelCount: 0, minPrice: null, lastUpdatedAt: null }}
                censorStats
              />
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
