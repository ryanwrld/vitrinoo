import QRCode from "qrcode";

/** Tamanho histórico da prévia — mantido como padrão para não mudar o teste. */
export const QR_PREVIEW_SIZE = 240;

/**
 * Tamanho do PNG "QR simples" oferecido para download. 240px servia como
 * prévia de tela, mas é pequeno demais para quem baixa o arquivo justamente
 * para montar o próprio material (banner, cartaz, gráfica) — ampliar depois
 * só produz um QR borrado.
 */
export const QR_DOWNLOAD_SIZE = 1024;

/**
 * Gera um QR code PNG (data URL base64) para a URL pública da vitrine
 * (D-09–D-11, LOJA-03). Nível de correção de erro padrão (M): este é o QR
 * CRU, sem logo sobreposto.
 *
 * O QR do cartão de divulgação é outro caminho (`src/lib/qr-share-card.ts`) e
 * usa nível "H", porque lá existe um logo tapando o centro.
 */
export async function generateQrDataUrl(url: string, size: number = QR_PREVIEW_SIZE): Promise<string> {
  return QRCode.toDataURL(url, { width: size, margin: 2 });
}
