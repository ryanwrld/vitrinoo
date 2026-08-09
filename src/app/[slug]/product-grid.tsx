import { ProductCard, type PublicProductCardData } from "./product-card";

/**
 * Grid de produtos publicados da vitrine pública (Server Component).
 *
 * Escala de 3 colunas no celular até 8 a partir de 1280px (decisão do
 * usuário), dentro do container centralizado de 1600px. O número de colunas
 * NÃO é o mesmo em toda tela de propósito: 8 colunas abaixo de 1280px dariam
 * cards de menos de 140px, e abaixo de 768px cards de ~80px — tamanho em que
 * a foto deixa de identificar o modelo da chuteira, que é exatamente o que
 * faz o cliente final abrir o produto e mandar o pedido no WhatsApp.
 *
 * Régua de largura do card, já descontando padding e gaps (o container trava
 * em 1600px — ver page.tsx):
 *   1920px → 8 col ~184px   1280px → 8 col ~140px
 *   1600px → 8 col ~184px   1024px → 6 col ~155px
 *    768px → 5 col ~135px    390px → 3 col ~111px
 */
/**
 * Teto do escalonamento de entrada dos cards. Sem teto, o 40º produto
 * entraria mais de um segundo depois do primeiro e a lista leria como
 * travada, não animada — e é justamente em aparelho fraco no 4G (o público
 * da vitrine) que essa diferença aparece. Do 8º card em diante todos
 * compartilham o mesmo atraso.
 */
const STAGGER_CAP = 8;

export function ProductGrid({
  products,
  slug,
  query,
}: {
  products: PublicProductCardData[];
  slug: string;
  /** Query string atual (filtros/página, sem "produto") — preservada no link de cada card. */
  query: string;
}) {
  return (
    // gap-3 (12px) em TODA a régua, inclusive no desktop (era 16px): com 8
    // colunas o espaço entre cards vira largura disputada — cada 4px a menos
    // de gap devolve ~3,5px de foto por card, e é o que faz o nome do produto
    // caber em vez de truncar em 1280px.
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          slug={slug}
          query={query}
          staggerIndex={Math.min(index, STAGGER_CAP)}
        />
      ))}
    </div>
  );
}
