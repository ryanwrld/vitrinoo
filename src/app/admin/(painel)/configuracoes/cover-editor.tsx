"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crop, Move, PaintBucket } from "lucide-react";
import {
  coverBandStyle,
  coverImageStyle,
  DEFAULT_POS,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  type CoverFrame,
} from "@/lib/store/cover-frame";
import { coverGradientMidHex } from "@/lib/color/cover-gradient";
import { getMaxContrastTone } from "@/lib/color/contrast";

export type CoverEditorProps = {
  /** URL da capa (arquivo escolhido agora ou a já salva). `null` = só o gradiente. */
  imageUrl: string | null;
  /** Gradiente da cor da loja, exibido quando não há capa. */
  fallbackBackground: string;
  frame: CoverFrame;
  onChange: (frame: CoverFrame) => void;
  /** Abre o seletor de cor de destaque. O botão vive DENTRO da prévia porque
      é ali que a cor aparece: sem capa, a faixa É o gradiente dessa cor, então
      o controle fica no próprio resultado que ele muda. */
  onPickColor: () => void;
  /** Cor de destaque atual — base do gradiente e, sem capa, do contraste do botão. */
  accentColor: string;
  /** Remove a capa e volta ao gradiente. Fica ao lado de "Ajustar
      enquadramento" porque as duas agem sobre a MESMA imagem — separá-las em
      linhas diferentes fazia a segunda parecer uma opção da tela, não da capa. */
  onRemove: () => void;
};

/**
 * Editor de enquadramento da capa, em pop-up.
 *
 * POR QUE POP-UP E NÃO DENTRO DO CARD
 *
 * Enquadrar é um ajuste de precisão: precisa de área para arrastar e de uma
 * prévia grande o bastante para julgar o resultado. Espremido na coluna do
 * formulário, a faixa tinha ~200px de largura — arrastar ali move a âncora em
 * saltos grosseiros e a decisão vira chute. O pop-up também tira o ajuste do
 * caminho de quem só quer trocar o WhatsApp e passar adiante.
 *
 * A PRÉVIA É A VITRINE
 *
 * A caixa usa as MESMAS funções de estilo que `store-hero.tsx`
 * (`coverBandStyle` / `coverImageStyle`). Não é aproximação: o que aparece
 * aqui é literalmente o que o cliente final vai ver. Um editor que mostra um
 * enquadramento e uma vitrine que mostra outro é pior que editor nenhum — o
 * revendedor ajusta com confiança e publica errado.
 *
 * RASCUNHO ATÉ CONFIRMAR
 *
 * As mudanças vivem num estado próprio e só sobem para o formulário no
 * "Aplicar". Sem isso, abrir o pop-up, mexer e desistir deixaria o
 * enquadramento alterado — e o botão "Cancelar" mentiria.
 */
/**
 * Quantos pixels de imagem estão ESCONDIDOS fora da faixa, em cada eixo.
 *
 * É esse número — e não o tamanho da caixa — que define o quanto a imagem
 * anda a cada pixel arrastado. `object-position: X%` posiciona X% da SOBRA de
 * um lado, então mover 1% desloca a imagem em 1% da sobra.
 *
 * Duas fontes de sobra se somam:
 *  - `object-fit: cover` amplia a arte até cobrir a faixa; o que passar disso
 *    é a sobra natural (`overflow` abaixo).
 *  - o zoom amplia tudo mais um pouco, e o excedente da própria caixa também
 *    vira área navegável.
 *
 * Devolve 0 num eixo quando a arte cobre exatamente aquela dimensão — é o que
 * trava o arrasto lateral de um banner largo em zoom 1, onde de fato não há
 * nada a revelar.
 */
function pannableRangePx(
  boxWidth: number,
  boxHeight: number,
  zoom: number,
  natural: { width: number; height: number } | null
): { x: number; y: number } {
  // Sem as dimensões reais ainda (imagem não carregou), cai no comportamento
  // antigo em vez de travar o arrasto por completo.
  if (!natural || natural.width === 0 || natural.height === 0) {
    return { x: boxWidth, y: boxHeight };
  }

  const coverScale = Math.max(boxWidth / natural.width, boxHeight / natural.height);
  const overflowX = natural.width * coverScale - boxWidth;
  const overflowY = natural.height * coverScale - boxHeight;

  return {
    x: overflowX * zoom + (zoom - 1) * boxWidth,
    y: overflowY * zoom + (zoom - 1) * boxHeight,
  };
}

export function CoverEditor({
  imageUrl,
  fallbackBackground,
  accentColor,
  onRemove,
  frame,
  onChange,
  onPickColor,
}: CoverEditorProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  /** Faixa de prévia do card — precisa das medidas reais para saber que pedaço da arte fica sob o botão. */
  const previewBandRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ pointerId: number; x: number; y: number; posX: number; posY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState<CoverFrame>(frame);
  // Dimensões reais do arquivo. Sem elas não dá para saber QUANTO da imagem
  // está escondido fora da faixa — e é essa sobra, não o tamanho da caixa,
  // que define quantos pixels a imagem anda a cada pixel de dedo.
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);

  function openEditor() {
    // Parte SEMPRE do valor atual do formulário: sem isso, reabrir o pop-up
    // depois de um "Cancelar" traria de volta o rascunho descartado.
    setDraft(frame);
    dialogRef.current?.showModal();
  }

  function applyAndClose() {
    onChange(draft);
    dialogRef.current?.close();
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const band = bandRef.current;
    if (!band || !imageUrl) return;

    // `setPointerCapture` mantém o arrasto vivo quando o cursor sai da caixa —
    // sem isso, arrastar rápido "solta" a imagem no meio do gesto.
    band.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      posX: draft.posX,
      posY: draft.posY,
    };
    setDragging(true);
  }

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      const band = bandRef.current;
      if (!state || !band || state.pointerId !== event.pointerId) return;

      const rect = band.getBoundingClientRect();
      const range = pannableRangePx(rect.width, rect.height, draft.zoom, natural);

      // Converte pixels de dedo em percentual de `object-position` usando a
      // SOBRA ESCONDIDA de cada eixo, não o tamanho da caixa.
      //
      // A conta anterior dividia pelo tamanho da caixa, e isso não descreve
      // nada: `object-position: 50%` não significa "no meio da caixa",
      // significa "50% da sobra de cada lado". Com esta arte a sobra vertical
      // era 99px numa caixa de 126px, então a imagem andava 79px a cada 100px
      // de dedo — fugindo da mão o tempo todo. Dividindo pela sobra, a imagem
      // acompanha o dedo exatamente 1:1, em qualquer arte e qualquer zoom.
      //
      // Eixo sem sobra fica travado (divisão por zero evitada): quando a arte
      // já preenche aquela dimensão inteira, não existe nada escondido para
      // revelar, e fingir movimento seria pior que não mover.
      //
      // Sinal invertido de propósito: arrastar para a DIREITA deve trazer à
      // vista o que está à direita, e para isso a âncora precisa ANDAR PARA A
      // ESQUERDA. Sem a inversão, a imagem foge na direção contrária ao dedo.
      const deltaX = range.x > 0.5 ? ((event.clientX - state.x) / range.x) * 100 : 0;
      const deltaY = range.y > 0.5 ? ((event.clientY - state.y) / range.y) * 100 : 0;

      setDraft((current) => ({
        ...current,
        posX: Math.min(100, Math.max(0, state.posX - deltaX)),
        posY: Math.min(100, Math.max(0, state.posY - deltaY)),
      }));
    },
    [draft.zoom, natural]
  );

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    bandRef.current?.releasePointerCapture(event.pointerId);
    dragStateRef.current = null;
    setDragging(false);
  }

  // Altura fora da conta: ela não é editável (decisão do usuário — a faixa
  // tem proporção fixa), então nunca difere do padrão.
  const isDefault = draft.zoom === DEFAULT_ZOOM && draft.posX === DEFAULT_POS && draft.posY === DEFAULT_POS;

  /**
   * Claro ou escuro sob o botão do canto inferior direito.
   *
   * Sem capa a resposta é exata: aquele canto é a PONTA do gradiente da cor de
   * destaque, então basta medir a luminância dessa ponta (não da cor base —
   * um azul escuro termina 24% mais claro justamente ali).
   *
   * Com capa não dá para saber sem olhar o arquivo, então a imagem é
   * amostrada: só o quadrante inferior direito, que é a área que o botão
   * cobre. Se o navegador barrar a leitura do pixel (imagem de outra origem
   * sem CORS), fica no branco — o padrão mais seguro sobre foto, que costuma
   * ser mais escura que clara.
   */
  const [imageTone, setImageTone] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (!imageUrl) return;
    const band = previewBandRef.current;
    if (!band) return;
    let cancelled = false;

    const probe = new Image();
    probe.crossOrigin = "anonymous";
    probe.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;

        const bandRect = band.getBoundingClientRect();
        const { naturalWidth: nw, naturalHeight: nh } = probe;
        if (!nw || !nh || !bandRect.width) return;

        // QUE PEDAÇO DO ARQUIVO ESTÁ REALMENTE ATRÁS DO BOTÃO
        //
        // A versão anterior amostrava o canto do ARQUIVO, e não o que a faixa
        // mostra. São coisas diferentes: `object-fit: cover` já recorta, e o
        // enquadramento (`object-position` + zoom) desloca esse recorte. Com
        // este banner, o canto do arquivo é claro e o pedaço visível no canto
        // é escuro — e o botão saía preto sobre preto, invisível.
        //
        // Aqui a conta é a mesma que o CSS faz: escala de cobertura vezes
        // zoom, sobra distribuída pelo percentual do `object-position`, e a
        // caixa do botão convertida de volta para coordenadas do arquivo.
        const scale = Math.max(bandRect.width / nw, bandRect.height / nh) * frame.zoom;
        const overflowX = nw * scale - bandRect.width;
        const overflowY = nh * scale - bandRect.height;
        const originX = (overflowX * frame.posX) / 100;
        const originY = (overflowY * frame.posY) / 100;

        // Caixa do botão na faixa (8px de margem + 28px de lado), com uma
        // folga de 4px para amostrar também o que encosta na borda dele.
        const boxX = 8 - 4;
        const boxY = 8 - 4;
        const boxSize = 28 + 8;

        const sourceX = Math.max(0, (boxX + originX) / scale);
        const sourceY = Math.max(0, (boxY + originY) / scale);
        const sourceSize = boxSize / scale;

        context.drawImage(
          probe,
          sourceX,
          sourceY,
          Math.min(sourceSize, nw - sourceX),
          Math.min(sourceSize, nh - sourceY),
          0,
          0,
          16,
          16
        );

        const { data } = context.getImageData(0, 0, 16, 16);
        let sum = 0;
        for (let index = 0; index < data.length; index += 4) {
          // Luminância perceptual (Rec. 709) — o olho pesa verde muito mais
          // que azul, e uma média simples de RGB chamaria um azul saturado de
          // "claro".
          sum += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
        }
        const average = sum / (data.length / 4) / 255;
        // Mesmo ponto de virada de `getMaxContrastTone` (razões de contraste
        // iguais), para foto e gradiente responderem pela mesma régua.
        setImageTone(average > 0.179 ? "dark" : "light");
      } catch {
        setImageTone("light");
      }
    };
    probe.src = imageUrl;

    return () => {
      cancelled = true;
    };
    // `frame` entra nas dependências porque mover ou dar zoom na arte muda o
    // pedaço que fica sob o botão — e portanto a cor certa dele.
  }, [imageUrl, frame.zoom, frame.posX, frame.posY]);

  // Canto SUPERIOR ESQUERDO: é exatamente onde o gradiente de 135° começa,
  // então o que está atrás do botão é a cor de destaque exata (parada de 0%).
  // Ler a ponta do gradiente daria a resposta errada justamente nos extremos —
  // um azul escuro termina 24% mais claro no canto oposto.
  const tone = imageUrl ? imageTone : getMaxContrastTone(accentColor);
  const labelTone = getMaxContrastTone(coverGradientMidHex(accentColor));

  const sliderClass =

    "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-primary dark:bg-gray-700";

  return (
    <div className="flex flex-col gap-2">
      {/* Prévia no card: só leitura. Mostra o enquadramento vigente sem
          competir com os campos do formulário por espaço e atenção. */}
      <div
        ref={previewBandRef}
        style={{ ...coverBandStyle(frame), ...(imageUrl ? null : { backgroundImage: fallbackBackground }) }}
        // `min-h-24` só no celular: a faixa tem proporção fixa, então numa
        // coluna de ~292px ela renderiza com 58px de altura contra os 99px do
        // desktop — pequena demais para julgar o enquadramento no aparelho em
        // que a maioria dos revendedores usa o painel. O piso de altura
        // equaliza as duas telas.
        className="relative min-h-24 w-full overflow-hidden rounded-[1.25rem] border border-gray-200 sm:min-h-0 dark:border-gray-800"
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- prévia local (object URL) ou capa já salva; sem ganho no next/image aqui
          <img src={imageUrl} alt="Capa da vitrine" style={coverImageStyle(frame)} className="h-full w-full" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {/* Mesma regra do botão, medida no ponto certo: este texto fica
                CENTRALIZADO, então quem manda é a parada do meio do gradiente,
                não a ponta. Preto ou branco puro, o que contrastar mais. */}
            <span
              style={{ color: labelTone === "dark" ? "#000000" : "#ffffff" }}
              className="text-xs font-medium"
            >
              Gradiente da sua cor de destaque
            </span>
          </div>
        )}

        {/* CONTRASTE DO BOTÃO — por que não é token de tema nem blend.
            Atrás dele não está o card: está o banner. Um token de tema erra
            sempre que o banner contraria o tema (amarelo no escuro, azul no
            claro), e `mix-blend-difference` até acerta o contraste, mas
            INVENTA a cor — sobre azul devolvia um amarelo que não existe em
            lugar nenhum da tela.
            Aqui a cor é CALCULADA a partir do que está de fato sob o botão:
            preto ou branco puro, o par de maior contraste possível, escolhido
            pela luminância daquele ponto. */}
        <button
          type="button"
          onClick={onPickColor}
          aria-label="Escolher cor de destaque"
          title="Cor de destaque"
          style={{ color: tone === "dark" ? "#000000" : "#ffffff", borderColor: "currentColor" }}
          className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-subtle"
        >
          <PaintBucket className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* `mt-1.5 -mb-1.5` na linha abaixo: ela desce 6px sem alterar a altura
          do card — o que ganha acima, devolve abaixo. */}
      {imageUrl && (
        <div className="-mb-1.5 mt-1.5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={openEditor}
            className="flex w-fit items-center gap-1.5 rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 outline-none transition-colors duration-150 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Crop className="h-3 w-3" aria-hidden="true" />
            Ajustar enquadramento
          </button>

          <button
            type="button"
            onClick={onRemove}
            // Azul da marca no claro; `blue-400` no escuro pela mesma razão já
            // documentada no botão "Baixar cartão": o #0D21A1 puro, num texto
            // fino sobre fundo escuro, lê como quase preto.
            className="text-xs font-medium text-primary underline underline-offset-2 outline-none transition-colors duration-150 hover:text-primary-hover focus-visible:ring-2 focus-visible:ring-primary-subtle dark:text-blue-400 dark:hover:text-blue-300"
          >
            Desfazer
          </button>
        </div>
      )}

      <dialog
        ref={dialogRef}
        className="dialog-modal m-auto w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-lg backdrop:bg-black/45 backdrop:backdrop-blur-[2px] dark:bg-gray-900"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-display text-sm font-bold text-gray-900 dark:text-gray-50">Enquadrar a capa</h3>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Arraste a imagem para escolher o que aparece. É exatamente assim que ela vai ficar na sua vitrine.
            </p>
          </div>

          <div
            ref={bandRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={coverBandStyle(draft)}
            className={`relative w-full select-none overflow-hidden rounded-[1.25rem] border border-gray-200 dark:border-gray-800 ${
              dragging ? "cursor-grabbing" : "cursor-grab"
            }`}
          >
            {imageUrl && (
              // `touch-none` impede o navegador de interpretar o arrasto como
              // rolagem da página por baixo — sem isso o ajuste é impossível
              // no celular, que é onde boa parte dos revendedores usa o painel.
              // eslint-disable-next-line @next/next/no-img-element -- prévia local (object URL) ou capa já salva; sem ganho no next/image aqui
              <img
                src={imageUrl}
                alt=""
                draggable={false}
                onLoad={(event) =>
                  setNatural({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
                style={coverImageStyle(draft)}
                className="h-full w-full touch-none"
              />
            )}

            {/* GRADE DE TERÇOS — referência de composição, não decoração.
                Sem linha nenhuma, "centralizar o jogador" vira tentativa e
                erro: não há contra o que medir. As linhas dão os pontos onde
                o olho naturalmente procura o assunto de uma imagem.

                Opacidade baixa e `mix-blend-difference` para as linhas
                aparecerem tanto sobre a parte clara quanto sobre a escura da
                arte — uma linha branca fixa sumiria justamente num banner de
                fundo claro. */}
            <div className="pointer-events-none absolute inset-0 mix-blend-difference" aria-hidden="true">
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/30" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/30" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/30" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/30" />
            </div>

            {!dragging && (
              <span className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
                <Move className="h-3.5 w-3.5" aria-hidden="true" />
                Arraste para enquadrar
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <label htmlFor="cover-zoom" className="w-16 shrink-0 text-sm text-gray-600 dark:text-gray-400">
                Zoom
              </label>
              <input
                id="cover-zoom"
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.05}
                value={draft.zoom}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, zoom: Number(event.target.value) }))
                }
                className={sliderClass}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            {!isDefault ? (
              <button
                type="button"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    zoom: DEFAULT_ZOOM,
                    posX: DEFAULT_POS,
                    posY: DEFAULT_POS,
                  }))
                }
                className="text-sm font-medium text-gray-500 underline-offset-2 transition-colors duration-150 hover:text-gray-900 hover:underline dark:text-gray-500 dark:hover:text-gray-300"
              >
                Restaurar
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={applyAndClose}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
