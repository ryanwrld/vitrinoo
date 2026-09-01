// Marca do produto, derivada da linha. Alimenta `products.brand`, que é `not null`
// e move o filtro de marca da vitrine pública.
//
// A neutralidade que o dono definiu vale para o CATÁLOGO GLOBAL (do Vitrinoo), que não
// afirma fabricante. Mas o produto importado passa a ser do lojista, e quem publica
// "Nike" é ele — como já faz no Instagram hoje. Sem isso, o filtro de marca ficaria
// inútil, e metade dos clientes finais chega buscando justamente por marca.
//
// Os valores precisam bater com BRANDS de src/lib/products/constants.ts.

const REGRAS = [
  [/^(Mercurial|Phantom|Tiempo Legend|Nike |T90|Total 90|Hypervenom|Magista)/i, 'Nike'],
  [/^(Predator|F50|X ?\d|X Speedportal|Copa|\d{4} Copa|adidas)/i, 'Adidas'],
  [/^Puma/i, 'Puma'],
  [/^Mizuno/i, 'Mizuno'],
  [/^New Balance/i, 'New Balance'],
];

// Marcas fora da lista fixa do app entram como "Outra" + texto livre em brand_other.
// Kappa NÃO entra aqui: a categoria 卡帕经典 do fornecedor está mal rotulada e os
// produtos são adidas (verificado nas fotos). O nome já sai como "Adidas Clássica",
// então cai na regra de Adidas acima.
const OUTRAS = [
  [/^Joma/i, 'Joma'],
  [/^Asics/i, 'Asics'],
  [/^Kelme/i, 'Kelme'],
];

export function marcaDe(nome) {
  for (const [re, marca] of REGRAS) if (re.test(nome)) return { brand: marca, brandOther: null };
  for (const [re, nomeMarca] of OUTRAS) if (re.test(nome)) return { brand: 'Outra', brandOther: nomeMarca };
  return { brand: 'Outra', brandOther: null };
}
