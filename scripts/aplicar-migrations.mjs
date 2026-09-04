// Aplica migrations específicas num dos DOIS projetos Supabase do Vitrinoo.
//
//   node scripts/aplicar-migrations.mjs --projeto=teste --de=0031
//   node scripts/aplicar-migrations.mjs --projeto=teste --de=0027 --ate=0027
//   node scripts/aplicar-migrations.mjs --projeto=prod  --de=0031 --confirmar
//
// SEM `--confirmar` ele é SECO: mostra exatamente o que rodaria e não escreve nada.
//
// POR QUE EXISTE: o projeto mantém dois Supabase (produção e teste) e as migrations
// precisam ir para os dois. `supabase db push` empurra tudo que não estiver na tabela de
// histórico do remoto — e como aqui as migrations foram aplicadas à mão pelo SQL Editor,
// esse histórico não reflete a realidade: um push tentaria reaplicar as 30 primeiras.
// Este script aplica um RECORTE explícito, escolhido por você.
//
// O token de acesso vem do ambiente. O CLI guarda o dele no keychain do macOS:
//   SUPABASE_ACCESS_TOKEN=$(security find-generic-password -s "Supabase CLI" -a supabase -w) \
//     node scripts/aplicar-migrations.mjs --projeto=teste --de=0031

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..');
const DIR = path.join(RAIZ, 'supabase', 'migrations');

const arg = (nome, padrao) => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split('=')[1] : padrao;
};
const temFlag = (nome) => process.argv.includes(`--${nome}`);

const projeto = arg('projeto', '');
const de = arg('de', '');
// Recorte fechado. Sem `--ate`, aplica tudo de `de` em diante.
const ate = arg('ate', '9999');
const confirmar = temFlag('confirmar');

// Os refs saem do .env.local, e não ficam escritos aqui: o alvo é explícito no comando,
// porque aplicar DDL no ambiente errado é caro de desfazer.
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const refDe = (url) => (url ?? '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null;
const ALVOS = {
  teste: refDe(env.TEST_SUPABASE_URL),
  prod: refDe(env.NEXT_PUBLIC_SUPABASE_URL),
};

if (!ALVOS[projeto]) {
  console.error(`Use --projeto=teste ou --projeto=prod. Recebido: "${projeto}"`);
  process.exit(1);
}
if (!de) {
  console.error('Use --de=0031 para dizer a partir de qual migration aplicar.');
  process.exit(1);
}

// Token: do ambiente, ou do .env.local. O arquivo vem PRIMEIRO na prática porque é onde
// dá para trocá-lo sem que ele passe pelo terminal — um token colado num comando fica no
// histórico do shell e na transcrição da sessão.
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error(
    'SUPABASE_ACCESS_TOKEN ausente.\n' +
      'Gere um em https://supabase.com/dashboard/account/tokens e ponha no .env.local.',
  );
  process.exit(1);
}

const ref = ALVOS[projeto];
const arquivos = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.sql') && f.slice(0, 4) >= de && f.slice(0, 4) <= ate)
  .sort();

if (!arquivos.length) {
  console.error(`Nenhuma migration a partir de ${de} em supabase/migrations/`);
  process.exit(1);
}

console.log(`projeto: ${projeto} (${ref})`);
console.log(`migrations (${arquivos.length}):`);
for (const f of arquivos) {
  const linhas = fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').length;
  console.log(`  ${f}  (${linhas} linhas)`);
}

if (!confirmar) {
  console.log('\n--- SECO: nada foi aplicado. Repita com --confirmar para valer. ---');
  process.exit(0);
}

// Uma migration por chamada, EM ORDEM e parando no primeiro erro: o `database/query` da
// API roda o corpo inteiro numa transação, então uma falha não deixa meia migration — mas
// continuar depois dela aplicaria a 0033 num banco sem a 0031.
for (const f of arquivos) {
  const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
  process.stdout.write(`aplicando ${f}… `);

  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });

  if (!r.ok) {
    console.log('FALHOU');
    console.error(`  HTTP ${r.status}: ${(await r.text()).slice(0, 800)}`);
    console.error(`\nParei aqui. As anteriores a ${f} já foram aplicadas.`);
    process.exit(1);
  }
  console.log('ok');
}

console.log(`\nTodas aplicadas em "${projeto}".`);
