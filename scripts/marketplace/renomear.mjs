// Reaplica o tradutor sobre um catalogo.json já existente, preservando tudo que o passo
// `fotos` gravou (a lista de arquivos baixados). Use depois de corrigir lib-traduz.mjs —
// rodar `ingest.mjs montar` de novo funcionaria, mas apagaria o campo `fotos`.
//
//   node scripts/marketplace/renomear.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { traduz } from './lib-traduz.mjs';
import { aplicarOverride, comSufixo } from './lib-overrides.mjs';
import { sugerirPreco } from './lib-preco.mjs';
import { marcaDe } from './lib-marca.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO = path.join(AQUI, 'saida', 'catalogo.json');

const produtos = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));

let mudados = 0;
const alertas = [];

for (const p of produtos) {
  const t = traduz(p.origem.nomeChines);
  // Override manual tem precedência: cobre o caso em que a categoria do Yupoo agrupa
  // linhas distintas e o nome só é identificável olhando a foto.
  const aj = aplicarOverride(p.origem.albumId, t.nome, t.sol);
  const nome = aj.nome ? comSufixo(aj.nome, aj.sole) : null;
  if (!nome) {
    alertas.push(`sem tradução: ${p.origem.nomeChines} (álbum ${p.origem.albumId})`);
    continue;
  }
  if (nome !== p.nome) {
    alertas.push(`${p.nome}  →  ${nome}`);
    p.nome = nome;
    mudados++;
  }
  p.sole = aj.sole ?? null;
  // Solado corrigido por override muda a faixa de preço — mantém nome, solado e preço coerentes.
  p.preco_sugerido = sugerirPreco({ solado: p.sole, recente: p.recente });
  const m = marcaDe(p.nome);
  p.brand = m.brand;
  p.brand_other = m.brandOther;
}

// Rede de segurança: nenhum nome pode conter caractere chinês ao chegar na vitrine.
const vazando = produtos.filter((p) => /[一-鿿]/.test(p.nome));
const semSolado = produtos.filter((p) => !p.sole);

fs.writeFileSync(ARQUIVO, JSON.stringify(produtos, null, 1));

alertas.forEach((a) => console.error('  ' + a));
console.error(`\n=> ${mudados} nomes atualizados de ${produtos.length} produtos`);
console.error(`   com chinês vazando: ${vazando.length}${vazando.length ? ' ⚠️' : ' ✓'}`);
vazando.forEach((p) => console.error(`     ! ${p.nome}`));
console.error(`   sem solado (precisam de nome na mão): ${semSolado.length}`);
semSolado.forEach((p) => console.error(`     · ${p.nome} (${p.origem.nomeChines})`));
