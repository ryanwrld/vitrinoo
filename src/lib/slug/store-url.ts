const DEFAULT_SITE_ORIGIN = "https://vitrinoo.app";

/**
 * Constrói a URL pública completa da vitrine a partir do slug da loja.
 *
 * Lê `NEXT_PUBLIC_SITE_URL` (opcional — cai no origin literal padrão
 * enquanto o app não estiver hospedado, ver `user_setup` do 02-02-PLAN.md)
 * e sempre remove uma barra final da base configurada para nunca produzir
 * `//loja` no resultado.
 */
export function buildStoreUrl(slug: string): string {
  const configuredBase = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const base = configuredBase && configuredBase.length > 0 ? configuredBase : DEFAULT_SITE_ORIGIN;
  const trimmedBase = base.replace(/\/+$/, "");
  return `${trimmedBase}/loja/${slug}`;
}

/**
 * Constrói a URL pública completa da página de detalhe de um produto
 * (mesma base de `buildStoreUrl`). Usada como link "Foto:" da mensagem de
 * pedido do WhatsApp (05-04) em vez da URL crua do arquivo de imagem no
 * Storage — no iOS, um link `wa.me` cujo `text` termina numa URL que
 * resolve como `image/*` direto dispara o fluxo nativo de "compartilhar
 * como foto" do sistema, pulando a caixa de composição de texto inteira
 * (mensagem pré-formatada nunca chega ao revendedor). Como esta página é
 * HTML com Open Graph (`generateMetadata` em page.tsx), o WhatsApp ainda
 * gera o preview visual da foto (og:image), sem acionar esse desvio —
 * e o revendedor ganha um link de volta pro produto ao vivo, não um
 * arquivo estático.
 */
export function buildProductUrl(slug: string, productId: string): string {
  return `${buildStoreUrl(slug)}/${productId}`;
}
