import type { SupabaseClient } from "@supabase/supabase-js";
import { SOLES } from "@/lib/products/constants";

/**
 * O que o fluxo de precificação precisa saber antes de abrir.
 *
 * O produto importado nascia com `suggested_price` — o preço que a CURADORIA achou justo,
 * não o que o lojista cobra. Este módulo é o que troca isso: ele lê o conjunto que está
 * prestes a entrar na loja e devolve, por tipo de solado, quantos pares são e quantos são
 * lançamento, mais a regra que a loja já tiver salvo de uma importação anterior.
 */

/**
 * Os cinco tipos que o lojista precifica.
 *
 * SÃO CINCO, e não os seis de `SOLES`: AG e MG viram um item só. MG é como a Puma chama o
 * solado de grama sintética — pedir dois preços para a mesma coisa faria o lojista parar
 * para descobrir a diferença que não existe. A fusão é SÓ de interface: `solados` guarda as
 * duas siglas e o mesmo número é gravado nas duas, então o SQL da importação continua
 * casando por sigla, sem conceito de grupo.
 *
 * A ordem é a do mockup aprovado — do que o revendedor mais vende para o que menos vende,
 * e não alfabética.
 */
export const TIPOS_DE_SOLADO = [
  { id: "fg", rotulo: "Trava Comum", sigla: "FG", solados: ["FG"] },
  { id: "sg", rotulo: "Trava de alumínio", sigla: "SG", solados: ["SG"] },
  { id: "ic", rotulo: "Futsal", sigla: "IC", solados: ["IC"] },
  { id: "tf", rotulo: "Society", sigla: "TF", solados: ["TF"] },
  { id: "ag", rotulo: "Multigramados", sigla: "AG/MG", solados: ["AG", "MG"] },
] as const;

export type TipoDeSolado = (typeof TIPOS_DE_SOLADO)[number];

/** Da sigla gravada em `products.sole` para o tipo que a interface mostra. */
export const TIPO_POR_SOLADO = new Map<string, TipoDeSolado["id"]>(
  TIPOS_DE_SOLADO.flatMap((t) => t.solados.map((s) => [s, t.id] as const)),
);

/**
 * Os tipos que ESTE conjunto realmente tem.
 *
 * A tela pede um preço por tipo, e pedir o preço de um tipo com zero par é pedir uma
 * decisão que não muda nada: quem tirou dez chuteiras sem nenhuma society travava o
 * "Continuar" até inventar um número para "Society, 0 modelos". Quando ele comprar o
 * pacote, o tipo aparece — aí com os 119 pares que justificam a pergunta.
 *
 * A lista NUNCA volta vazia: um conjunto sem nenhum solado reconhecível (sigla nova no
 * acervo, `sole` em branco) cairia numa etapa 1 sem campo nenhum, e o fluxo é obrigatório
 * — não dá para deixar o lojista numa tela que ele não consegue concluir. Nesse caso
 * pergunta os cinco, que é o comportamento antigo.
 */
export function tiposComModelo(contagens: ContagemPorTipo[]): TipoDeSolado[] {
  const comPar = TIPOS_DE_SOLADO.filter(
    (t) => (contagens.find((c) => c.id === t.id)?.total ?? 0) > 0,
  );
  return comPar.length ? comPar : [...TIPOS_DE_SOLADO];
}

/**
 * As frases da tela de processamento, e quanto cada uma fica.
 *
 * Elas devolvem ao lojista as decisões que ele acabou de tomar, na ordem em que as tomou —
 * é o que dá sentido à espera em vez de só ocupá-la. Então quando não há lançamento na leva
 * a do meio não pode ficar: ele nunca definiu adicional nenhum, e "Aplicando o adicional nos
 * lançamentos" seria a tela contando uma etapa que não aconteceu.
 *
 * Os tempos são DESIGUAIS de propósito: processo real não avança em intervalos cronometrados
 * iguais, e cadência igual entrega que é teatro. Na versão de três, a do meio é a mais longa
 * porque é a que mexe em mais coisa.
 *
 * `msTeatro` sai da SOMA da lista, nunca de uma constante à parte: é ele que segura o piso
 * da espera, e um piso maior que as frases deixaria a última parada na tela depois de a
 * importação já ter acabado.
 */
export function passosDoProcessamento(temLancamento: boolean): {
  passos: string[];
  passoMs: number[];
  msTeatro: number;
} {
  const passos = temLancamento
    ? [
        "Gravando o preço de cada tipo",
        "Aplicando o adicional nos lançamentos",
        "Guardando tudo como rascunho",
      ]
    : ["Gravando o preço de cada tipo", "Guardando tudo como rascunho"];

  const passoMs = temLancamento ? [2200, 3000, 2400] : [2600, 2600];

  return { passos, passoMs, msTeatro: passoMs.reduce((s, n) => s + n, 0) };
}

export type ContagemPorTipo = {
  id: TipoDeSolado["id"];
  total: number;
  lancamentos: number;
};

export type RegraDePreco = {
  /** Por SIGLA de solado, do jeito que vai para o banco: {"FG":430,"AG":390,"MG":390}. */
  precosPorSolado: Record<string, number>;
  adicionalLancamento: number;
};

export type ModeloDestaque = {
  nome: string;
  fotoPath: string | null;
  precoSugerido: number;
  tipo: TipoDeSolado["id"] | null;
};

export type ContextoPrecificacao = {
  contagens: ContagemPorTipo[];
  total: number;
  totalLancamentos: number;
  regraSalva: RegraDePreco | null;
  destaque: ModeloDestaque | null;
};

/**
 * Conta por tipo e acha o modelo de destaque, num conjunto de ids.
 *
 * ESCOPADO AO CONJUNTO QUE VAI ENTRAR, e não ao acervo inteiro: o fluxo mostra "565
 * modelos" ao lado de cada tipo, e para quem está pegando as 10 sorteadas esse número tem
 * que ser o da amostra dele. `queryMarketplaceFacets` conta o acervo todo e responde outra
 * pergunta — usar aquela aqui mostraria 565 para quem vai receber 6.
 *
 * Uma consulta só, com paginação explícita: o pacote tem 990 ids e o PostgREST corta em
 * 1.000 por padrão. Deixar no limite é o tipo de coisa que quebra sozinha quando o acervo
 * crescer, então o laço existe desde já.
 */
export async function queryContextoPrecificacao(
  supabase: SupabaseClient,
  storeId: string,
  ids: string[],
): Promise<ContextoPrecificacao> {
  const vazio: ContextoPrecificacao = {
    contagens: TIPOS_DE_SOLADO.map((t) => ({ id: t.id, total: 0, lancamentos: 0 })),
    total: 0,
    totalLancamentos: 0,
    regraSalva: null,
    destaque: null,
  };

  const [fichas, regraSalva] = await Promise.all([
    lerFichas(supabase, ids),
    queryRegraDaLoja(supabase, storeId),
  ]);

  if (!fichas.length) return { ...vazio, regraSalva };

  const porTipo = new Map<TipoDeSolado["id"], ContagemPorTipo>(
    TIPOS_DE_SOLADO.map((t) => [t.id, { id: t.id, total: 0, lancamentos: 0 }]),
  );

  let totalLancamentos = 0;
  for (const f of fichas) {
    if (f.is_lancamento) totalLancamentos++;
    const tipo = f.sole ? TIPO_POR_SOLADO.get(f.sole) : undefined;
    if (!tipo) continue;
    const linha = porTipo.get(tipo)!;
    linha.total++;
    if (f.is_lancamento) linha.lancamentos++;
  }

  /*
    O destaque da etapa 2 é o par MAIS NOVO do conjunto — é ele que carrega a prévia
    "R$ 430 → R$ 480" enquanto o lojista digita o adicional. Prefere um lançamento de
    verdade: mostrar o efeito do adicional num par que não é lançamento mentiria sobre a
    regra que ele acabou de definir. Sem nenhum lançamento no conjunto (amostra pequena
    pode não ter), cai no mais novo, que é o comportamento honesto possível.
  */
  const porRank = [...fichas].sort((a, b) => (b.source_rank ?? 0) - (a.source_rank ?? 0));
  const escolhido = porRank.find((f) => f.is_lancamento) ?? porRank[0] ?? null;

  return {
    contagens: TIPOS_DE_SOLADO.map((t) => porTipo.get(t.id)!),
    total: fichas.length,
    totalLancamentos,
    regraSalva,
    destaque: escolhido
      ? {
          nome: escolhido.name,
          fotoPath: await lerFotoDe(supabase, escolhido.id),
          precoSugerido: Number(escolhido.suggested_price ?? 0),
          tipo: escolhido.sole ? (TIPO_POR_SOLADO.get(escolhido.sole) ?? null) : null,
        }
      : null,
  };
}

type Ficha = {
  id: string;
  name: string;
  sole: string | null;
  suggested_price: number | null;
  source_rank: number | null;
  is_lancamento: boolean;
};

/**
 * As fichas do conjunto, SEM AS FOTOS.
 *
 * Trazer `marketplace_photos` junto custava caro por nada: são ~7 fotos por par, e para o
 * pacote isso significa arrastar ~7.000 linhas para usar UMA — a do modelo em destaque da
 * etapa 2. Medido: 5,7s de spinner até o fluxo abrir. A foto do escolhido é buscada depois,
 * numa consulta de uma linha só.
 */
async function lerFichas(supabase: SupabaseClient, ids: string[]): Promise<Ficha[]> {
  const respostas = await Promise.all(
    lotesDe(ids).map((lote) =>
      supabase
        .from("marketplace_products")
        .select("id, name, sole, suggested_price, source_rank, is_lancamento")
        .in("id", lote)
        .eq("status", "published"),
    ),
  );

  return respostas.flatMap(({ data }) =>
    (data ?? []).map((linha) => ({
      id: linha.id,
      name: linha.name,
      sole: linha.sole,
      suggested_price: linha.suggested_price,
      source_rank: linha.source_rank,
      is_lancamento: Boolean(linha.is_lancamento),
    })),
  );
}

/**
 * Fatia a lista de ids em lotes de 500.
 *
 * O PostgREST corta em 1.000 por padrão e o pacote já tem 990 — ficar no limite é o tipo de
 * coisa que quebra sozinha quando o acervo crescer. Os lotes vão EM PARALELO nas duas
 * consultas que usam isto: são leituras independentes, e encadeá-las somava o tempo de cada
 * uma sem motivo.
 */
function lotesDe(ids: string[]): string[][] {
  const LOTE = 500;
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += LOTE) lotes.push(ids.slice(i, i + LOTE));
  return lotes;
}

/**
 * Quais tipos o conjunto tem, direto do banco.
 *
 * A ação que grava os preços precisa saber isto SEM confiar no cliente: é ela que decide de
 * quais tipos exigir preço, e aceitar essa lista do formulário deixaria um tipo cheio de
 * pares passar sem preço — cairia no `coalesce` do RPC e os produtos nasceriam com o preço
 * da curadoria, que é exatamente o que este fluxo existe para impedir.
 *
 * Só a coluna `sole`: contar já é o suficiente, e trazer a ficha inteira de 990 pares para
 * ler uma coluna é peso puro.
 */
export async function queryTiposPresentes(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Set<TipoDeSolado["id"]>> {
  const respostas = await Promise.all(
    lotesDe(ids).map((lote) =>
      supabase
        .from("marketplace_products")
        .select("sole")
        .in("id", lote)
        .eq("status", "published"),
    ),
  );

  const presentes = new Set<TipoDeSolado["id"]>();
  for (const { data } of respostas) {
    for (const linha of data ?? []) {
      const tipo = linha.sole ? TIPO_POR_SOLADO.get(linha.sole) : undefined;
      if (tipo) presentes.add(tipo);
    }
  }
  return presentes;
}

/** A primeira foto de um par. Chamada uma vez, só para o destaque da etapa 2. */
async function lerFotoDe(supabase: SupabaseClient, id: string): Promise<string | null> {
  const { data } = await supabase
    .from("marketplace_photos")
    .select("storage_path")
    .eq("marketplace_product_id", id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.storage_path ?? null;
}

/** A regra que a loja já salvou numa importação anterior. `null` na primeira vez. */
export async function queryRegraDaLoja(
  supabase: SupabaseClient,
  storeId: string,
): Promise<RegraDePreco | null> {
  const { data } = await supabase
    .from("store_pricing")
    .select("sole_prices, launch_surcharge")
    .eq("store_id", storeId)
    .maybeSingle();

  if (!data) return null;

  // Filtra siglas desconhecidas na LEITURA: a lista de solados é regra de aplicação e pode
  // encolher (`SOLES` em constants.ts). Uma sigla aposentada que continuasse voltando daqui
  // apareceria como campo fantasma no formulário.
  const cru = (data.sole_prices ?? {}) as Record<string, unknown>;
  const precosPorSolado: Record<string, number> = {};
  for (const sigla of SOLES) {
    const v = Number(cru[sigla]);
    if (Number.isFinite(v) && v > 0) precosPorSolado[sigla] = v;
  }

  return {
    precosPorSolado,
    adicionalLancamento: Number(data.launch_surcharge ?? 0),
  };
}

/**
 * Do formulário (um preço por TIPO) para o banco (um preço por SIGLA).
 *
 * É aqui que "Multigramados" vira AG e MG com o mesmo número — o único lugar do sistema que
 * precisa saber que os dois são a mesma coisa.
 */
export function expandirParaSolados(
  porTipo: Record<string, number>,
): Record<string, number> {
  const saida: Record<string, number> = {};
  for (const tipo of TIPOS_DE_SOLADO) {
    const valor = porTipo[tipo.id];
    if (!Number.isFinite(valor) || valor <= 0) continue;
    for (const sigla of tipo.solados) saida[sigla] = valor;
  }
  return saida;
}

/** O caminho de volta, para reabrir o formulário pré-preenchido. */
export function colapsarParaTipos(
  porSolado: Record<string, number>,
): Record<string, number> {
  const saida: Record<string, number> = {};
  for (const tipo of TIPOS_DE_SOLADO) {
    // A primeira sigla do grupo manda: AG e MG são gravados com o mesmo valor, então ler
    // qualquer uma das duas dá no mesmo — e ler a primeira que existir tolera um registro
    // antigo que só tenha uma delas.
    const sigla = tipo.solados.find((s) => Number(porSolado[s]) > 0);
    if (sigla) saida[tipo.id] = Number(porSolado[sigla]);
  }
  return saida;
}
