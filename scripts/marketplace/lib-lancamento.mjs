// Resolve "este par é lançamento?" a partir de dados reais de mercado.
//
// SUBSTITUI a heurística `recente = terço superior por album_id` que vivia em ingest.mjs.
// Aquela régua respondia a pergunta errada: album_id diz quando o FORNECEDOR subiu a foto,
// não quando a marca lançou o par — um retrô fotografado ontem entrava como lançamento, e
// era isso que empurrava +R$40 no preço sugerido.
//
// A regra agora é uma só: é lançamento quem for a geração de MAIOR data conhecida dentro da
// sua linha (lancamentos.json). Quem não casa com nenhum padrão, quem está em `confirmar`,
// quem é `descontinuada` ou `semCiclo` — nenhum é lançamento. O lado seguro do erro é não
// marcar: cobrar adicional de lançamento por um par velho é o lojista perdendo venda.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const TABELA = JSON.parse(fs.readFileSync(path.join(AQUI, 'lancamentos.json'), 'utf8'));

// Compilado UMA vez no import, e não a cada nome: o backfill roda isto 990 vezes, e
// recompilar ~35 regexes por produto é trabalho puro sem resultado diferente.
const LINHAS = TABELA.linhas.map((e) => ({ ...e, re: new RegExp(e.padrao, 'i') }));
const CONFIRMAR = TABELA.confirmar.map((e) => ({ ...e, re: new RegExp(e.padrao, 'i') }));

// Geração mais nova conhecida de cada linha. Inclui gerações que o acervo NÃO tem — é o
// que faz a Tiempo Legend 10 parar de ser "a mais nova das Tiempo": a Maestro está na
// tabela mesmo sem nenhum par dela no estoque.
const ATUAL = new Map();
for (const e of LINHAS) {
  if (!e.data) continue;
  const atual = ATUAL.get(e.linha);
  if (!atual || e.data > atual.data) ATUAL.set(e.linha, e);
}

/**
 * @param {string} nome  nome em português, do jeito que fica em products.name
 * @returns {{linha:string|null, ger:string|null, data:string|null, lancamento:boolean, motivo:string}}
 */
export function classificarLancamento(nome) {
  const limpo = String(nome ?? '').trim();

  // Pendências primeiro: um nome que a Nike não fabrica ("Phantom GX III") pode casar com
  // o padrão genérico da linha logo abaixo, e aí entraria como lançamento por acidente.
  // Ordem importa, e é por isso que esta checagem vem antes.
  const duvida = CONFIRMAR.find((c) => c.re.test(limpo));
  if (duvida) {
    return { linha: null, ger: null, data: null, lancamento: false, motivo: `confirmar: ${duvida.motivo}` };
  }

  const achado = LINHAS.find((e) => e.re.test(limpo));
  if (!achado) {
    return { linha: null, ger: null, data: null, lancamento: false, motivo: 'sem correspondência na tabela' };
  }
  if (achado.descontinuada) {
    return { linha: achado.linha, ger: achado.ger ?? null, data: null, lancamento: false, motivo: 'linha descontinuada' };
  }
  if (achado.semCiclo) {
    return { linha: achado.linha, ger: achado.ger ?? null, data: null, lancamento: false, motivo: 'linha sem ciclo de geração' };
  }

  const atual = ATUAL.get(achado.linha);
  const eLancamento = Boolean(atual && atual.data === achado.data);

  return {
    linha: achado.linha,
    ger: achado.ger ?? null,
    // `data` é sempre AAAA-MM na tabela; o banco guarda `date`, então o dia 01 entra aqui.
    data: `${achado.data}-01`,
    lancamento: eLancamento,
    motivo: eLancamento
      ? `geração atual de ${achado.linha}`
      : `${achado.linha} está na ${atual?.ger ?? '?'} (${atual?.data ?? '?'})`,
  };
}

/** Só para o relatório do backfill e do ingest. */
export function geracoesAtuais() {
  return [...ATUAL.values()].map((e) => `${e.linha} ${e.ger ?? ''} (${e.data})`.replace(/\s+/g, ' '));
}
