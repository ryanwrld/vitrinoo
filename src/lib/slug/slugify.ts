/**
 * Normaliza uma string livre (nome de loja, local-part de email, texto
 * digitado pelo revendedor) em um slug seguro para URL pública.
 *
 * Ordem obrigatória (02-RESEARCH.md Pitfall 2 + tabela "Don't Hand-Roll"):
 * 1. Unicode NFD para separar caractere-base de marca diacrítica
 * 2. Remoção do bloco de marcas diacríticas combinantes (U+0300–U+036F)
 * 3. Lowercase
 * 4. Qualquer caractere fora de [a-z0-9] é REMOVIDO (concatena as palavras
 *    em vez de separar por hífen — decisão do usuário: slug sem traço,
 *    igual handle de rede social. "RL Esportes" -> "rlesportes", nunca
 *    "rl-esportes")
 *
 * O passo 1-2 (fold) TEM que rodar antes do passo 4 (remoção de
 * não-alfanumérico) — senão "café" perde o "e" acentuado em vez de virar
 * "cafe" (D-01 "sem acento").
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
