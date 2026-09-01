// Reconstrói a lista de fotos do catálogo a partir do que já está em disco, sem revarrer
// os álbuns um a um. Existe porque o passo `fotos` só grava a lista no fim: se ele for
// interrompido, as imagens ficam salvas mas o catalogo.json fica sem elas, e regenerar
// exigia repetir ~990 requisições.
//
//   node scripts/marketplace/reconstruir.mjs
//
// A ordem completa não está em disco — só os arquivos. Mas a única posição que importa é a
// CAPA (a lateral externa), e ela é recuperável da listagem de categorias: ~180 requisições
// em vez de 990. As demais seguem por data de gravação, que preserva a ordem do vendedor.
//
// Também grava saida/ordem.json, para que daqui em diante a reconstrução seja 100% offline.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, 'saida');
const FOTOS = path.join(SAIDA, 'fotos');
const VENDEDOR = process.env.YUPOO_VENDEDOR || 'yhc956848708';
const BASE = `https://${VENDEDOR}.x.yupoo.com`;
const CABECALHOS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  Referer: `${BASE}/`,
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error(...a);

const produtos = JSON.parse(fs.readFileSync(path.join(SAIDA, 'catalogo.json'), 'utf8'));
const manifestoPath = path.join(SAIDA, 'ordem.json');
const manifesto = fs.existsSync(manifestoPath)
  ? JSON.parse(fs.readFileSync(manifestoPath, 'utf8'))
  : {};

// Agrupa os arquivos em disco por álbum.
const porAlbum = new Map();
for (const arquivo of fs.readdirSync(FOTOS)) {
  const m = arquivo.match(/^(\d+)-([a-f0-9]+)\.webp$/);
  if (!m) continue;
  if (!porAlbum.has(m[1])) porAlbum.set(m[1], []);
  porAlbum.get(m[1]).push({ arquivo, hash: m[2], mtime: fs.statSync(path.join(FOTOS, arquivo)).mtimeMs });
}

// Descobre a capa lendo as listagens de categoria (o card traz album__img com o hash da capa).
const capas = {};
const categorias = [...new Set(produtos.map((p) => p.origem.catId))];
const precisaRede = produtos.some((p) => !manifesto[p.origem.albumId]);

if (precisaRede) {
  log(`lendo ${categorias.length} listagens de categoria para descobrir as capas...`);
  for (const [i, catId] of categorias.entries()) {
    for (let pagina = 1; pagina <= 20; pagina++) {
      let html;
      try {
        const r = await fetch(`${BASE}/categories/${catId}?page=${pagina}`, {
          headers: CABECALHOS,
          signal: AbortSignal.timeout(25000),
        });
        if (!r.ok) break;
        html = await r.text();
      } catch {
        break;
      }
      const plano = html.replace(/\n/g, ' ');
      let achou = 0;
      for (const m of plano.matchAll(
        /class="album__main"([\s\S]{0,1600}?)album__photonumber"/g,
      )) {
        const bloco = m[1];
        const id = (bloco.match(/href="\/albums\/(\d+)/) || [])[1];
        const hash = (bloco.match(/photo\.yupoo\.com\/[^/"]+\/([a-f0-9]+)\//) || [])[1];
        if (id && hash) { capas[id] = hash; achou++; }
      }
      if (achou < 100) break;
      await dormir(300);
    }
    if ((i + 1) % 25 === 0) log(`  ${i + 1}/${categorias.length} categorias`);
    await dormir(200);
  }
}

let ok = 0;
let semCapa = 0;
let semArquivo = 0;

for (const p of produtos) {
  const id = p.origem.albumId;
  const arquivos = porAlbum.get(id);
  if (!arquivos || !arquivos.length) { p.fotos = []; semArquivo++; continue; }

  const guardado = manifesto[id];
  if (guardado) {
    // Ordem já conhecida: usa o manifesto e ignora a rede.
    p.fotos = guardado.filter((f) => arquivos.some((a) => a.arquivo === f));
  } else {
    const capa = capas[id];
    const resto = arquivos
      .filter((a) => a.hash !== capa)
      .sort((a, b) => a.mtime - b.mtime)
      .map((a) => a.arquivo);
    const oCapa = arquivos.find((a) => a.hash === capa);
    if (!oCapa) semCapa++;
    p.fotos = [...(oCapa ? [oCapa.arquivo] : []), ...resto];
    manifesto[id] = p.fotos;
  }
  p.capa_do_vendedor = !!capas[id] || !!guardado;
  if (p.fotos.length) ok++;
}

fs.writeFileSync(path.join(SAIDA, 'catalogo.json'), JSON.stringify(produtos, null, 1));
fs.writeFileSync(manifestoPath, JSON.stringify(manifesto, null, 1));

log(`\n=> catalogo.json reconstruído — ${ok}/${produtos.length} produtos com fotos`);
log(`   sem nenhum arquivo em disco: ${semArquivo}`);
log(`   sem capa identificada: ${semCapa}`);
log(`   saida/ordem.json gravado — próximas reconstruções são offline`);
