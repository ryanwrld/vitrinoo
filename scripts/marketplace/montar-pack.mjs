// Monta o pack e seus álbuns no Supabase, a partir do acervo já publicado.
//
//   node scripts/marketplace/montar-pack.mjs --projeto=prod
//
// É ORGANIZAÇÃO, não importação: não cria nem baixa produto nenhum. Só agrupa o
// que já está em `marketplace_products` dentro de um pack com álbuns, que é a
// estrutura que o revendedor já entende do Yupoo (pasta → álbuns → chuteiras).
//
// Idempotente: roda quantas vezes quiser, converge para o mesmo estado.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, p) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? p;
const projeto = arg('projeto', 'prod');

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
const H = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' };
const log = (...a) => console.error(...a);

const PACK = {
  name: 'Pack Chuteiras 23-26 (EM PORTUGUÊS) V1.0',
  slug: 'chuteiras-23-26-v1',
  description:
    'Acervo de chuteiras pré-cadastradas, com nome em português, preço em BRL e fotos reais. ' +
    'Pronto para publicar na sua vitrine sem cadastrar produto por produto.',
  price: null,
  status: 'published',
  position: 0,
};

/**
 * Álbuns por MARCA, como no Yupoo. `Retrô` é o único recorte que não é marca:
 * agrupa os clássicos de couro que já estavam no acervo (Copa Mundial, adipure,
 * Predator Mania), identificados pelo nome de linha "Adidas Clássica".
 *
 * A tabela de ligação é muitos-para-muitos de propósito (migration 0027), então
 * a mesma chuteira aparece em "Adidas" E em "Retrô" sem duplicar nada — e álbuns
 * futuros por uso ("Futsal", "Society") entram sem mexer no schema.
 */
const ALBUNS = [
  { name: 'Nike', position: 1, filtro: (p) => p.brand === 'Nike' },
  { name: 'Adidas', position: 2, filtro: (p) => p.brand === 'Adidas' },
  { name: 'Puma', position: 3, filtro: (p) => p.brand === 'Puma' },
  { name: 'Mizuno', position: 4, filtro: (p) => p.brand === 'Mizuno' },
  { name: 'Joma', position: 5, filtro: (p) => p.brand_other === 'Joma' },
  { name: 'New Balance', position: 6, filtro: (p) => p.brand === 'New Balance' },
  { name: 'Asics', position: 7, filtro: (p) => p.brand_other === 'Asics' },
  { name: 'Retrô', position: 8, filtro: (p) => /Adidas Clássica/i.test(p.name) },
];

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, { headers: H, ...opcoes });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${texto.slice(0, 200)}`);
  return texto ? JSON.parse(texto) : null;
}

// --- produtos publicados, com a capa para servir de capa de álbum -------------
const produtos = [];
for (let offset = 0; ; offset += 1000) {
  const lote = await api(
    `marketplace_products?select=id,name,brand,brand_other,source_rank,marketplace_photos(storage_path,position)&status=eq.published&limit=1000&offset=${offset}`,
  );
  if (!lote.length) break;
  produtos.push(...lote);
  if (lote.length < 1000) break;
}
log(`acervo publicado: ${produtos.length} chuteiras`);

const capaDe = (p) =>
  (p.marketplace_photos ?? []).sort((a, b) => a.position - b.position)[0]?.storage_path ?? null;

// --- pack ---------------------------------------------------------------------
const existente = await api(`marketplace_packs?select=id&slug=eq.${PACK.slug}`);
let packId = existente[0]?.id;

if (packId) {
  await api(`marketplace_packs?id=eq.${packId}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ name: PACK.name, description: PACK.description, status: PACK.status }),
  });
  log(`pack atualizado: ${PACK.name}`);
} else {
  // Capa do pack: a foto do produto mais recente do acervo. É a chuteira que
  // melhor representa "lançamento" — e o dono pode trocar depois pela curadoria.
  const maisNovo = [...produtos].sort((a, b) => (b.source_rank ?? 0) - (a.source_rank ?? 0))[0];
  const criado = await api('marketplace_packs', {
    method: 'POST',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify([{ ...PACK, cover_path: maisNovo ? capaDe(maisNovo) : null }]),
  });
  packId = criado[0].id;
  log(`pack criado: ${PACK.name}`);
}

// --- álbuns -------------------------------------------------------------------
let totalLigacoes = 0;
for (const album of ALBUNS) {
  const membros = produtos.filter(album.filtro);
  if (!membros.length) {
    log(`  ${album.name}: nenhum produto, pulado`);
    continue;
  }

  const jaExiste = await api(
    `marketplace_albums?select=id&pack_id=eq.${packId}&name=eq.${encodeURIComponent(album.name)}`,
  );
  let albumId = jaExiste[0]?.id;

  // Capa do álbum: a chuteira mais recente dele, mesma lógica do pack.
  const capa = capaDe([...membros].sort((a, b) => (b.source_rank ?? 0) - (a.source_rank ?? 0))[0]);

  if (albumId) {
    await api(`marketplace_albums?id=eq.${albumId}`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ cover_path: capa, position: album.position }),
    });
  } else {
    const criado = await api('marketplace_albums', {
      method: 'POST',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify([
        { pack_id: packId, name: album.name, cover_path: capa, position: album.position },
      ]),
    });
    albumId = criado[0].id;
  }

  // Ligações em lote, com upsert pela chave composta — a PK é (album_id,
  // marketplace_product_id), então aqui `ON CONFLICT` funciona (é índice total,
  // diferente do caso parcial de marketplace_imports).
  const LOTE = 500;
  const linhas = membros.map((p, i) => ({
    album_id: albumId,
    marketplace_product_id: p.id,
    position: i,
  }));
  for (let i = 0; i < linhas.length; i += LOTE) {
    await api('marketplace_album_products?on_conflict=album_id,marketplace_product_id', {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(linhas.slice(i, i + LOTE)),
    });
  }
  totalLigacoes += linhas.length;
  log(`  ${album.name}: ${linhas.length} chuteiras`);
}

log(`\npack montado — ${ALBUNS.length} álbuns, ${totalLigacoes} vínculos`);
