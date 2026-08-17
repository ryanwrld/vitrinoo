/**
 * Gradiente da capa da vitrine, derivado da cor de destaque da loja.
 *
 * O BUG QUE ISTO CORRIGE
 *
 * A primeira versão montava o degradê com ALFA sobre a mesma cor:
 * `${accent}CC` e `${accent}40`. Parece razoável, e está errado — a capa
 * fica sobre fundo branco, então a parada de 25% de opacidade não é "azul
 * mais claro", é azul MISTURADO COM BRANCO. Um #0008FF a 25% resulta num
 * lilás pálido, e o revendedor que escolheu azul vê rosa/roxo na própria
 * vitrine.
 *
 * A CORREÇÃO
 *
 * Variar a LUMINOSIDADE mantendo matiz e saturação. As três paradas são a
 * mesma cor em três claridades, todas 100% opacas — nada se mistura com o
 * fundo, e a capa é inequivocamente a cor que a pessoa escolheu.
 *
 * A saturação recebe um piso na parada clara: em HSL, clarear muito
 * dessatura na percepção e a ponta do degradê voltaria a puxar para o
 * branco-acinzentado — exatamente o efeito que estamos eliminando.
 */

/**
 * Cor da PONTA do gradiente (parada de 100%), em hex.
 *
 * Serve para decidir o contraste de qualquer coisa desenhada sobre o canto
 * inferior direito da faixa — que é onde o degradê 135° termina. Usar a cor
 * base aqui daria a resposta errada justamente nos casos extremos: um azul
 * escuro termina 24% mais claro, e é essa ponta que está atrás do botão.
 */
export function coverGradientEndHex(hex: string): string {
  return gradientStopHex(hex, "end");
}

/**
 * Cor do MEIO do gradiente (parada de 45%) — é ela que fica atrás do texto
 * centralizado na faixa. Mesma razão de existir da ponta: cada elemento
 * precisa medir o contraste contra o pedaço do degradê que está sob ele, não
 * contra a cor base.
 */
export function coverGradientMidHex(hex: string): string {
  return gradientStopHex(hex, "mid");
}

function gradientStopHex(hex: string, stop: "mid" | "end"): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return gradientStopHex("#0D21A1", stop);

  const { h, s, l } = hsl;
  const goLighter = l <= 70;
  const step = stop === "mid" ? (goLighter ? 10 : -8) : goLighter ? 24 : -18;

  return hslToHex(h, s, clamp(l + step, 0, 100));
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const chroma = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - chroma / 2;

  const [r, g, b] =
    h < 60
      ? [chroma, x, 0]
      : h < 120
        ? [x, chroma, 0]
        : h < 180
          ? [0, chroma, x]
          : h < 240
            ? [0, x, chroma]
            : h < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];

  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const normalized = hex.trim().replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l: l * 100 };

  const s = delta / (1 - Math.abs(2 * l - 1));

  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  return { h, s: s * 100, l: l * 100 };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function buildCoverGradient(hex: string): string {
  const hsl = hexToHsl(hex);

  // Cor inválida cai no azul de marca em vez de devolver um gradiente
  // quebrado — a capa é a primeira coisa que o cliente vê.
  if (!hsl) return buildCoverGradient("#0D21A1");

  const { h, s, l } = hsl;

  // A COR ESCOLHIDA É A PRIMEIRA PARADA, EXATA — sem clamp, sem ajuste.
  //
  // A versão anterior centrava a faixa na cor e prendia as pontas entre 12% e
  // 88% de claridade. Efeito colateral: `#000000` (claridade 0) era empurrado
  // para 12% nas TRÊS paradas, e o preto que a loja escolheu simplesmente
  // nunca aparecia na capa — virava cinza-escuro. Preto é preto; impor cinza
  // no lugar dele é inventar uma cor que ninguém pediu, mesmo problema do
  // branco que virava rosa.
  //
  // Aqui a cor escolhida ancora o 0% e o degradê SAI dela. Assim ela está
  // sempre presente e dominante, seja qual for.
  //
  // A direção depende de quão clara ela já é: uma cor escura clareia (preto
  // vira preto → grafite), uma cor já muito clara escurece (branco vira
  // branco → cinza-claro). Clarear o branco não produziria degradê nenhum.
  const goLighter = l <= 70;
  const midStep = goLighter ? 10 : -8;
  const endStep = goLighter ? 24 : -18;

  const mid = clamp(l + midStep, 0, 100);
  const end = clamp(l + endStep, 0, 100);

  // Saturação constante nas três paradas: qualquer piso ou teto aqui
  // deslocaria o matiz percebido e devolveria uma cor diferente da escolhida.
  const sat = s.toFixed(1);

  return [
    "linear-gradient(135deg,",
    `hsl(${h} ${sat}% ${l.toFixed(1)}%) 0%,`,
    `hsl(${h} ${sat}% ${mid.toFixed(1)}%) 45%,`,
    `hsl(${h} ${sat}% ${end.toFixed(1)}%) 100%)`,
  ].join(" ");
}
