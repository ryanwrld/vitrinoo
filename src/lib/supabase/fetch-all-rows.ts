/**
 * Leitura COMPLETA de um conjunto de linhas, contornando o teto de 1000 do
 * PostgREST.
 *
 * POR QUE EXISTE
 *
 * O Supabase aplica um limite máximo de linhas por resposta (1000 neste
 * projeto, confirmado empiricamente: 1100 linhas inseridas devolvem 1000,
 * tanto para `service_role` quanto para `anon`). O corte é SILENCIOSO — não
 * vem erro, não vem aviso, a resposta simplesmente tem menos linhas do que a
 * tabela.
 *
 * Isso é inofensivo para qualquer query já paginada (`queryPublicProducts`
 * usa `.range()` e busca 21 linhas). É grave para toda agregação feita em
 * MEMÓRIA sobre um `select` sem paginação, porque o resultado passa a ser
 * calculado sobre uma amostra parcial e apresentado como se fosse o total:
 *
 * - `queryTodayStats`: "cliques hoje" travaria em 1000 e a conversão sairia
 *   errada, exibida ao lado de um "visualizações" que usa `count: exact` e
 *   portanto está certo — duas métricas na mesma tela, uma confiável e outra
 *   não.
 * - `queryTrendRanking`: lê até 60 dias (o dobro do período, para comparar
 *   com o anterior). Com ~17 eventos/dia o teto já estoura, e a ordenação
 *   das linhas descartadas é indefinida — o ranking viraria uma amostra sem
 *   critério.
 * - `querySizeDemand` e `queryBrandFacets`: mesmo padrão.
 *
 * COMO FUNCIONA
 *
 * Pagina com `.range()` em blocos de `PAGE_SIZE` até uma página vir
 * incompleta (fim natural dos dados). O chamador PRECISA aplicar um
 * `.order()` determinístico no builder — sem ordenação estável, o Postgres
 * não garante a mesma ordem entre requisições e uma linha poderia aparecer
 * em duas páginas ou em nenhuma.
 *
 * `MAX_ROWS` é uma trava de segurança contra laço infinito, não um limite de
 * produto: se alguma loja passar disso, o corte volta a existir — por isso o
 * teto é alto o bastante para não ser alcançado na escala deste MVP, e o
 * ponto de revisão fica registrado aqui em vez de virar outra truncagem
 * silenciosa.
 */
export const PAGE_SIZE = 1000;
export const MAX_ROWS = 50_000;

type RangeQuery<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => RangeQuery<T>
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);

    // Erro devolve o que já foi lido em vez de lançar: métrica é informação
    // de apoio e nunca pode derrubar o carregamento do painel — mesma
    // disciplina de falha silenciosa já adotada em `syncStoreTimezone`.
    if (error || !data) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}
