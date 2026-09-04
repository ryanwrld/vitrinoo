// Grava model_line / model_gen / launch_date / is_lancamento nos produtos que JÁ estão no
// banco, casando o nome contra scripts/marketplace/lancamentos.json.
//
//   node scripts/marketplace/marcar-lancamentos.mjs --projeto=teste
//   node scripts/marketplace/marcar-lancamentos.mjs --projeto=prod
//   node scripts/marketplace/marcar-lancamentos.mjs --projeto=prod --seco   (só relatório)
//
// IDEMPOTENTE e re-executável: recalcula tudo do zero a cada execução. É assim de
// propósito — quando uma geração nova entrar em lancamentos.json (ou quando você resolver
// uma das pendências), rodar de novo rebaixa a geração anterior sozinho, sem precisar
// saber o que mudou.
//
// Casa contra `name`, e não contra o nome chinês: o nome em português já carrega a linha e
// a geração ("Mercurial 17 tecido Campo (FG)") porque foi lib-traduz.mjs quem o montou. É
// o mesmo texto que o ingest produz, então backfill e ingest concordam por construção.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classificarLancamento, geracoesAtuais } from './lib-lancamento.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

const arg = (nome, padrao) => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split('=')[1] : padrao;
};
const temFlag = (nome) => process.argv.includes(`--${nome}`);

const projeto = arg('projeto', 'teste');
const seco = temFlag('seco');

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(AQUI, '..', '..', '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const URL_BASE = projeto === 'prod' ? env.NEXT_PUBLIC_SUPABASE_URL : env.TEST_SUPABASE_URL;
const CHAVE = projeto === 'prod' ? env.SUPABASE_SERVICE_ROLE_KEY : env.TEST_SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !CHAVE) {
  console.error(`credenciais do projeto "${projeto}" não encontradas em .env.local`);
  process.exit(1);
}

const H = {
  apikey: CHAVE,
  Authorization: `Bearer ${CHAVE}`,
  'Content-Type': 'application/json',
};

const rest = (caminho, init = {}) =>
  fetch(`${URL_BASE}/rest/v1/${caminho}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });

// --- lê o acervo -------------------------------------------------------------
const resposta = await rest('marketplace_products?select=id,name&order=id');
if (!resposta.ok) {
  console.error('falha ao ler o acervo:', resposta.status, await resposta.text());
  process.exit(1);
}
const produtos = await resposta.json();
console.log(`projeto=${projeto}  acervo=${produtos.length} produtos\n`);

console.log('geração atual de cada linha, conforme lancamentos.json:');
geracoesAtuais().forEach((g) => console.log(`  ${g}`));
console.log('');

// --- classifica --------------------------------------------------------------
const porMotivo = new Map();
const exemplo = new Map();
const atualizacoes = [];

for (const p of produtos) {
  const r = classificarLancamento(p.name);
  porMotivo.set(r.motivo, (porMotivo.get(r.motivo) ?? 0) + 1);
  if (!exemplo.has(r.motivo)) exemplo.set(r.motivo, p.name);
  atualizacoes.push({
    id: p.id,
    model_line: r.linha,
    model_gen: r.ger,
    launch_date: r.data,
    is_lancamento: r.lancamento,
  });
}

const lancamentos = atualizacoes.filter((a) => a.is_lancamento).length;

console.log(
  `LANÇAMENTO: ${lancamentos} de ${produtos.length} (${Math.round((lancamentos / produtos.length) * 100)}%)\n`,
);
console.log('por motivo:');
for (const [motivo, n] of [...porMotivo.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${motivo}`);
  console.log(`        ex: ${exemplo.get(motivo)}`);
}

// Pendências em destaque: é o que precisa de olho humano, e some no meio do relatório se
// não for separado. "Phantom GX III" sozinho são 101 pares — o maior bloco do acervo que
// pode ou não ser lançamento.
const pendentes = [...porMotivo.entries()].filter(([m]) => m.startsWith('confirmar:'));
if (pendentes.length) {
  const total = pendentes.reduce((s, [, n]) => s + n, 0);
  console.log(`\n⚠  ${total} pares aguardando sua confirmação (ficam FORA do lançamento):`);
  for (const [motivo, n] of pendentes.sort((a, b) => b[1] - a[1])) {
    console.log(`     ${String(n).padStart(4)}  ${exemplo.get(motivo)}`);
    console.log(`           ${motivo.replace('confirmar: ', '')}`);
  }
  console.log('     Resolver em scripts/marketplace/lancamentos.json e rodar de novo.');
}

if (seco) {
  console.log('\n--seco: nada foi gravado.');
  process.exit(0);
}

// --- grava -------------------------------------------------------------------
// PATCH por id, em lotes: o PostgREST não faz update-many com valores diferentes por linha
// numa chamada só, e um upsert com `resolution=merge-duplicates` exigiria mandar todas as
// colunas NOT NULL do produto de volta — reenviar nome, preço e grade das 990 para mudar
// quatro campos é pedir para sobrescrever algo por engano.
const LOTE = 25;
let gravados = 0;

for (let i = 0; i < atualizacoes.length; i += LOTE) {
  const fatia = atualizacoes.slice(i, i + LOTE);
  const resultados = await Promise.all(
    fatia.map((a) =>
      rest(`marketplace_products?id=eq.${a.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          model_line: a.model_line,
          model_gen: a.model_gen,
          launch_date: a.launch_date,
          is_lancamento: a.is_lancamento,
        }),
      }),
    ),
  );
  for (const r of resultados) {
    if (r.ok) gravados++;
    else console.error('  falha:', r.status, await r.text());
  }
  process.stderr.write(`\r  gravando… ${gravados}/${atualizacoes.length}`);
}

console.log(`\n\nOK — ${gravados} produtos atualizados no projeto "${projeto}".`);
