// Gera uma página local para revisar visualmente os 250 produtos curados.
// A curadoria deste catálogo é visual — um JSON não dá para julgar 250 chuteiras.
//
//   node scripts/marketplace/revisar.mjs && open scripts/marketplace/saida/revisar.html
//
// A página lê as fotos direto de saida/fotos/, então não duplica nada em disco.
// Marcar/desmarcar grava a decisão em localStorage e exporta um JSON com os vetados.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { semSufixo } from './lib-overrides.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, 'saida');
const produtos = JSON.parse(fs.readFileSync(path.join(SAIDA, 'catalogo.json'), 'utf8'));

const escapar = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Intercala linhagens para que variantes do mesmo modelo (mesma foto de capa, solados
// diferentes) não caiam lado a lado — a decisão registrada na Fase A.
function intercalar(lista) {
  const grupos = new Map();
  for (const p of lista) {
    const chave = semSufixo(p.nome);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(p);
  }
  const filas = [...grupos.values()];
  const saida = [];
  let restam = true;
  while (restam) {
    restam = false;
    for (const f of filas) {
      const p = f.shift();
      if (p) { saida.push(p); restam = true; }
    }
  }
  return saida;
}

const ordenados = intercalar(produtos);

const cards = ordenados
  .map((p, i) => {
    const capa = p.fotos?.[0] ? `fotos/${p.fotos[0]}` : '';
    const galeria = (p.fotos || []).map((f) => `fotos/${f}`);
    const grade = p.tamanhos.min ? `${p.tamanhos.min}-${p.tamanhos.max}` : 'sem grade';
    return `<article class="c" data-i="${i}" data-id="${escapar(p.origem.albumId)}">
  <div class="ph">${capa ? `<img src="${capa}" loading="lazy" alt="">` : '<div class="vazio">sem foto</div>'}
    ${p.recente ? '<span class="novo">novo</span>' : ''}
    <span class="n">${(p.fotos || []).length} fotos</span></div>
  <h3>${escapar(p.nome)}</h3>
  <p class="m"><b>R$ ${p.preco_sugerido}</b> · ${grade} · ${escapar(p.sole || 'sem solado')}</p>
  <p class="cn">${escapar(p.origem.nomeChines)}</p>
  <button class="v" type="button">vetar</button>
  <div class="g">${galeria.map((f) => `<img src="${f}" loading="lazy" alt="">`).join('')}</div>
</article>`;
  })
  .join('\n');

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Curadoria — pacote Vitrinoo</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#111; --mut:#6b7280; --li:#e5e7eb; --ac:#059669; --ve:#dc2626; }
  @media (prefers-color-scheme:dark){ :root{ --bg:#0b0d10; --fg:#e9eaec; --mut:#9aa1ab; --li:#232830; } }
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--fg);
    font:15px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  header{position:sticky;top:0;z-index:9;background:var(--bg);border-bottom:1px solid var(--li);
    padding:14px 20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
  h1{font-size:16px;margin:0;font-weight:650}
  .st{color:var(--mut);font-size:13px} .st b{color:var(--fg)}
  input[type=search]{flex:1;min-width:180px;padding:7px 11px;border:1px solid var(--li);
    border-radius:8px;background:transparent;color:inherit;font:inherit}
  button{font:inherit;cursor:pointer;border:1px solid var(--li);background:transparent;
    color:inherit;border-radius:8px;padding:7px 12px}
  main{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:18px;padding:20px}
  .c{border:1px solid var(--li);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
  .c.off{opacity:.32}
  .ph{position:relative;aspect-ratio:1;background:#00000010}
  .ph img{width:100%;height:100%;object-fit:cover;display:block}
  .vazio{display:grid;place-items:center;height:100%;color:var(--mut);font-size:13px}
  .novo{position:absolute;top:8px;left:8px;background:var(--ac);color:#fff;font-size:11px;
    padding:2px 7px;border-radius:99px}
  .n{position:absolute;bottom:8px;right:8px;background:#000000aa;color:#fff;font-size:11px;
    padding:2px 7px;border-radius:99px}
  h3{font-size:13.5px;margin:10px 12px 4px;font-weight:600;line-height:1.3}
  .m{margin:0 12px;font-size:12.5px;color:var(--mut)} .m b{color:var(--fg)}
  .cn{margin:4px 12px 10px;font-size:11px;color:var(--mut);opacity:.65}
  .v{margin:0 12px 12px;padding:5px}
  .c.off .v{border-color:var(--ve);color:var(--ve)}
  .g{display:none;grid-template-columns:repeat(5,1fr);gap:2px;padding:0 2px 2px}
  .g img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:3px}
  body.todas .g{display:grid}
</style></head><body>
<header>
  <h1>Curadoria do pacote</h1>
  <span class="st"><b id="ok">0</b> aprovados · <b id="no">0</b> vetados</span>
  <input type="search" id="q" placeholder="filtrar por nome, solado, preço…">
  <button id="galeria">ver todas as fotos</button>
  <button id="exportar">exportar vetados</button>
</header>
<main id="lista">
${cards}
</main>
<script>
  const CHAVE = 'curadoria-vitrinoo';
  const vetados = new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]'));
  const cards = [...document.querySelectorAll('.c')];

  function pintar() {
    cards.forEach(c => c.classList.toggle('off', vetados.has(c.dataset.id)));
    document.getElementById('no').textContent = vetados.size;
    document.getElementById('ok').textContent = cards.length - vetados.size;
    localStorage.setItem(CHAVE, JSON.stringify([...vetados]));
  }

  document.getElementById('lista').addEventListener('click', e => {
    const b = e.target.closest('.v'); if (!b) return;
    const id = b.closest('.c').dataset.id;
    vetados.has(id) ? vetados.delete(id) : vetados.add(id);
    pintar();
  });

  document.getElementById('q').addEventListener('input', e => {
    const t = e.target.value.toLowerCase().trim();
    cards.forEach(c => { c.style.display = !t || c.textContent.toLowerCase().includes(t) ? '' : 'none'; });
  });

  document.getElementById('galeria').addEventListener('click', () => {
    document.body.classList.toggle('todas');
  });

  // Sem download automático: o visualizador pode bloquear. Mostra o JSON pra copiar.
  document.getElementById('exportar').addEventListener('click', () => {
    const j = JSON.stringify([...vetados], null, 1);
    const w = window.open('', '_blank');
    if (w) { w.document.write('<pre>' + j.replace(/</g, '&lt;') + '</pre>'); w.document.close(); }
    else { prompt('IDs vetados (copie):', j); }
  });

  pintar();
</script></body></html>`;

fs.writeFileSync(path.join(SAIDA, 'revisar.html'), html);
console.error(`=> saida/revisar.html — ${produtos.length} produtos, intercalados por linhagem`);
