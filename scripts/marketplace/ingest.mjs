// Ingest do catálogo Yupoo -> catálogo do marketplace Vitrinoo.
// Contexto e decisões: docs/marketplace/00-YUPOO-RECON.md e 02-RESPOSTAS.md
//
//   node scripts/marketplace/ingest.mjs mapear   # 159 categorias -> álbuns   => saida/mapa.json
//   node scripts/marketplace/ingest.mjs montar   # traduz + cura 250 produtos => saida/catalogo.json
//   node scripts/marketplace/ingest.mjs fotos    # baixa/recomprime as fotos  => saida/fotos/
//
// Os passos são separados de propósito: você revisa o JSON antes de baixar 1 byte de imagem.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { traduz } from './lib-traduz.mjs';
import { aplicarOverride, comSufixo, semSufixo } from './lib-overrides.mjs';
import { sugerirPreco } from './lib-preco.mjs';
import { marcaDe } from './lib-marca.mjs';
import { classificarLancamento, geracoesAtuais } from './lib-lancamento.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, 'saida');
const VENDEDOR = process.env.YUPOO_VENDEDOR || 'yhc956848708';
const BASE = `https://${VENDEDOR}.x.yupoo.com`;

// O Yupoo bloqueia hotlink (HTTP 567 sem Referer). Ver recon §4 — isto não é opcional.
const CABECALHOS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  Referer: `${BASE}/`,
};

const ALVO_PRODUTOS = Number(process.env.ALVO_PRODUTOS || 700);
// Solados que entram INTEIROS, fora da cota por rodadas — decisão do dono do produto:
// futsal e SG estavam sub-representados porque a distribuição por rodadas não aprofunda
// em linhas com muito estoque (F50 língua solta SG tem 29 álbuns e só entravam ~7).
const SOLADOS_COMPLETOS = (process.env.SOLADOS_COMPLETOS || 'IC,SG').split(',').filter(Boolean);
// FG é o solado que mais vende, então tem cota própria e prioritária — mas não entra
// inteiro (são 1.263 álbuns, o que estouraria o storage). As escolhidas são as mais
// recentes, por album_id: "lançamento" é o único critério de beleza que dá para derivar
// sem visão. O julgamento estético fica com a curadoria manual.
const COTA_FG = Number(process.env.COTA_FG || 500);
// Categorias que entram inteiras independentemente do solado (pedido explícito do dono).
const CATEGORIAS_COMPLETAS = (process.env.CATEGORIAS_COMPLETAS || 'JOMA').split(',').filter(Boolean);
const FOTOS_POR_PRODUTO = Number(process.env.FOTOS_POR_PRODUTO || 5);
const PAUSA_MS = Number(process.env.PAUSA_MS || 350);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error(...a);

fs.mkdirSync(SAIDA, { recursive: true });

async function baixarHtml(url, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { headers: CABECALHOS, signal: AbortSignal.timeout(25000) });
      if (r.ok) return await r.text();
      if (r.status < 500 && r.status !== 429) return null;
    } catch {
      /* rede instável: tenta de novo */
    }
    await dormir(1500 * (i + 1));
  }
  return null;
}

const desescapar = (s) =>
  s.replace(/&#x3D;/g, '=').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// A ordem dos atributos muda entre vendedores do Yupoo (recon §6): num deles `title` vem antes
// do `href`, noutro depois. Por isso lemos o bloco do card e extraímos cada campo separado —
// e o passo avisa se uma página vier vazia, em vez de gravar um catálogo silenciosamente vazio.
function lerCards(html) {
  const plano = html.replace(/\n/g, ' ');
  const cards = [];
  const re = /class="album__main"([\s\S]{0,1600}?)album__photonumber">(\d+)</g;
  let m;
  while ((m = re.exec(plano))) {
    const bloco = m[1];
    const id = (bloco.match(/href="\/albums\/(\d+)/) || [])[1];
    if (!id) continue;
    cards.push({
      id,
      titulo: desescapar((bloco.match(/title="([^"]*)"/) || [, ''])[1]).trim(),
      fotos: Number(m[2]),
    });
  }
  return cards;
}

async function paginar(caminho, rotulo) {
  const achados = new Map();
  for (let pagina = 1; pagina <= 60; pagina++) {
    const sep = caminho.includes('?') ? '&' : '?';
    const html = await baixarHtml(`${BASE}${caminho}${sep}page=${pagina}`);
    if (!html) break;
    const cards = lerCards(html);
    if (pagina === 1 && cards.length === 0) {
      log(`  ! ${rotulo}: página 1 sem álbuns — layout mudou? pulando`);
      break;
    }
    if (cards.length === 0) break;
    cards.forEach((c) => achados.set(c.id, c));
    if (cards.length < 100) break; // última página
    await dormir(PAUSA_MS);
  }
  return [...achados.values()];
}

// ---------------------------------------------------------------- passo 1: mapear
async function mapear() {
  const categorias = JSON.parse(
    fs.readFileSync(path.join(AQUI, 'categorias-yupoo.json'), 'utf8'),
  ); // [[nomeChines, id], ...]

  const mapa = [];
  for (const [nomeChines, catId] of categorias) {
    const t = traduz(nomeChines);
    if (t.descarta) {
      log(`✗ ${nomeChines} — descartada (${t.motivo})`);
      continue;
    }
    const albuns = await paginar(`/categories/${catId}`, nomeChines);
    log(`✓ ${nomeChines} → ${t.nome || '(revisar)'} — ${albuns.length} álbuns`);
    mapa.push({
      catId,
      nomeChines,
      nome: t.nome ?? null,
      solado: t.sol ?? null,
      revisar: !!t.revisar,
      albuns,
    });
    await dormir(PAUSA_MS);
  }

  const total = mapa.reduce((s, c) => s + c.albuns.length, 0);
  fs.writeFileSync(path.join(SAIDA, 'mapa.json'), JSON.stringify(mapa, null, 1));
  log(`\n=> saida/mapa.json — ${mapa.length} categorias, ${total} álbuns`);
}

// ---------------------------------------------------------------- passo 2: montar
// Linhas descontinuadas. A recência por album_id só ordena DENTRO da linhagem: sem esta lista,
// o mais recente de uma linha morta ainda entra e contraria o veto a "modelo velho".
// Verificado no catálogo real: 27% dos 250 vinham daqui (ex.: Phantom GT, de 2022).
const FORA_DE_LINHA = [
  'Phantom GT', 'CTR360', 'R9', 'Total 90', 'Magista', 'Hypervenom',
  'Mercurial 10', 'Mercurial 14', 'Predator 21', 'Predator 23', 'X Speedportal 23', 'X23',
];
// 复刻 = "retrô": remake de modelo antigo. Cai no mesmo veto de modelo velho.
const EH_RETRO = /retrô/i;

const combina = (nome, lista) =>
  lista.some((l) => nome.startsWith(l + ' ') || nome === l || nome.startsWith(l + '.'));
// Faixas abaixo da elite, marcadas pelo próprio fornecedor no nome da categoria:
//   次顶级 "quase topo" · 中端 intermediária · 普通 comum · 网布/网格 tela (cabedal de malha barata)
//   太空 "space" · 超轻版 superleve — identificadas pelos vetos manuais do dono: 6 dos 11
//   produtos que ele reprovou na curadoria vinham dessas duas faixas.
// O dono do produto quer elite em todas as marcas, linhas e solados.
const NAO_ELITE = /linha 2|intermediária|básica|\btela\b|\bSpace\b|superleve/;

const estaForaDeLinha = (nome) => combina(nome, FORA_DE_LINHA);

const GRADE = /(\d{2})\s*[-–~至]\s*(\d{2})/;

function montar() {
  const mapa = JSON.parse(fs.readFileSync(path.join(SAIDA, 'mapa.json'), 'utf8'));

  // Cada álbum dentro de uma categoria é uma COR do mesmo modelo. Para "não repetir modelo"
  // (decisão do dono), pegamos os mais recentes de cada linhagem em vez de varrer tudo.
  // Recência sai do próprio album_id, que é sequencial e crescente no Yupoo (recon §8).
  const candidatos = [];
  let descartadasPorIdade = 0;
  let descartadasPorFaixa = 0;
  for (const cat of mapa) {
    // Retraduz a partir do chinês em vez de confiar no nome gravado em mapa.json:
    // o mapa guarda dado bruto da raspagem, e correções no dicionário precisam valer
    // sem exigir uma nova varredura de 159 categorias.
    const t = traduz(cat.nomeChines);
    cat.nome = t.nome ?? null;
    cat.solado = t.sol ?? null;
    if (!cat.nome) continue;
    if (estaForaDeLinha(cat.nome) || EH_RETRO.test(cat.nome)) { descartadasPorIdade += cat.albuns.length; continue; }
    if (NAO_ELITE.test(cat.nome)) { descartadasPorFaixa += cat.albuns.length; continue; }
    const ordenados = [...cat.albuns].sort((a, b) => Number(b.id) - Number(a.id));
    ordenados.forEach((al, posicao) => {
      const g = al.titulo.match(GRADE);
      candidatos.push({
        albumId: al.id,
        catId: cat.catId,
        nomeChines: cat.nomeChines,
        nome: cat.nome,
        solado: cat.solado,
        qtdFotos: al.fotos,
        tamanhoMin: g ? Number(g[1]) : null,
        tamanhoMax: g ? Number(g[2]) : null,
        posicaoNaLinhagem: posicao, // 0 = a mais recente daquela linhagem
      });
    });
  }

  // Futsal (IC) entra por inteiro, antes das rodadas — o dono quis a quadra completa.
  const escolhidos = [];
  const jaEscolhido = new Set();
  for (const alvo of CATEGORIAS_COMPLETAS) {
    const antes = escolhidos.length;
    for (const c of candidatos) {
      if (c.nomeChines !== alvo || jaEscolhido.has(c.albumId)) continue;
      escolhidos.push(c);
      jaEscolhido.add(c.albumId);
    }
    log(`   categoria ${alvo} incluída por inteiro: ${escolhidos.length - antes}`);
  }

  {
    const antes = escolhidos.length;
    const fg = candidatos
      .filter((c) => c.solado === 'FG' && !jaEscolhido.has(c.albumId))
      .sort((a, b) => Number(b.albumId) - Number(a.albumId))
      .slice(0, COTA_FG);
    fg.forEach((c) => { escolhidos.push(c); jaEscolhido.add(c.albumId); });
    log(`   FG (mais recentes, prioritário): ${escolhidos.length - antes}`);
  }

  for (const solado of SOLADOS_COMPLETOS) {
    const antes = escolhidos.length;
    for (const c of candidatos) {
      if (c.solado !== solado || jaEscolhido.has(c.albumId)) continue;
      escolhidos.push(c);
      jaEscolhido.add(c.albumId);
    }
    log(`   ${solado} incluído por inteiro: ${escolhidos.length - antes}`);
  }

  // Distribuição por rodadas: 1 de cada linhagem, depois a 2ª de cada, e assim por diante.
  // Aprofundar as rodadas é o que traz mais variação de cor do mesmo modelo.
  for (let rodada = 0; escolhidos.length < ALVO_PRODUTOS && rodada < 200; rodada++) {
    const daRodada = candidatos
      .filter((c) => c.posicaoNaLinhagem === rodada)
      .sort((a, b) => Number(b.albumId) - Number(a.albumId));
    if (daRodada.length === 0) break;
    for (const c of daRodada) {
      if (escolhidos.length >= ALVO_PRODUTOS) break;
      if (jaEscolhido.has(c.albumId)) continue;
      escolhidos.push(c);
      jaEscolhido.add(c.albumId);
    }
  }

  // Regra do dono: em chuteira de campo, sempre mais FG do que AG. Corta o excedente de AG
  // por modelo, em vez de mexer no total — os slots liberados voltam pelas rodadas seguintes.
  const modeloDe = (n) => semSufixo(n);
  const contaFG = {};
  escolhidos.forEach((c) => {
    if (c.solado === 'FG') contaFG[modeloDe(c.nome)] = (contaFG[modeloDe(c.nome)] || 0) + 1;
  });
  const usoAG = {};
  const podados = escolhidos.filter((c) => {
    if (c.solado !== 'AG') return true;
    const m = modeloDe(c.nome);
    usoAG[m] = (usoAG[m] || 0) + 1;
    return usoAG[m] <= Math.max(0, (contaFG[m] || 0) - 1);
  });
  const cortadosAG = escolhidos.length - podados.length;
  escolhidos.length = 0;
  escolhidos.push(...podados);
  if (cortadosAG) log(`   AG podados para ficarem abaixo de FG: ${cortadosAG}`);

  // LANÇAMENTO vem de data real de mercado (lancamentos.json), nunca mais do album_id.
  //
  // A régua antiga era "terço superior por album_id entre os escolhidos", e ela respondia a
  // pergunta errada: album_id diz quando o FORNECEDOR subiu a foto. Um retrô fotografado
  // ontem entrava como lançamento e levava +R$40 no preço sugerido. Vetada pelo dono em
  // 2026-09-01: sem hipótese, só data de lançamento oficial com fonte anotada.
  //
  // Depende do NOME FINAL (já traduzido, já com override aplicado), então a classificação
  // acontece dentro do map, depois de `nomeFinal` existir — e não antes, num passo próprio.
  log(`   lançamento: geração atual de cada linha -> ${geracoesAtuais().join(', ')}`);

  const produtos = escolhidos.map((c) => {
    // Override manual antes do preço: o solado corrigido precisa valer na regra de preço.
    const aj = aplicarOverride(c.albumId, c.nome, c.solado);
    const nomeFinal = comSufixo(aj.nome, aj.sole);
    const m = marcaDe(nomeFinal);
    const lanc = classificarLancamento(nomeFinal);
    const recente = lanc.lancamento;
    return {
      origem: { vendedor: VENDEDOR, albumId: c.albumId, catId: c.catId, nomeChines: c.nomeChines },
      nome: nomeFinal,
      brand: m.brand,
      brand_other: m.brandOther,
      sole: aj.sole ?? null,
      fulfillment: 'importado', // vitrine: "Importado direto da fábrica (Prazo: 7-25 dias)"
      preco_sugerido: sugerirPreco({ solado: aj.sole, recente }),
      recente,
      // Vai para as colunas homônimas de marketplace_products (migration 0031). O motivo
      // não sobe para o banco: serve ao relatório de curadoria, não à aplicação.
      model_line: lanc.linha,
      model_gen: lanc.ger,
      launch_date: lanc.data,
      is_lancamento: lanc.lancamento,
      tamanhos: { min: c.tamanhoMin, max: c.tamanhoMax },
      qtd_fotos_origem: c.qtdFotos,
      // Sem descrição, por decisão do dono do produto.
    };
  });

  fs.writeFileSync(path.join(SAIDA, 'catalogo.json'), JSON.stringify(produtos, null, 1));

  const porLinha = {};
  produtos.forEach((p) => {
    const chave = semSufixo(p.nome);
    porLinha[chave] = (porLinha[chave] || 0) + 1;
  });
  const semGrade = produtos.filter((p) => !p.tamanhos.min).length;
  const abaixoDe36 = produtos.filter((p) => p.tamanhos.min && p.tamanhos.min < 36).length;

  log(`=> saida/catalogo.json — ${produtos.length} produtos`);
  log(`   álbuns ignorados por linha fora de linha: ${descartadasPorIdade}`);
  log(`   álbuns ignorados por não serem linha elite: ${descartadasPorFaixa}`);
  log(`   linhagens distintas: ${Object.keys(porLinha).length}`);
  log(`   sem grade de tamanho no título: ${semGrade}`);
  log(`   com numeração abaixo de 36 (exige a migration do tamanho 35): ${abaixoDe36}`);
  log(`   fotos a baixar: ${produtos.length * FOTOS_POR_PRODUTO}`);
}

// ---------------------------------------------------------------- passo 3: fotos
async function fotos() {
  // Dois jobs `fotos` simultâneos escrevem o mesmo catalogo.json no fim, e o que termina
  // por último vence — foi assim que um catálogo já corrigido voltou para a versão anterior.
  const trava = path.join(SAIDA, '.fotos.lock');
  if (fs.existsSync(trava)) {
    const dono = fs.readFileSync(trava, 'utf8').trim();
    log(`! já existe um passo "fotos" em andamento (pid ${dono}). Aborte-o ou apague ${trava}.`);
    process.exit(1);
  }
  fs.writeFileSync(trava, String(process.pid));
  const soltarTrava = () => { try { fs.unlinkSync(trava); } catch {} };
  process.on('exit', soltarTrava);
  process.on('SIGINT', () => { soltarTrava(); process.exit(130); });
  process.on('SIGTERM', () => { soltarTrava(); process.exit(143); });

  const { default: sharp } = await import('sharp');
  const produtos = JSON.parse(fs.readFileSync(path.join(SAIDA, 'catalogo.json'), 'utf8'));
  const destino = path.join(SAIDA, 'fotos');
  fs.mkdirSync(destino, { recursive: true });

  let baixadas = 0;
  let falhas = 0;
  let bytes = 0;
  let semCapa = 0;

  for (const [i, p] of produtos.entries()) {
    const html = await baixarHtml(`${BASE}/albums/${p.origem.albumId}?uid=1`);
    if (!html) {
      falhas++;
      continue;
    }

    // O vendedor escolhe uma CAPA no Yupoo, e ela é quase sempre a lateral — o ângulo que
    // vende. Ela não é a primeira foto do álbum: no álbum testado era a 6ª, fora de um corte
    // de 5. Por isso a capa entra em primeiro lugar, e o resto segue a ordem do vendedor.
    const capaHash = (html.match(/showalbumheader__gallerycover[\s\S]{0,400}?photo\.yupoo\.com\/[^/]+\/([a-f0-9]+)\//) || [])[1];

    // data-src repete o mesmo arquivo em big/square/medium — deduplica pelo hash.
    const porHash = new Map();
    for (const m of html.matchAll(/data-src="(https:\/\/photo\.yupoo\.com\/[^/"]+\/([a-f0-9]+)\/[^"]+)"/g)) {
      if (!porHash.has(m[2])) porHash.set(m[2], m[1].replace(/\/(square|medium|small)\.(\w+)$/, '/big.$2'));
    }

    const ordemOriginal = [...porHash.keys()];

    // Migração dos arquivos da primeira rodada, que eram nomeados por posição.
    // A posição N correspondia ao N-ésimo hash na ordem do DOM — renomear evita
    // rebaixar ~1.000 fotos que já estão corretas em disco.
    ordemOriginal.forEach((hash, idx) => {
      const antigo = path.join(destino, `${p.origem.albumId}-${idx + 1}.webp`);
      const novo = path.join(destino, `${p.origem.albumId}-${hash}.webp`);
      if (fs.existsSync(antigo) && !fs.existsSync(novo)) fs.renameSync(antigo, novo);
    });

    // Sequência fixa deste fornecedor, verificada em 4 álbuns (todos com 6 fotos):
    //   1 vista de cima · 2 solado · 3 traseira · 4 lateral interna
    //   5 vista de cima de lado  ← ângulo rejeitado pelo dono do produto
    //   6 lateral externa        ← a capa escolhida pelo vendedor
    // A capa é sempre a ÚLTIMA foto, e o ângulo indesejado o imediatamente anterior a ela.
    // Usamos essa relação, e não um índice fixo, para aguentar álbuns de tamanho diferente.
    let ordem = [...ordemOriginal];
    let capa = capaHash;

    if (capa && ordem.includes(capa)) {
      const iCapa = ordem.indexOf(capa);
      if (iCapa > 0) ordem.splice(iCapa - 1, 1); // fora a "vista de cima de lado"
      ordem = ordem.filter((h) => h !== capa);
    } else if (capa) {
      // capa não está entre as fotos listadas: baixa mesmo assim
      porHash.set(capa, `https://photo.yupoo.com/${VENDEDOR}/${capa}/big.jpg`);
    } else {
      // sem capa declarada: mantém a ordem do vendedor e sinaliza para revisão manual
      semCapa++;
    }

    if (capa) ordem.unshift(capa); // lateral externa sempre primeiro

    const escolhidas = ordem.slice(0, FOTOS_POR_PRODUTO);

    p.fotos = [];
    p.capa_do_vendedor = !!capaHash;
    for (const hash of escolhidas) {
      // Nome por hash, não por posição: reordenar a curadoria não invalida o que já foi baixado.
      const arquivo = `${p.origem.albumId}-${hash}.webp`;
      const caminho = path.join(destino, arquivo);
      if (fs.existsSync(caminho)) {
        p.fotos.push(arquivo);
        continue;
      }
      try {
        const r = await fetch(porHash.get(hash), { headers: CABECALHOS, signal: AbortSignal.timeout(30000) });
        if (!r.ok) { falhas++; continue; }
        const bruto = Buffer.from(await r.arrayBuffer());
        // EXIF com GPS do fornecedor (recon §5): o sharp descarta metadado por padrão,
        // e o .rotate() aplica a orientação antes disso.
        const webp = await sharp(bruto).rotate().resize(1080, 1080, { fit: 'inside' })
          .webp({ quality: 82 }).toBuffer();
        fs.writeFileSync(caminho, webp);
        p.fotos.push(arquivo);
        baixadas++;
        bytes += webp.length;
      } catch { falhas++; }
    }
    if ((i + 1) % 10 === 0) log(`  ${i + 1}/${produtos.length} produtos — ${baixadas} fotos`);
    await dormir(PAUSA_MS);
  }

  fs.writeFileSync(path.join(SAIDA, 'catalogo.json'), JSON.stringify(produtos, null, 1));
  log(`\n=> saida/fotos/ — ${baixadas} fotos, ${(bytes / 1048576).toFixed(1)} MB, ${falhas} falhas`);
  log(`   álbuns sem capa declarada pelo vendedor: ${semCapa}`);
}

const passo = process.argv[2];
const passos = { mapear, montar, fotos };
if (!passos[passo]) {
  console.error('uso: node ingest.mjs <mapear|montar|fotos>');
  process.exit(1);
}
await passos[passo]();
