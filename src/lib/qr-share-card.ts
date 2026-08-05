import QRCode from "qrcode";

/**
 * Desenha o "cartão de divulgação" da vitrine num `<canvas>`: moldura azul da
 * marca, painel branco arredondado, QR code com o logo do Vitrinoo no centro,
 * nome da loja e o link escrito.
 *
 * Por que canvas e não uma imagem gerada no servidor: o QR já é gerado no
 * cliente (o pacote `qrcode` está no bundle desde o MVP) e o cartão é
 * inteiramente derivado de dados que a página já tem — não há motivo para uma
 * rota de imagem, uma dependência de renderização (satori/sharp) ou um
 * round-trip de rede só para compor formas e texto.
 *
 * O cartão é SEMPRE azul-sobre-branco, independente do tema do painel: é um
 * arquivo que o lojista posta no Instagram/WhatsApp, não uma parte da
 * interface. Tema escuro aqui só produziria um cartão preto que ninguém pediu.
 */

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350; // 4:5 — máxima área permitida no feed do Instagram

const BRAND_BLUE = "#0D21A1"; // --color-primary
const WHITE = "#FFFFFF";

/**
 * Arredondamento da moldura externa, desenhado NO CANVAS (não via CSS).
 *
 * O CSS `rounded-lg` do elemento só afetaria a prévia — o PNG baixado sairia
 * com canto reto, e a imagem entregue seria diferente da que o lojista viu.
 * Desenhando aqui, prévia e arquivo são a mesma coisa por construção.
 *
 * 52px em 1080 equivale aos 14px do token `--radius-lg` na escala em que a
 * prévia é exibida no desktop (288px).
 */
const CARD_RADIUS = 52;

const PANEL_X = 90;
const PANEL_Y = 140;
const PANEL_SIZE = 900;
const PANEL_RADIUS = 72;

const QR_SIZE = 760;
const QR_X = PANEL_X + (PANEL_SIZE - QR_SIZE) / 2;
const QR_Y = PANEL_Y + (PANEL_SIZE - QR_SIZE) / 2;

/**
 * Diâmetro do "furo" branco no centro do QR e o tamanho do logo dentro dele.
 *
 * 184px sobre um QR de 760px cobre ~4,2% da área total. O nível de correção
 * `H` recupera até 30%, então há folga larga — mas a folga só existe porque o
 * `errorCorrectionLevel: "H"` é aplicado logo abaixo. Aumentar o furo sem
 * conferir essa conta faz o código parar de ser lido por câmeras ruins antes
 * de parar de ser lido pelas boas, que é o pior tipo de regressão: silenciosa.
 */
const LOGO_KNOCKOUT_DIAMETER = 184;
const LOGO_SIZE = 128;

const NAME_BASELINE = PANEL_Y + PANEL_SIZE + 92;
const NAME_MAX_SIZE = 62;
const NAME_MIN_SIZE = 40;
const LINK_BASELINE = NAME_BASELINE + 58;
const LINK_SIZE = 34;
const TEXT_MAX_WIDTH = PANEL_SIZE;

export type ShareCardOptions = {
  publicUrl: string;
  storeName: string | null;
};

/**
 * Redesenha o `LogoMark` (src/components/logo-mark.tsx) com a API 2D do
 * canvas, em vez de carregar um arquivo de imagem.
 *
 * Motivo: o logo é SVG inline num componente React — não existe um `.svg` ou
 * `.png` em `public/` para carregar. Rasterizar o SVG passaria por um
 * `Image` + `data:` URL, e um canvas que já teve `drawImage` de SVG externo
 * fica "sujo" (tainted) em alguns navegadores, quebrando o `toDataURL` do
 * download. Redesenhar são quatro formas — mais barato e sem essa armadilha.
 *
 * As coordenadas abaixo são as do viewBox 28×28 do componente original,
 * escaladas por `size / 28`. Se o logo mudar lá, precisa mudar aqui.
 */
function drawLogoMark(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, size: number) {
  const scale = size / 28;
  const x = centerX - size / 2;
  const y = centerY - size / 2;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // <rect width="28" height="28" rx="7" fill="#0D21A1" />
  ctx.beginPath();
  ctx.roundRect(0, 0, 28, 28, 7);
  ctx.fillStyle = BRAND_BLUE;
  ctx.fill();

  // As três hastes brancas do "V" em perspectiva.
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(6, 9.5);
  ctx.lineTo(14, 13.5);
  ctx.moveTo(22, 9.5);
  ctx.lineTo(14, 13.5);
  ctx.moveTo(14, 13.5);
  ctx.lineTo(14, 19.5);
  ctx.stroke();

  // <circle cx="14" cy="19.5" r="1.5" fill="rgba(255,255,255,0.55)" />
  ctx.beginPath();
  ctx.arc(14, 19.5, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fill();

  ctx.restore();
}

/**
 * Resolve a família tipográfica real da Manrope.
 *
 * `next/font` não expõe "Manrope" como nome — ele gera um nome ofuscado
 * (`__Manrope_xxxxx`) e o publica na custom property `--font-manrope`
 * (ver src/app/layout.tsx). Passar a string literal "Manrope" para
 * `ctx.font` cairia silenciosamente no fallback do sistema, e o cartão sairia
 * com a fonte errada sem nenhum erro no console.
 */
function resolveDisplayFontFamily(): string {
  if (typeof window === "undefined") return "sans-serif";
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-manrope").trim();
  return value ? `${value}, sans-serif` : "sans-serif";
}

/**
 * Encolhe o texto até caber em `maxWidth`, e só então corta com reticências.
 *
 * Encolher antes de cortar é deliberado: um nome de loja comprido é comum
 * ("RL Esportes Importados"), e um nome cortado no cartão que o lojista vai
 * postar parece defeito do produto. Só quando nem no tamanho mínimo couber é
 * que aceitamos a reticência.
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  weight: number,
  maxSize: number,
  minSize: number,
  maxWidth: number
): string {
  let size = maxSize;
  ctx.font = `${weight} ${size}px ${fontFamily}`;

  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${fontFamily}`;
  }

  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

/**
 * Gera o QR num canvas fora da tela para depois ser desenhado dentro do
 * painel branco.
 *
 * `errorCorrectionLevel: "H"` (30% de recuperação) é o que torna o logo
 * central possível — o padrão do projeto até aqui era "M" (15%), registrado
 * com a nota "sem logo". Módulos em azul da marca, não preto: o contraste
 * do #0D21A1 sobre branco é ~18:1, muito acima do que qualquer leitor exige.
 */
async function renderQrToOffscreenCanvas(publicUrl: string): Promise<HTMLCanvasElement> {
  const offscreen = document.createElement("canvas");
  await QRCode.toCanvas(offscreen, publicUrl, {
    width: QR_SIZE,
    margin: 0,
    errorCorrectionLevel: "H",
    color: { dark: BRAND_BLUE, light: WHITE },
  });
  return offscreen;
}

/**
 * Desenha o cartão completo em `canvas`, redimensionando-o para 1080×1350.
 * Assíncrona porque depende da geração do QR e do carregamento da fonte.
 */
export async function drawShareCard(
  canvas: HTMLCanvasElement,
  { publicUrl, storeName }: ShareCardOptions
): Promise<void> {
  const qrCanvas = await renderQrToOffscreenCanvas(publicUrl);

  // Sem isso, o primeiro desenho pode acontecer antes da Manrope estar
  // disponível e o cartão sai com a fonte de fallback — visível só no PNG
  // baixado, nunca num erro.
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }

  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D indisponível");
  }

  const fontFamily = resolveDisplayFontFamily();

  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Moldura arredondada. Os quatro cantos ficam TRANSPARENTES no PNG — é o
  // que faz o cartão parecer um cartão sobre o fundo do story/post, como nas
  // referências. Em troca, o que aparece por trás dos cantos é o fundo de
  // quem publica, não algo controlado aqui.
  ctx.beginPath();
  ctx.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
  ctx.fillStyle = BRAND_BLUE;
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(PANEL_X, PANEL_Y, PANEL_SIZE, PANEL_SIZE, PANEL_RADIUS);
  ctx.fillStyle = WHITE;
  ctx.fill();

  ctx.drawImage(qrCanvas, QR_X, QR_Y, QR_SIZE, QR_SIZE);

  const qrCenterX = QR_X + QR_SIZE / 2;
  const qrCenterY = QR_Y + QR_SIZE / 2;

  ctx.beginPath();
  ctx.arc(qrCenterX, qrCenterY, LOGO_KNOCKOUT_DIAMETER / 2, 0, Math.PI * 2);
  ctx.fillStyle = WHITE;
  ctx.fill();

  drawLogoMark(ctx, qrCenterX, qrCenterY, LOGO_SIZE);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const name = storeName?.trim() || "Minha vitrine";
  const nameText = fitText(ctx, name, fontFamily, 800, NAME_MAX_SIZE, NAME_MIN_SIZE, TEXT_MAX_WIDTH);
  ctx.fillStyle = WHITE;
  ctx.fillText(nameText, CARD_WIDTH / 2, NAME_BASELINE);

  // Link sem o protocolo: "https://" não ajuda ninguém a digitar e rouba
  // espaço do que importa, que é o domínio + o slug.
  const linkText = fitText(
    ctx,
    publicUrl.replace(/^https?:\/\//, ""),
    fontFamily,
    500,
    LINK_SIZE,
    24,
    TEXT_MAX_WIDTH
  );
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillText(linkText, CARD_WIDTH / 2, LINK_BASELINE);
}

export const SHARE_CARD_WIDTH = CARD_WIDTH;
export const SHARE_CARD_HEIGHT = CARD_HEIGHT;
