// Remove fotos órfãs — de produtos que saíram do catálogo em alguma remontagem
// (linha fora de linha, faixa não-elite, retrô, ou poda de AG).
//   node scripts/marketplace/limpar.mjs [--simular]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FOTOS = path.join(AQUI, 'saida', 'fotos');
const simular = process.argv.includes('--simular');

const produtos = JSON.parse(fs.readFileSync(path.join(AQUI, 'saida', 'catalogo.json'), 'utf8'));
const usadas = new Set(produtos.flatMap((p) => p.fotos || []));

// TRAVA DE SEGURANÇA. `ingest.mjs montar` reescreve catalogo.json SEM o campo
// `fotos` — ele só é preenchido no fim do passo `fotos`. Rodar a limpeza nessa
// janela fazia "nenhuma foto em uso" ser lido como "todas são órfãs", e o script
// apagava o acervo local inteiro. Aconteceu de verdade: 4.950 arquivos, 520 MB.
//
// Zero fotos em uso com produtos no catálogo nunca é um estado legítimo — é
// sempre a ordem errada de execução. Abortar é a única resposta correta.
if (usadas.size === 0 && produtos.length > 0) {
  console.error(
    `abortado: catalogo.json tem ${produtos.length} produtos e NENHUMA foto associada.\n` +
      'Isso indica que `montar` rodou depois do último `fotos`. Rode `node ingest.mjs fotos`\n' +
      '(ou `node reconstruir.mjs`) antes de limpar — do contrário este script apagaria tudo.',
  );
  process.exit(1);
}

const todas = fs.readdirSync(FOTOS);
const orfas = todas.filter((f) => !usadas.has(f));
const peso = orfas.reduce((a, f) => a + fs.statSync(path.join(FOTOS, f)).size, 0);

if (!simular) orfas.forEach((f) => fs.unlinkSync(path.join(FOTOS, f)));

const restantes = todas.length - (simular ? 0 : orfas.length);
console.error(`${simular ? '[simulação] ' : ''}órfãs: ${orfas.length} (${(peso / 1048576).toFixed(0)} MB)`);
console.error(`fotos em uso: ${usadas.size} | em disco depois: ${restantes}`);
