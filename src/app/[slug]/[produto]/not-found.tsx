import { ProductNotFoundContent } from "./product-not-found-content";

/**
 * 404 escopado à rota de detalhe do produto (PED-01/PED-02, D-01). Cobre
 * três casos indistinguíveis por design (Pitfall 8, 05-RESEARCH.md):
 * produto inexistente, não publicado, ou oculto pela regra de esgotado —
 * nenhum deles deve vazar a existência real do produto via mensagem
 * diferenciada.
 *
 * `not-found.tsx` de segmento não recebe `params` (convenção do App
 * Router) — só é alcançado quando a PRÓPRIA loja não existe pelo slug da
 * URL (ver `page.tsx`), caso em que não há slug válido pra linkar de
 * volta mesmo. Por isso o fallback genérico pra raiz ("/"). Quando a loja
 * existe mas o produto não é visível, `page.tsx` renderiza
 * `ProductNotFoundContent` diretamente com `backHref={/${slug}}` em
 * vez de chamar `notFound()` — corrige o gap #10 de `05-VERIFICATION.md`
 * (link "Voltar para a loja" precisa apontar pra loja certa quando ela
 * existe).
 */
export default function ProductNotFound() {
  return <ProductNotFoundContent backHref="/" />;
}
