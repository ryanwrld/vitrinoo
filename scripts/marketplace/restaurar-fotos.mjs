// Restaura saida/fotos/ e o campo `fotos` do catálogo a partir do Supabase.
//
//   node scripts/marketplace/restaurar-fotos.mjs [--projeto=prod|teste] [--so-indice]
//
// Existe porque o Supabase passa a ser a cópia autoritativa depois do upload: se
// o acervo local se perder (foi o que aconteceu ao rodar `limpar.mjs` na janela
// em que o catálogo estava sem o campo `fotos`), baixar de lá é mais rápido e
// mais seguro do que raspar o Yupoo de novo — são os MESMOS arquivos já
// recomprimidos, sem risco de o fornecedor ter mudado alguma coisa no meio.
//
// `--so-indice` reconstrói apenas o vínculo produto→fotos no catalogo.json, sem
// baixar arquivo nenhum. É o suficiente quando as imagens já estão publicadas e
// só o JSON local ficou para trás.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, 'saida');
const FOTOS = path.join(SAIDA, 'fotos');
const BUCKET = 'marketplace-assets';

const arg = (n, p) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? p;
const projeto = arg('projeto', 'prod');
const soIndice = process.argv.includes('--so-indice');

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

fs.mkdirSync(FOTOS, { recursive: true });

// Mapa album_id -> [arquivos em ordem], direto do banco: é a fonte autoritativa
// da ORDEM, que o nome do arquivo sozinho não carrega.
const porAlbum = new Map();
for (let offset = 0; ; offset += 1000) {
  const r = await fetch(
    `${URL_BASE}/rest/v1/marketplace_products?select=source_album_id,marketplace_photos(storage_path,position)&limit=1000&offset=${offset}`,
    { headers: H },
  );
  const dados = await r.json();
  if (!Array.isArray(dados) || dados.length === 0) break;
  for (const d of dados) {
    const fotos = (d.marketplace_photos ?? [])
      .sort((a, b) => a.position - b.position)
      .map((f) => f.storage_path);
    porAlbum.set(d.source_album_id, fotos);
  }
  if (dados.length < 1000) break;
}
log(`índice: ${porAlbum.size} produtos no Supabase`);

// Reescreve o catálogo local com o vínculo correto.
const arquivoCatalogo = path.join(SAIDA, 'catalogo.json');
const catalogo = JSON.parse(fs.readFileSync(arquivoCatalogo, 'utf8'));
let semCorrespondencia = 0;
for (const p of catalogo) {
  const fotos = porAlbum.get(p.origem.albumId);
  if (!fotos) {
    semCorrespondencia++;
    continue;
  }
  p.fotos = fotos;
  p.capa_do_vendedor = true;
}
fs.writeFileSync(arquivoCatalogo, JSON.stringify(catalogo, null, 1));
log(`catalogo.json atualizado — ${catalogo.length - semCorrespondencia}/${catalogo.length} com fotos`);
if (semCorrespondencia) log(`  ! ${semCorrespondencia} produtos sem correspondência no Supabase`);

if (soIndice) {
  log('\n--so-indice: nenhum arquivo baixado.');
  process.exit(0);
}

// Baixa o que falta em disco, em paralelo. URL pública: o bucket é público, então
// nem precisa de credencial aqui.
const alvos = [...new Set(catalogo.flatMap((p) => p.fotos ?? []))];
const existentes = new Set(fs.readdirSync(FOTOS));
const faltando = alvos.filter((a) => !existentes.has(a));
log(`arquivos: ${alvos.length} no total, ${faltando.length} a baixar`);

let baixados = 0;
let falhas = 0;
let cursor = 0;
async function trabalhador() {
  for (;;) {
    const nome = faltando[cursor++];
    if (!nome) return;
    try {
      const r = await fetch(`${URL_BASE}/storage/v1/object/public/${BUCKET}/${nome}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) {
        falhas++;
        continue;
      }
      fs.writeFileSync(path.join(FOTOS, nome), Buffer.from(await r.arrayBuffer()));
      baixados++;
      if (baixados % 250 === 0) log(`  ${baixados}/${faltando.length}`);
    } catch {
      falhas++;
    }
  }
}
await Promise.all(Array.from({ length: 10 }, trabalhador));
log(`\n=> ${baixados} baixados, ${falhas} falhas`);
