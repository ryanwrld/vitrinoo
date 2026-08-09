/**
 * Proporção da capa da vitrine — regras compartilhadas entre o painel (que
 * mede a imagem e avisa o revendedor) e a vitrine (que renderiza a caixa).
 *
 * POR QUE A FAIXA É LIMITADA
 *
 * A caixa da capa adota a proporção da imagem enviada, e é isso que zera o
 * corte. Mas sem limite a adaptação vira uma arma: um banner quadrado (1:1)
 * produziria um cabeçalho de mais de 1000px de altura no desktop e o
 * catálogo inteiro nasceria fora da tela. Uma vitrine que não mostra produto
 * não é uma vitrine.
 *
 * O outro extremo tem o problema oposto: acima de 8:1 a capa vira um fio de
 * ~49px no celular, onde qualquer arte fica ilegível.
 *
 * Fora da faixa, a proporção é ENQUADRADA no limite mais próximo — a imagem
 * então recorta o mínimo necessário, e o painel avisa que isso aconteceu. É
 * melhor que recusar o upload: o revendedor não-técnico raramente tem outra
 * arte à mão, e uma capa levemente recortada serve mais que capa nenhuma.
 */

/**
 * Mais "alta" que isto vira parede e empurra o catálogo para fora da tela.
 *
 * Era 3:1, e isso recortava banners reais: a arte do primeiro revendedor a
 * usar a capa é 1280x458 (2,8:1) — um formato comum em banner de campanha,
 * justamente porque cabe conteúdo dentro dele. Um piso que recorta o caso
 * típico é um piso mal escolhido.
 *
 * 2,5:1 é onde a conta ainda fecha: numa janela de 1470px a capa fica com
 * ~588px de altura. É alto, mas ainda sobra tela para o primeiro produto
 * aparecer, e a arte chega inteira.
 */
export const MIN_COVER_RATIO = 2.5;
/** Mais "fina" que isto vira um fio ilegível no celular. */
export const MAX_COVER_RATIO = 8;

/**
 * Proporção usada quando não há capa (só o gradiente da cor da loja). Fica no
 * meio da faixa útil: presente o bastante para o gradiente ter presença, baixa
 * o bastante para não roubar a tela do primeiro produto.
 */
export const DEFAULT_COVER_RATIO = 5;

export type CoverRatioResult = {
  /** Valor a persistir/renderizar, já dentro da faixa. */
  ratio: number;
  /** `true` quando a imagem enviada ficou fora da faixa e sofreu enquadramento. */
  clamped: boolean;
};

export function resolveCoverRatio(rawRatio: number | null | undefined): CoverRatioResult {
  if (typeof rawRatio !== "number" || !Number.isFinite(rawRatio) || rawRatio <= 0) {
    return { ratio: DEFAULT_COVER_RATIO, clamped: false };
  }

  if (rawRatio < MIN_COVER_RATIO) return { ratio: MIN_COVER_RATIO, clamped: true };
  if (rawRatio > MAX_COVER_RATIO) return { ratio: MAX_COVER_RATIO, clamped: true };

  // Duas casas bastam para o layout e evitam persistir a dízima inteira de uma
  // divisão de pixels.
  return { ratio: Math.round(rawRatio * 100) / 100, clamped: false };
}

/**
 * Mede a imagem no NAVEGADOR, antes do upload.
 *
 * Client-side de propósito: o servidor precisaria decodificar a imagem
 * (`sharp`) só para descobrir dois números que o navegador já tem de graça
 * assim que o arquivo é escolhido — e é justamente aí que dá para mostrar a
 * prévia na proporção certa e avisar sobre enquadramento, antes de salvar.
 *
 * O valor vindo do cliente é, como qualquer entrada, não confiável — por isso
 * `resolveCoverRatio` roda também no servidor. O pior caso de uma mentira
 * aqui é uma proporção estranha na vitrine do próprio mentiroso, e o CHECK da
 * migration 0019 barra valores absurdos.
 */
export async function measureImageRatio(file: File): Promise<number | null> {
  if (typeof window === "undefined") return null;

  const objectUrl = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number } | null>((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve(null);
      image.src = objectUrl;
    });

    if (!dimensions || dimensions.height === 0) return null;
    return dimensions.width / dimensions.height;
  } finally {
    // Sempre revoga, inclusive quando a decodificação falha — senão cada
    // arquivo testado deixa um blob preso na memória da aba.
    URL.revokeObjectURL(objectUrl);
  }
}
