/**
 * Escape dos curingas do `ilike` — `%` e `_`.
 *
 * POR QUE EXISTE: `%` significa "qualquer coisa" e `_` significa "um caractere
 * qualquer" dentro do padrão. Sem escapar, um `%` digitado na busca deixa de ser
 * texto procurado e vira curinga: a consulta devolve o catálogo inteiro como se
 * fosse resultado da pesquisa. Um `_` é mais silencioso e pior — casa um
 * caractere qualquer, então a busca acha coisas que o usuário não pediu e ele
 * não tem como entender por quê.
 *
 * Estava resolvido e documentado só em `marketplace/list.ts`, e a busca global
 * repetia o bug. Extraído para cá como fonte única: qualquer `ilike` com termo
 * digitado passa por aqui.
 *
 * Devolve string vazia para termo curto demais — quem chama trata isso como
 * "não busque nada", em vez de deixar um padrão `%%` varrer a tabela.
 */
export const TAMANHO_MINIMO_BUSCA = 2;

export function escaparCurringasIlike(termo: string): string {
  const limpo = termo.trim();
  if (limpo.length < TAMANHO_MINIMO_BUSCA) return "";
  return limpo.replace(/[%_]/g, (caractere) => `\\${caractere}`);
}

/**
 * Minúscula e sem acento — a normalização que as DUAS pontas da busca usam.
 *
 * Mora aqui, e não no registro, porque o registro importa ícones do lucide e
 * este módulo precisa ser importável por uma Server Action sem arrastar isso
 * junto. Mais importante: precisa existir UMA definição.
 *
 * Ela tem que casar com `public.busca_sem_acento` do banco (migration 0037), que
 * alimenta a coluna `name_busca`. Se as duas divergirem, o termo casa de um lado
 * e não casa do outro — e o sintoma é uma busca que "às vezes não acha", que é
 * o pior tipo de bug para depurar.
 */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
