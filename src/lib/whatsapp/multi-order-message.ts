import { formatBRLPrice } from "@/lib/currency/brl";

/**
 * Mensagem consolidada de "Pedir tudo" (aba Favoritos, 2+ produtos) —
 * template FIXO do sistema, não customizável pelo revendedor (diferente do
 * `message_template` por loja usado em `order-message.ts` para pedido de UM
 * produto): um template de N linhas por produto não cabe nas 4 chaves fixas
 * `{modelo}/{solado}/{tamanho}/{preço}` desenhadas para um item só.
 *
 * Cada linha termina no link da PÁGINA do produto (`buildProductUrl`, HTML
 * com Open Graph) — nunca a URL crua do arquivo no Storage — pelo mesmo
 * motivo do pedido de item único (ver order-message.ts): evita o desvio de
 * "compartilhar como foto" do iOS. Decisão do usuário: o link fica mesmo
 * repetido por item (mensagem mais longa), porque é o link/preview de foto
 * que deixa claro qual variante/cor específica está sendo pedida — texto
 * sozinho não diferencia.
 *
 * `buildWhatsAppUrl` (order-message.ts) é reusado tal qual — o
 * `encodeURIComponent` continua acontecendo UMA ÚNICA VEZ, sobre esta string
 * já composta por inteiro, nunca sobre pedaços separados.
 */
export type MultiOrderMessageItem = {
  /** {modelo} já "dobrado" com a linha, mesma regra de order-message.ts:
   *  `product.line ? \`${name} - ${line}\` : name`. */
  modelo: string;
  tamanho: number;
  price: number;
  productUrl: string;
};

export function buildMultiOrderMessage(items: MultiOrderMessageItem[]): string {
  const lines = items.map((item, index) => {
    const number = index + 1;
    return `${number}) ${item.modelo} - Tamanho ${item.tamanho} - ${formatBRLPrice(item.price)}\n${item.productUrl}`;
  });

  const total = items.reduce((sum, item) => sum + item.price, 0);

  return `Olá! Gostaria de pedir estes modelos:\n\n${lines.join("\n\n")}\n\nTotal: ${formatBRLPrice(total)}`;
}
