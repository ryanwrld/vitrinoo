// CLI: traduz as 159 categorias do Yupoo e imprime o resultado com a cobertura.
//   node scripts/marketplace/traduz-categorias.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { traduz } from './lib-traduz.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const cats = JSON.parse(fs.readFileSync(path.join(AQUI, 'categorias-yupoo.json'), 'utf8'));

let ok = 0, rev = 0, desc = 0;
const linhas = cats.map(([cn, id]) => {
  const r = traduz(cn);
  if (r.descarta) { desc++; return `❌ DESCARTA  ${cn}  (${r.motivo})`; }
  if (r.revisar) { rev++; return `⚠️  REVISAR   ${cn}`; }
  ok++; return `✅ ${cn}\n     → ${r.nome}`;
});
console.log(linhas.join('\n'));
console.log(`\n--- ${ok} traduzidas | ${rev} a revisar | ${desc} descartadas | ${cats.length} total ---`);
