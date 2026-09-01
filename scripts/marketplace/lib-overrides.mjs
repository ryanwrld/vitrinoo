// Nomes definidos na mão, por álbum — ver nomes-manuais.json.
// Necessário porque o Yupoo agrupa linhas distintas sob uma categoria só, e nesse caso
// o nome do produto não é derivável de nenhum texto: só olhando a foto.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO = path.join(AQUI, 'nomes-manuais.json');

const bruto = fs.existsSync(ARQUIVO) ? JSON.parse(fs.readFileSync(ARQUIVO, 'utf8')) : {};
export const OVERRIDES = Object.fromEntries(
  Object.entries(bruto).filter(([k]) => !k.startsWith('_')),
);

// Aplica o override ao par (nome, solado). Devolve o par ajustado.
export function aplicarOverride(albumId, nome, sole) {
  const o = OVERRIDES[albumId];
  if (!o) return { nome, sole };
  return { nome: o.nome ?? nome, sole: o.sole ?? sole };
}

// Sufixo de uso, para manter o padrão "<Linha> — <Uso> (<Sigla>)".
// Espelha SOLE_LABELS do app (src/lib/products/constants.ts).
export const USO = {
  FG: 'Campo',
  SG: 'Trava de alumínio',
  AG: 'Grama sintética',
  TF: 'Society',
  IC: 'Futsal',
  MG: 'Multiterreno',
};

// O sufixo de uso é a única parte "estruturada" do nome. Como não há mais separador
// visível, reconhecemos o sufixo pelo próprio texto: <Uso> (<SIGLA>) no fim da string.
const USOS = [...new Set(Object.values(USO))].sort((a, b) => b.length - a.length);
const RE_SUFIXO = new RegExp(`\\s+(?:${USOS.join('|')})\\s+\\([A-Z]{2}\\)$`);

export function comSufixo(nome, sole) {
  if (!sole || RE_SUFIXO.test(nome)) return nome;
  return `${nome} ${USO[sole]} (${sole})`;
}

// Nome do modelo sem o sufixo de uso — usado para agrupar variantes do mesmo modelo.
export function semSufixo(nome) {
  return nome.replace(RE_SUFIXO, '').trim();
}
