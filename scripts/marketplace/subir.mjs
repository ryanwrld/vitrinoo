// Sobe o catálogo curado (saida/catalogo.json + saida/fotos/) para o Supabase.
//
//   node scripts/marketplace/subir.mjs --projeto=teste
//   node scripts/marketplace/subir.mjs --projeto=prod
//
// Opções:
//   --limite=N     sobe só os N primeiros produtos (útil para um teste rápido)
//   --status=draft entra como rascunho em vez de publicado
//   --so-fotos     pula os produtos e só reenvia fotos que faltam
//
// É IDEMPOTENTE de ponta a ponta: produto casa por `source_album_id` (upsert),
// e foto já presente no bucket é pulada. Rodar de novo depois de uma interrupção
// continua de onde parou, em vez de duplicar ou falhar.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, 'saida');
const FOTOS = path.join(SAIDA, 'fotos');
const BUCKET = 'marketplace-assets';

const arg = (nome, padrao) => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split('=')[1] : padrao;
};
const temFlag = (nome) => process.argv.includes(`--${nome}`);

const projeto = arg('projeto', 'teste');
const limite = Number(arg('limite', 0));
const status = arg('status', 'published');
const soFotos = temFlag('so-fotos');

// --- credenciais -------------------------------------------------------------
// Lidas de .env.local. O projeto mantém DOIS Supabase (produção e teste) e a
// migration/carga precisa rodar nos dois — por isso o alvo é explícito no
// comando, nunca inferido: subir 990 produtos no ambiente errado é caro de desfazer.
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

const log = (...a) => console.error(...a);

// --- preview: os 100 que uma loja sem acesso enxerga -------------------------
// Critério do dono: "os melhores modelos, mais bonitos e mais recentes". Beleza
// não é derivável sem julgamento humano, então o proxy é RECÊNCIA — `source_rank`
// vem do album_id sequencial do Yupoo, e lançamento é o melhor sinal disponível
// de que o modelo está em alta.
//
// A escolha é INTERCALADA por linhagem em vez de simplesmente "os 100 mais novos":
// os mais novos crus dariam uma amostra dominada por duas ou três linhas, e a
// vitrine de venda pareceria um catálogo pobre. Rodízio entre linhagens mostra a
// variedade real do pacote, que é justamente o que se está tentando vender.
function escolherPreview(produtos, quantos = 100) {
  const porLinhagem = new Map();
  for (const p of [...produtos].sort((a, b) => (b.source_rank ?? 0) - (a.source_rank ?? 0))) {
    const chave = `${p.brand}|${p.sole}`;
    if (!porLinhagem.has(chave)) porLinhagem.set(chave, []);
    porLinhagem.get(chave).push(p);
  }
  const filas = [...porLinhagem.values()];
  const escolhidos = [];
  let restam = true;
  while (escolhidos.length < quantos && restam) {
    restam = false;
    for (const f of filas) {
      if (escolhidos.length >= quantos) break;
      const p = f.shift();
      if (p) {
        escolhidos.push(p);
        restam = true;
      }
    }
  }
  return new Set(escolhidos.map((p) => p.source_album_id));
}

// --- carga -------------------------------------------------------------------
const catalogo = JSON.parse(fs.readFileSync(path.join(SAIDA, 'catalogo.json'), 'utf8'));
const recorte = limite > 0 ? catalogo.slice(0, limite) : catalogo;

const linhas = recorte.map((p) => ({
  name: p.nome,
  brand: p.brand,
  brand_other: p.brand_other ?? null,
  sole: p.sole,
  category: 'Chuteira',
  suggested_price: p.preco_sugerido,
  size_min: p.tamanhos.min,
  size_max: p.tamanhos.max,
  status,
  source_seller: p.origem.vendedor,
  source_album_id: p.origem.albumId,
  source_category: p.origem.nomeChines,
  source_rank: Number(p.origem.albumId),
  // Lançamento resolvido no ingest contra data real de mercado (migration 0031).
  // `?? null` porque catálogos gerados antes desta mudança não têm os campos, e mandar
  // `undefined` no JSON some com a chave — o produto ficaria com o valor antigo no banco
  // em vez de ser limpo.
  model_line: p.model_line ?? null,
  model_gen: p.model_gen ?? null,
  launch_date: p.launch_date ?? null,
  is_lancamento: p.is_lancamento ?? false,
}));

const noPreview = escolherPreview(linhas, 100);
linhas.forEach((l) => {
  l.preview = noPreview.has(l.source_album_id);
});

async function upsertProdutos() {
  const LOTE = 100;
  let feitos = 0;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    const r = await fetch(
      `${URL_BASE}/rest/v1/marketplace_products?on_conflict=source_album_id`,
      {
        method: 'POST',
        headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(lote),
      },
    );
    if (!r.ok) {
      log(`! falha no lote ${i}: ${r.status} ${(await r.text()).slice(0, 300)}`);
      process.exit(1);
    }
    feitos += lote.length;
    log(`  produtos ${feitos}/${linhas.length}`);
  }
}

// Mapa source_album_id -> id, necessário para vincular as fotos.
async function mapaIds() {
  const mapa = new Map();
  const LOTE = 1000;
  for (let offset = 0; ; offset += LOTE) {
    const r = await fetch(
      `${URL_BASE}/rest/v1/marketplace_products?select=id,source_album_id&limit=${LOTE}&offset=${offset}`,
      { headers: H },
    );
    const dados = await r.json();
    if (!Array.isArray(dados) || dados.length === 0) break;
    dados.forEach((d) => mapa.set(d.source_album_id, d.id));
    if (dados.length < LOTE) break;
  }
  return mapa;
}

async function jaNoBucket() {
  // Lista o que já está no bucket para não reenviar. A API de storage lista por
  // prefixo, então percorremos por pasta (uma por álbum) só quando necessário —
  // aqui basta um `list` na raiz com limite alto, já que os caminhos são planos.
  const existentes = new Set();
  let offset = 0;
  for (;;) {
    const r = await fetch(`${URL_BASE}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ prefix: '', limit: 1000, offset }),
    });
    if (!r.ok) break;
    const itens = await r.json();
    if (!Array.isArray(itens) || itens.length === 0) break;
    itens.forEach((i) => existentes.add(i.name));
    if (itens.length < 1000) break;
    offset += 1000;
  }
  return existentes;
}

async function subirFotos(mapa) {
  const existentes = await jaNoBucket();
  log(`  já no bucket: ${existentes.size} arquivos`);

  const tarefas = [];
  for (const p of recorte) {
    const idProduto = mapa.get(p.origem.albumId);
    if (!idProduto) continue;
    (p.fotos || []).forEach((arquivo, pos) => {
      tarefas.push({ idProduto, arquivo, pos, albumId: p.origem.albumId });
    });
  }

  let enviadas = 0;
  let puladas = 0;
  let falhas = 0;
  const registros = [];

  const CONC = 8;
  let cursor = 0;
  async function trabalhador() {
    for (;;) {
      const t = tarefas[cursor++];
      if (!t) return;
      registros.push({
        marketplace_product_id: t.idProduto,
        storage_path: t.arquivo,
        position: t.pos,
      });
      if (existentes.has(t.arquivo)) {
        puladas++;
        continue;
      }
      try {
        const corpo = fs.readFileSync(path.join(FOTOS, t.arquivo));
        const r = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${t.arquivo}`, {
          method: 'POST',
          headers: {
            apikey: CHAVE,
            Authorization: `Bearer ${CHAVE}`,
            'Content-Type': 'image/webp',
            // Sem este cabeçalho o Supabase grava `no-cache`, e aí NADA fica guardado: o
            // otimizador do Next repassa `must-revalidate` e o navegador refaz o pedido a
            // cada visita. Foto de acervo não muda e o nome do arquivo já carrega hash, então
            // cachear para sempre é o correto. Vale para o que for enviado daqui em diante —
            // as que já estão lá só pegam o cabeçalho novo se este script rodar de novo.
            'cache-control': 'public, max-age=31536000, immutable',
            'x-upsert': 'true',
          },
          body: corpo,
        });
        if (r.ok) enviadas++;
        else {
          falhas++;
          if (falhas <= 3) log(`  ! ${t.arquivo}: ${r.status} ${(await r.text()).slice(0, 120)}`);
        }
      } catch (e) {
        falhas++;
      }
      if ((enviadas + puladas) % 250 === 0) {
        log(`  fotos ${enviadas + puladas}/${tarefas.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, trabalhador));
  log(`  fotos: ${enviadas} enviadas, ${puladas} já existiam, ${falhas} falhas`);

  // Registros de marketplace_photos, em lote e com upsert pela chave natural.
  const LOTE = 500;
  for (let i = 0; i < registros.length; i += LOTE) {
    const r = await fetch(
      `${URL_BASE}/rest/v1/marketplace_photos?on_conflict=marketplace_product_id,position`,
      {
        method: 'POST',
        headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(registros.slice(i, i + LOTE)),
      },
    );
    if (!r.ok) log(`  ! registro de fotos ${i}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  log(`  registros de foto: ${registros.length}`);
}

// --- execução ----------------------------------------------------------------
log(`projeto: ${projeto}  (${URL_BASE})`);
log(`produtos: ${linhas.length} | status: ${status} | preview: ${noPreview.size}`);

if (!soFotos) await upsertProdutos();
const mapa = await mapaIds();
log(`  ids resolvidos: ${mapa.size}`);
await subirFotos(mapa);

log('\nconcluído.');
