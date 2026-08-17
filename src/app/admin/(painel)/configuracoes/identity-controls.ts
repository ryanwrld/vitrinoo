/**
 * Traço compartilhado dos botões de "trocar arquivo" da identidade visual
 * (capa e logo).
 *
 * Existe como constante, e não copiado em cada arquivo, porque a exigência é
 * que os dois sejam IDÊNTICOS — duas cópias da mesma string divergem no
 * primeiro ajuste que alguém fizer só de um lado.
 *
 * Só o que define forma/posição (tamanho, `absolute`, padding) fica no ponto
 * de uso: o da capa é um círculo sobre a imagem, o do logo é um pill em linha.
 */
export const IDENTITY_BUTTON_CLASS =
  "rounded-full border border-gray-300 text-sm font-medium text-gray-700 outline-none transition-colors duration-150 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-primary-subtle dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800";

/**
 * Preenchimento do botão em linha (logo). Fica FORA da constante base porque o
 * botão da capa é vazado de propósito — a imagem aparece por dentro dele.
 */
export const IDENTITY_BUTTON_FILL = "bg-white dark:bg-gray-900";
