import { ProductCard, type PublicProductCardData } from "./product-card";

/**
 * Grid de produtos publicados da vitrine pública (Server Component). Grid
 * responsivo mobile-first (2 colunas no mobile, 3 no tablet, 4 no desktop) —
 * layout exato não foi travado em CONTEXT.md (Claude's Discretion), seguindo
 * os tokens visuais do PROJECT.md e o espaçamento já usado no painel admin.
 */
export function ProductGrid({ products, slug }: { products: PublicProductCardData[]; slug: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} slug={slug} />
      ))}
    </div>
  );
}
