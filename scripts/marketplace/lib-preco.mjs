// Regra de preço ditada pelo dono (docs/marketplace/02-RESPOSTAS.md, Etapa 3):
// faixa R$400-550; SG é sempre a mais cara; lançamento recente vende mais caro.
// Vive num módulo próprio porque tanto o `montar` quanto o `renomear` precisam dela —
// se um override corrige o solado, o preço tem de acompanhar.
export function sugerirPreco({ solado, recente }) {
  let p = 430;
  if (solado === 'SG') p += 90;
  else if (solado === 'FG') p += 30;
  else if (solado === 'AG') p += 10;
  if (recente) p += 40;
  return Math.min(550, Math.max(400, p));
}
