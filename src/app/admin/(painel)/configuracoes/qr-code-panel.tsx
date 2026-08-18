"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Download, Camera, MessageCircle, Printer, QrCode } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { generateQrDataUrl, QR_DOWNLOAD_SIZE } from "@/lib/qr";
import { drawShareCard, SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from "@/lib/qr-share-card";

export type QrCodePanelProps = {
  publicUrl: string;
  storeName: string | null;
  // Cor de destaque da loja (`stores.accent_color`) — mesma fonte que pinta a
  // capa e a barra fixa da vitrine pública. `null` (ainda não escolhida) cai
  // no azul do Vitrinoo dentro do próprio `drawShareCard`.
  accentColor: string | null;
};

/**
 * Painel do QR + URL pública (D-09–D-13, LOJA-03/LOJA-04).
 *
 * A prévia deixou de ser o QR cru e passou a ser o CARTÃO DE DIVULGAÇÃO
 * inteiro (moldura na cor de destaque da loja, logo do Vitrinoo no centro do
 * código, nome da loja e link) — o mesmo arquivo que o botão baixa, E O MESMO
 * que aparece no pop-up de QR da própria vitrine pública (`qr-code-button.tsx`).
 * Três lugares, uma arte só: a prévia aqui precisa ser literalmente o que o
 * cliente final vê ao escanear o pop-up da vitrine — inclusive a cor —, não só
 * o mesmo arquivo que o botão baixa.
 *
 * O QR cru continua disponível num segundo botão, para quem quer montar o
 * próprio material (colar num banner, mandar para a gráfica) — nesse caso ele
 * é gerado sob demanda em 1024px, sempre preto-sobre-branco (não é uma peça de
 * marca, é insumo pra terceiros montarem a própria arte), não lido da prévia.
 */
export function QrCodePanel({ publicUrl, storeName, accentColor }: QrCodePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCopying, startCopyTransition] = useTransition();
  const [isDownloadingQr, startQrDownloadTransition] = useTransition();

  /**
   * `accentColor` agora chega AO VIVO do `<input type="color">" (via
   * `aside(accentColorValue)` em `settings-form.tsx`), não só do valor salvo
   * — e o nativo dispara o evento `input` continuamente enquanto o
   * revendedor arrasta no seletor do sistema, não só ao soltar. Sem
   * amortecer, cada pixel arrastado dispararia um redesenho completo do
   * canvas (regerar o QR incluso) — na prática ainda rápido o bastante pra
   * não travar, mas gera trabalho redundante que uma pausa de 50ms elimina
   * sem o olho humano notar atraso (abaixo do limiar de ~100ms em que uma
   * atualização começa a "sentir" lenta).
   */
  const [debouncedAccentColor, setDebouncedAccentColor] = useState(accentColor);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedAccentColor(accentColor), 50);
    return () => clearTimeout(id);
  }, [accentColor]);

  // Chave de "o que está desenhado" — não um `setState` síncrono dentro do
  // efeito (mesmo padrão de slug-editor.tsx, react-hooks/set-state-in-effect).
  // Inclui `storeName` porque o nome faz parte do cartão: trocar o nome da
  // loja precisa invalidar o desenho tanto quanto trocar o slug.
  // `debouncedAccentColor` pelo mesmo motivo: mudar a cor de destaque em
  // Configurações precisa redesenhar a prévia, senão ela mostra a cor antiga
  // até um reload.
  const drawKey = `${publicUrl}::${storeName ?? ""}::${debouncedAccentColor ?? ""}`;
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const cardReady = readyKey === drawKey;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    drawShareCard(canvas, { publicUrl, storeName, accentColor: debouncedAccentColor })
      .then(() => {
        if (!cancelled) setReadyKey(drawKey);
      })
      .catch(() => {
        if (!cancelled) setReadyKey(null);
      });

    return () => {
      cancelled = true;
    };
  }, [publicUrl, storeName, debouncedAccentColor, drawKey]);

  function triggerDownload(dataUrl: string, filename: string) {
    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }

  function handleDownloadCard() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    triggerDownload(canvas.toDataURL("image/png"), "cartao-vitrine.png");
  }

  function handleDownloadPlainQr() {
    startQrDownloadTransition(async () => {
      try {
        triggerDownload(await generateQrDataUrl(publicUrl, QR_DOWNLOAD_SIZE), "vitrine-qrcode.png");
      } catch {
        toast.error("Não foi possível gerar o QR code.");
      }
    });
  }

  function handleCopy() {
    startCopyTransition(async () => {
      const ok = await copyText(publicUrl);
      if (ok) {
        toast.success("Link copiado!");
      } else {
        toast.error("Não foi possível copiar. Copie manualmente.");
      }
    });
  }

  return (
    // Sem moldura de card própria: é uma SEÇÃO do card "Link e QR code da
    // vitrine" (ver configuracoes/page.tsx). `lg:flex-1` aqui e na moldura
    // tracejada abaixo é o que faz este bloco absorver a altura que sobra na
    // coluna da direita — no desktop ela precisa terminar junto com a coluna
    // do formulário, que é bem mais alta.
    <div className="flex flex-col gap-4">
      {/* `justify-start`, não `center`: centralizar o bloco na sobra abria
          DOIS vãos (um acima do cartão, outro abaixo dos botões) e é
          justamente espaço vazio em volta que faz um objeto ler como pequeno.
          Ancorado no topo, o cartão encosta no divisor do slug — onde o olho
          já está — e a sobra vira uma folga única antes da URL, no rodapé do
          card. */}
      <div className="flex flex-col items-center gap-4">
        {/* Sem moldura em volta do cartão (era tracejada, com 24px de
            respiro): duas bordas concêntricas fazem o olho medir o assunto
            pela externa, e o cartão — que é o protagonista aqui — lia como um
            objeto pequeno dentro de uma caixa grande. Sem ela, ele é a única
            figura do bloco e ganha presença sem mudar de tamanho. */}
        {/* `lg:pt-4`: reduzir o cartão não resolvia o aperto contra o divisor
            do slug logo acima — falta de respiro vertical não se conserta
            encolhendo o objeto, se conserta afastando. */}
        <div className="flex w-full max-w-[240px] items-center justify-center lg:mt-[36px] lg:max-w-[313px] lg:pt-4">
          {/* `width`/`height` são a resolução REAL do arquivo (1080×1350); o
              CSS só reduz a exibição. É por isso que o download sai em alta
              mesmo com a prévia pequena na tela.
              Sem `rounded-*` nem `shadow-*` aqui de propósito: o cartão pinta
              os próprios cantos arredondados (CARD_RADIUS em qr-share-card.ts),
              então a prévia é literalmente o arquivo. Arredondar por CSS
              faria a tela mostrar um canto que o PNG não teria. */}
          <canvas
            ref={canvasRef}
            width={SHARE_CARD_WIDTH}
            height={SHARE_CARD_HEIGHT}
            aria-label={`Cartão de divulgação da vitrine${storeName ? ` de ${storeName}` : ""}`}
            role="img"
            // Cresce no desktop para ocupar a sobra da coluna: 288px deixava
            // um vão morto entre a lista e a URL. Mobile intocado (240px).
            // Largura fixa, altura automática pela proporção do arquivo.
            //
            // Tentei antes fazer o cartão medir pela altura que sobrava na
            // coluna (`h-full` + `object-contain`), para o vão zerar sozinho.
            // Parecia resolvido — mas `object-contain` só CENTRALIZA o desenho
            // dentro da caixa: o vão não sumia, virava tarja transparente
            // dentro do próprio canvas, e ainda empurrava os botões de
            // download para fora da primeira dobra. Medir e desenhar não são a
            // mesma coisa.
            //
            // A largura é do CONTAINER (compartilhado com a lista logo
            // abaixo, para as bordas dos dois baterem). Teto de 313px, que é
            // a medida validada visualmente; em colunas mais estreitas o
            // `w-full` encolhe junto e a margem lateral nunca some.
            className="h-auto w-full"
          />
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={handleDownloadCard}
            disabled={!cardReady}
            // Botão de contorno. No claro, o azul da marca puro (#0D21A1).
            // No escuro ele é CLAREADO para `blue-400` (#5C6BDA): o mesmo hex
            // que num botão preenchido lê como azul vívido, num traço de 1px
            // e num texto de 13px sobre fundo escuro lê como quase preto
            // (~1,5:1 de contraste). Área muda a leitura da cor — clarear é o
            // que faz o contorno PARECER o azul do botão "Copiar" ao lado.
            className="flex items-center justify-center gap-2 rounded-full border border-primary bg-white p-3 text-sm font-semibold text-primary transition-all duration-150 hover:bg-primary-subtle active:bg-primary-border active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none dark:border-blue-400 dark:bg-gray-900 dark:text-blue-400 dark:hover:bg-blue-400/10 dark:active:bg-blue-400/20 dark:disabled:border-gray-800 dark:disabled:bg-gray-800 dark:disabled:text-gray-600"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Baixar cartão
          </button>

          <button
            type="button"
            onClick={handleDownloadPlainQr}
            disabled={isDownloadingQr}
            className="flex items-center justify-center gap-2 rounded-full border border-gray-300 bg-white p-3 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
          >
            {/* "Baixar QR code", não "Só o QR code": o rótulo antigo não tinha
                verbo (quebrando o paralelismo com o botão ao lado) e se
                definia por negação — quem lesse este primeiro não teria
                referência para o "só". Cada botão agora se explica sozinho. */}
            <QrCode className="h-4 w-4" aria-hidden="true" />
            Baixar QR code
          </button>
        </div>

        {/* Só no desktop (`hidden lg:flex`): esta coluna é bem mais curta que
            a do formulário e sobrava altura vazia entre o cartão e a URL. Em
            vez de centralizar o vazio, ele passa a carregar o uso — que é
            recorrente, não de uma vez só, e não estava dito em lugar nenhum.
            No mobile não existe sobra nenhuma, então nada disso aparece. */}
        <ul className="hidden w-full max-w-[240px] flex-col lg:max-w-[313px] gap-2 text-xs leading-relaxed text-gray-500 lg:flex dark:text-gray-500">
          {/* Mesma largura do cartão (`w-[92%] max-w-[340px]`, idêntico ao
              container): antes a caixa da lista era mais larga, e mesmo com os
              centros coincidindo o texto começava 13px à esquerda da borda do
              cartão — desalinho visível, porque o olho alinha por borda, não
              por centro.
              Da frase mais curta para a mais longa: a lista é lida de relance,
              e começar pela linha mais leve dá o primeiro entendimento antes
              de exigir mais atenção. */}
          <li className="flex gap-2">
            <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Compartilhe nos grupos de WhatsApp.
          </li>
          <li className="flex gap-2">
            <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Posta no story, quem vê já abre sua vitrine.
          </li>
          <li className="flex gap-2">
            <Printer className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Imprime e cola no balcão ou na porta da loja.
          </li>
        </ul>
      </div>

      {/* `lg:mt-[56px]`: alinha este campo com o input de WhatsApp do card ao
          lado (medido no navegador). É um alinhamento entre CARDS diferentes,
          então não existe mecanismo automático — é um deslocamento fixo e vai
          sair do lugar se o conteúdo acima de qualquer um dos dois mudar de
          altura. */}
      <div className="flex flex-col gap-1 lg:mt-[56px]">
        <label htmlFor="publicUrl" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          URL pública
        </label>
        <div className="flex items-center gap-2">
          <input
            id="publicUrl"
            type="text"
            value={publicUrl}
            readOnly
            // `min-w-0`: filho de flex não encolhe abaixo do próprio conteúdo
            // por padrão (`min-width: auto`), então em telas de 375px a URL
            // empurrava o botão "Copiar" 2px para fora e a página ganhava
            // rolagem horizontal.
            className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 h-11 text-base text-gray-900 outline-none dark:border-gray-800 dark:bg-gray-925/40 dark:text-gray-50"
          />
          <button
            type="button"
            onClick={handleCopy}
            disabled={isCopying}
            aria-label="Copiar"
            className="shrink-0 flex items-center gap-2 rounded-full bg-primary p-3 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none dark:disabled:bg-gray-800 dark:disabled:text-gray-600"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copiar
          </button>
        </div>
      </div>
    </div>
  );
}
