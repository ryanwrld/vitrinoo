"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Download, QrCode } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { generateQrDataUrl, QR_DOWNLOAD_SIZE } from "@/lib/qr";
import { drawShareCard, SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from "@/lib/qr-share-card";

export type QrCodePanelProps = {
  publicUrl: string;
  storeName: string | null;
};

/**
 * Painel do QR + URL pública (D-09–D-13, LOJA-03/LOJA-04).
 *
 * A prévia deixou de ser o QR cru e passou a ser o CARTÃO DE DIVULGAÇÃO
 * inteiro (moldura azul, logo do Vitrinoo no centro do código, nome da loja e
 * link) — o mesmo arquivo que o botão baixa. Prévia e produto precisam ser a
 * mesma coisa; mostrar um QR simples e entregar um cartão seria surpresa no
 * download.
 *
 * O QR cru continua disponível num segundo botão, para quem quer montar o
 * próprio material (colar num banner, mandar para a gráfica) — nesse caso ele
 * é gerado sob demanda em 1024px, não lido da prévia.
 */
export function QrCodePanel({ publicUrl, storeName }: QrCodePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCopying, startCopyTransition] = useTransition();
  const [isDownloadingQr, startQrDownloadTransition] = useTransition();

  // Chave de "o que está desenhado" — não um `setState` síncrono dentro do
  // efeito (mesmo padrão de slug-editor.tsx, react-hooks/set-state-in-effect).
  // Inclui `storeName` porque o nome faz parte do cartão: trocar o nome da
  // loja precisa invalidar o desenho tanto quanto trocar o slug.
  const drawKey = `${publicUrl}::${storeName ?? ""}`;
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const cardReady = readyKey === drawKey;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    drawShareCard(canvas, { publicUrl, storeName })
      .then(() => {
        if (!cancelled) setReadyKey(drawKey);
      })
      .catch(() => {
        if (!cancelled) setReadyKey(null);
      });

    return () => {
      cancelled = true;
    };
  }, [publicUrl, storeName, drawKey]);

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
        toast.error("Não foi possível gerar o QR code. Tente novamente.");
      }
    });
  }

  function handleCopy() {
    startCopyTransition(async () => {
      const ok = await copyText(publicUrl);
      if (ok) {
        toast.success("Link copiado!");
      } else {
        toast.error("Não foi possível copiar o link. Selecione e copie manualmente.");
      }
    });
  }

  return (
    // Sem moldura de card própria: é uma SEÇÃO do card "Link e QR code da
    // vitrine" (ver configuracoes/page.tsx). `lg:flex-1` aqui e na moldura
    // tracejada abaixo é o que faz este bloco absorver a altura que sobra na
    // coluna da direita — no desktop ela precisa terminar junto com a coluna
    // do formulário, que é bem mais alta.
    <div className="flex flex-col gap-4 lg:flex-1">
      {/* Quem cresce para alinhar o pé das duas colunas é este wrapper SEM
          borda, não a moldura tracejada. Antes o `lg:flex-1` estava na própria
          moldura, que virava um retângulo enorme em volta de um cartão
          pequeno. `justify-center` mantém cartão e botões no meio da sobra. */}
      <div className="flex flex-col items-center gap-4 lg:flex-1 lg:justify-center">
        {/* `w-fit` em todas as larguras: a moldura encolhe até o tamanho do
            cartão + padding, emoldurando-o de fato em vez de virar um
            retângulo grande com o cartão perdido no meio. */}
        <div className="flex w-fit items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-6 dark:border-gray-700 dark:bg-gray-925/40">
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
            className="h-auto w-full max-w-[240px] lg:max-w-[288px]"
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
            className="flex items-center justify-center gap-2 rounded-md border border-primary bg-white p-3 text-sm font-semibold text-primary transition-all duration-150 hover:bg-primary-subtle active:bg-primary-border active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none dark:border-blue-400 dark:bg-gray-900 dark:text-blue-400 dark:hover:bg-blue-400/10 dark:active:bg-blue-400/20 dark:disabled:border-gray-800 dark:disabled:bg-gray-800 dark:disabled:text-gray-600"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Baixar cartão
          </button>

          <button
            type="button"
            onClick={handleDownloadPlainQr}
            disabled={isDownloadingQr}
            className="flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white p-3 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
          >
            {/* "Baixar QR code", não "Só o QR code": o rótulo antigo não tinha
                verbo (quebrando o paralelismo com o botão ao lado) e se
                definia por negação — quem lesse este primeiro não teria
                referência para o "só". Cada botão agora se explica sozinho. */}
            <QrCode className="h-4 w-4" aria-hidden="true" />
            Baixar QR code
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="publicUrl" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          URL pública
        </label>
        <div className="flex items-center gap-2">
          <input
            id="publicUrl"
            type="text"
            value={publicUrl}
            readOnly
            className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-3 h-11 text-base text-gray-900 outline-none dark:border-gray-800 dark:bg-gray-925/40 dark:text-gray-50"
          />
          <button
            type="button"
            onClick={handleCopy}
            disabled={isCopying}
            aria-label="Copiar"
            className="flex items-center gap-2 rounded-md bg-primary p-3 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none dark:disabled:bg-gray-800 dark:disabled:text-gray-600"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copiar
          </button>
        </div>
      </div>
    </div>
  );
}
