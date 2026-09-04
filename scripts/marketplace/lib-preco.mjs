// Regra de preço ditada pelo dono (docs/marketplace/02-RESPOSTAS.md, Etapa 3):
// faixa R$400-550; SG é sempre a mais cara; lançamento vende mais caro.
// Vive num módulo próprio porque tanto o `montar` quanto o `renomear` precisam dela —
// se um override corrige o solado, o preço tem de acompanhar.
//
// O QUE ESTE PREÇO É HOJE: uma SUGESTÃO da curadoria, e só. Desde o fluxo de precificação
// quem define o preço do produto é o lojista, por tipo de solado — este número só aparece
// como rede de segurança, quando um solado entra sem preço na regra dele (o `coalesce` da
// migration 0033).
//
// `recente` deixou de ser "terço superior por album_id" e passou a significar LANÇAMENTO
// DE VERDADE: geração atual da linha, conferida contra data real de mercado em
// lancamentos.json. O +40 continua o mesmo; o que mudou é que agora ele cai no par certo.
export function sugerirPreco({ solado, recente }) {
  let p = 430;
  if (solado === 'SG') p += 90;
  else if (solado === 'FG') p += 30;
  else if (solado === 'AG') p += 10;
  if (recente) p += 40;
  return Math.min(550, Math.max(400, p));
}
