import type { CSSProperties } from "react";

/**
 * Enquadramento da capa da vitrine: altura da faixa, zoom e posição.
 *
 * FONTE ÚNICA DA VERDADE
 *
 * Este módulo é usado pelo EDITOR (painel) e pela VITRINE. As duas telas
 * precisam produzir pixel por pixel o mesmo resultado — um editor que mostra
 * um enquadramento e uma vitrine que mostra outro é pior que não ter editor,
 * porque o revendedor ajusta com confiança e publica errado. Por isso quem
 * monta o CSS é uma função só, aqui, e não cada tela por conta própria.
 *
 * TUDO EM PROPORÇÃO E PERCENTUAL, NUNCA EM PIXELS
 *
 * A faixa ocupa a largura da tela, que muda em cada aparelho. Um
 * enquadramento em pixels só valeria no monitor de quem salvou. Com
 * `aspect-ratio` + `object-position` em %, o mesmo valor produz o mesmo
 * enquadramento em qualquer tela — e a vitrine renderiza em CSS puro, sem
 * JavaScript recalculando nada a cada redimensionamento.
 */

/** Faixa mais "alta" possível. Abaixo disto a capa engole a primeira tela. */
export const MIN_BAND_RATIO = 2;
/** Faixa mais fina possível. Acima disto vira um fio ilegível. */
export const MAX_BAND_RATIO = 10;
export const DEFAULT_BAND_RATIO = 5;

export const MIN_ZOOM = 1;
/** Acima de 3x qualquer arte de banner vira mancha — o limite é o da imagem, não o do gosto. */
export const MAX_ZOOM = 3;
export const DEFAULT_ZOOM = 1;

export const DEFAULT_POS = 50;

export type CoverFrame = {
  bandRatio: number;
  zoom: number;
  posX: number;
  posY: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toNumber = (value: unknown, fallback: number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Normaliza valores vindos do banco OU do formulário.
 *
 * Roda nos dois lados de propósito: o que chega do cliente não é confiável, e
 * o que está no banco pode ter sido gravado por uma versão anterior com
 * limites diferentes. Um valor fora da faixa aqui vira uma vitrine quebrada
 * para o cliente final, que não tem como reportar nada.
 */
export function resolveCoverFrame(raw: Partial<Record<keyof CoverFrame, unknown>> | null): CoverFrame {
  return {
    bandRatio: clamp(toNumber(raw?.bandRatio, DEFAULT_BAND_RATIO), MIN_BAND_RATIO, MAX_BAND_RATIO),
    zoom: clamp(toNumber(raw?.zoom, DEFAULT_ZOOM), MIN_ZOOM, MAX_ZOOM),
    posX: clamp(toNumber(raw?.posX, DEFAULT_POS), 0, 100),
    posY: clamp(toNumber(raw?.posY, DEFAULT_POS), 0, 100),
  };
}

/**
 * Estilo da FAIXA (o contêiner).
 *
 * SÓ a proporção, sem teto de altura. Existia um `maxHeight: 420px` aqui, e
 * ele quebrava silenciosamente o controle de altura do editor: numa tela de
 * 1470px, qualquer proporção abaixo de 3,5:1 batia no teto e devolvia sempre
 * 420px. Metade do slider não fazia nada — e a prévia do editor, que tem
 * ~630px de largura e portanto nunca alcançava o teto, continuava respondendo
 * normalmente. O revendedor ajustava, via a prévia mudar, salvava, e a
 * vitrine ficava igual.
 *
 * A altura da capa é decisão do revendedor. Um limite escondido no código que
 * sobrescreve essa decisão sem avisar é pior que não ter controle nenhum.
 */
export function coverBandStyle(frame: CoverFrame): CSSProperties {
  return { aspectRatio: String(frame.bandRatio) };
}

/**
 * Estilo da IMAGEM dentro da faixa.
 *
 * `objectFit: cover` faz a arte preencher a faixa de ponta a ponta (a escolha
 * do usuário: faixa cheia, sem tarja nas laterais). `objectPosition` decide
 * QUAL pedaço sobra quando as proporções não batem — é ele que o arrasto
 * controla.
 *
 * O zoom é um `scale` com `transformOrigin` NO MESMO PONTO do
 * `objectPosition`. Sem essa amarração, ampliar afastaria a imagem do ponto
 * que o revendedor acabou de escolher arrastando, e o ajuste pareceria
 * "escapar da mão".
 */
export function coverImageStyle(frame: CoverFrame): CSSProperties {
  const origin = `${frame.posX}% ${frame.posY}%`;
  return {
    objectFit: "cover",
    objectPosition: origin,
    transform: frame.zoom === 1 ? undefined : `scale(${frame.zoom})`,
    transformOrigin: origin,
  };
}
