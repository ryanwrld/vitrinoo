// Dicionário chinês → português de revendedor brasileiro.
// Fonte e racional: docs/marketplace/03-NOMENCLATURA.md
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));

// ---- linhas / marcas (apelido chinês -> nome de mercado no Brasil) ----
const LINHA = [
  [/^刺客\s*([\d.]+)/, (g,n)=>({linha:'Mercurial', ger:g})],
  [/^猎鹰复刻/, ()=>({linha:'Predator', tag:'Retrô'})],
  [/^猎鹰\s*([\d.+]+)/, g=>({linha:'Predator', ger:g})],
  [/^传奇\s*([\d.]+)/, g=>({linha:'Tiempo Legend', ger:g})],
  [/^GX(\d)/, g=>({linha:'Phantom GX', ger:{1:'I',2:'II',3:'III'}[g]||g})],
  [/^鬼牌\s*([\d.]*)/, g=>({linha:'Phantom', ger:g})],
  [/^毒蜂/, ()=>({linha:'Hypervenom'})],
  [/^月煞/, ()=>({linha:'Magista'})],
  [/^F\s*50/i, ()=>({linha:'F50'})],
  [/^X\s*([\d.+]+)/, g=>({linha:'X Speedportal', ger:g})],
  [/^T90/, ()=>({linha:'Total 90'})],
  [/^GT(\d?)/, g=>({linha:'Phantom GT', ger:g || ''})], // GT = Phantom GT (传奇 é que é Tiempo)
  [/^GX\s*(\d?)/, g=>({linha:'Phantom GX', ger:{'1':'I','2':'II','3':'III'}[g]||''})],
  [/^美津浓阿尔法/, ()=>({linha:'Mizuno Alpha'})],
  [/^美津浓/, ()=>({linha:'Mizuno Morelia'})],
  [/^彪马|^Puma/i, ()=>({linha:'Puma', manterResto:true})],
  // 卡帕 traduz como "Kappa", mas o fornecedor rotulou errado: as fotos desta categoria
  // mostram claramente as três listras — são adidas clássicas de couro (Copa Mundial,
  // adipure, Predator Mania). Verificado nas 7 fotos em 2026-08-24.
  [/^卡帕经典/, ()=>({linha:'Adidas Clássica'})],
  [/^新百伦/, ()=>({linha:'New Balance'})],
  [/^亚瑟士/, ()=>({linha:'Asics'})],
  [/^Adidas\s*sala/i, ()=>({linha:'adidas Sala'})],
  [/^JOMA/i, ()=>({linha:'Joma'})],
];

// ---- construção (linguagem de revendedor BR) ----
const CONSTR = [
  [/低帮针织平底/, 'cano baixo em malha'],
  [/低帮针织/, 'cano baixo em malha'],
  [/高帮针织|高针织|代高帮针织/, 'cano alto em malha'],
  [/针织低/, 'cano baixo em malha'],
  [/针织有鞋带/, 'malha com cadarço'],
  [/针织/, 'malha'],
  [/梭织/, 'tecido'],
  [/网布|网格/, 'tela'],
  [/高帮/, 'cano alto'],
  [/低帮/, 'cano baixo'],
  [/无鞋带/, 'sem cadarço'],
  [/盖帽/, 'com aba'],
  [/翻盖/, 'aba dobrável'],
  [/开舌/, 'língua solta'],
  [/气垫/, 'com amortecimento'],
  [/超轻版|超轻/, 'superleve'],
  [/复刻/, 'retrô'],
  [/中端/, 'intermediária'],
  [/次顶级/, 'linha 2'],
  [/普通/, 'básica'],
  [/太空/, 'Space'],
  [/周年/, 'edição comemorativa'],
  [/特别版/, 'edição especial'],
  [/电镀/, 'cromada'],
  [/梅西/, 'Messi'],
  [/一代/, '1ª geração'],
];

// ---- solado -> como o brasileiro chama ----
// Vocabulário ALINHADO ao SOLE_LABELS do app (src/lib/products/constants.ts):
// o nome do produto e o filtro da vitrine precisam falar a mesma língua.
// MD não existe em SOLES do app — é tratado como MG (o mais próximo), para o
// catálogo nunca produzir um solado que o app não aceita.
const SOLADO = {
  FG: ['Campo', 'FG'],
  SG: ['Trava de alumínio', 'SG'],
  AG: ['Grama sintética', 'AG'],
  TF: ['Society', 'TF'],
  IC: ['Futsal', 'IC'],
  MG: ['Multiterreno', 'MG'],
  MD: ['Multiterreno', 'MG'],
};

const RUIDO = /拖鞋|橄榄球鞋|田径钉鞋|袋子|未分类相册|儿童鞋/;

export function traduz(nome) {
  if (RUIDO.test(nome)) return { descarta: true, motivo: nome.match(RUIDO)[0] };
  let base = null;
  for (const [re, fn] of LINHA) { const m = nome.match(re); if (m) { base = fn(m[1]); break; } }

  // Nome já em alfabeto latino (ex.: "Nike Streetgato IC", "Puma FUTURE 7 ULTIMATE TF"):
  // passa direto, só normaliza caixa e traduz o solado. Não force o dicionário chinês nele.
  const han = (nome.match(/[\u4e00-\u9fff]/g) || []).length;
  if (han === 0) {
    const solL = (nome.match(/\b(FG|AG|SG|TF|IC|MD|MG)\b/) || [])[1];
    const corpo = nome.replace(/\b(FG|AG|SG|TF|IC|MD|MG)\b/, '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\b([A-ZÀ-Ú]{3,})\b/g, w => w[0] + w.slice(1).toLowerCase());
    return { nome: corpo + (solL ? ` ${SOLADO[solL][0]} (${SOLADO[solL][1]})` : ''), sol: solL === 'MD' ? 'MG' : solL, latino: true };
  }
  if (!base) return { revisar: true };

  const partes = [];
  let restante = nome;
  for (const [re, pt] of CONSTR) {
    const m = restante.match(re);
    if (m && !partes.includes(pt)) { partes.push(pt); restante = restante.replace(m[0], ''); }
  }

  let sol = (nome.match(/\b(FG|AG|SG|TF|IC|MD|MG)\b/) || [])[1];
  if (!sol && /平底/.test(nome)) sol = 'IC';
  if (!sol && /碎钉|碎丁/.test(nome)) sol = 'TF';

  // linhas cujo modelo vem escrito em latino logo após o apelido chinês (Puma Ultra5, Future 7…)
  let extra = '';
  if (base.manterResto) {
    extra = nome.replace(/^彪马|^Puma/i, '').replace(/\b(FG|AG|SG|TF|IC|MD|MG)\b/, '')
      // qualquer token chinês restante já foi capturado em CONSTR; não pode vazar pro nome
      .replace(/[\u4e00-\u9fff]+/g, '')
      .trim().replace(/\s+/g, ' ')
      .replace(/\b([A-ZÀ-Ú]{3,})\b/g, w => w[0] + w.slice(1).toLowerCase());
  }
  // Como o revendedor brasileiro realmente fala: Mercurial de cano alto é Superfly,
  // de cano baixo é Vapor. Ninguém anuncia "Mercurial cano alto" no Instagram.
  if (base.linha === 'Mercurial') {
    if (/高帮|高针织/.test(nome)) base.linha = 'Mercurial Superfly';
    else if (/低帮/.test(nome)) base.linha = 'Mercurial Vapor';
  }
  const cabeca = [base.linha, extra, base.ger, base.tag].filter(Boolean).join(' ');
  // "cano alto/baixo" fica no nome mesmo em Superfly/Vapor: o revendedor brasileiro
  // usa os dois termos, e a redundância ajuda quem não conhece a nomenclatura da Nike.
  // base.tag já pode carregar "Retrô" (vindo de 猎鹰复刻); o CONSTR também traduz
  // 复刻 como "retrô", e sem este filtro o nome sai "Predator Retrô retrô".
  const semRepetirTag = base.tag
    ? partes.filter((p) => p.toLowerCase() !== base.tag.toLowerCase())
    : partes;
  const meio = [...new Set(semRepetirTag)].slice(0, 2).join(' ');
  const cauda = sol ? ` ${SOLADO[sol][0]} (${SOLADO[sol][1]})` : '';
  return { nome: (cabeca + (meio ? ' ' + meio : '') + cauda).replace(/\s+/g, ' ').trim(), sol: sol === 'MD' ? 'MG' : sol };
}


export { SOLADO, RUIDO, LINHA, CONSTR };
