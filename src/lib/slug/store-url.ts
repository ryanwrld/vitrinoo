const DEFAULT_SITE_ORIGIN = "https://vitrinoo.app";

/**
 * Constrói a URL pública completa da vitrine a partir do slug da loja.
 *
 * Lê `NEXT_PUBLIC_SITE_URL` (opcional — cai no origin literal padrão
 * enquanto o app não estiver hospedado, ver `user_setup` do 02-02-PLAN.md)
 * e sempre remove uma barra final da base configurada para nunca produzir
 * uma barra dupla no resultado.
 *
 * O slug fica na RAIZ (`vitrinoo.app/rlesportes`), sem o prefixo `/loja`
 * que existia antes: a URL é ditada por voz e digitada à mão pelo cliente
 * final, então cada segmento a menos é um erro de digitação a menos. O que
 * torna isso possível sem colisão é o painel inteiro morar sob `/admin/*` —
 * a raiz é território exclusivo dos slugs de loja.
 */
export function buildStoreUrl(slug: string): string {
  const configuredBase = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const base = configuredBase && configuredBase.length > 0 ? configuredBase : DEFAULT_SITE_ORIGIN;
  const trimmedBase = base.replace(/\/+$/, "");
  return `${trimmedBase}/${slug}`;
}

/**
 * Constrói a URL pública completa do produto — a vitrine da loja com o
 * popup do produto já aberto (`?produto=<id>` sobre `/[slug]`, mesmo
 * mecanismo do clique num card do grid). Não existe mais uma página cheia
 * própria: `/[slug]/[produto]` foi reduzida a um redirect pra esta mesma
 * URL, mantido só pra links antigos já compartilhados. Usada como link
 * "Foto:" da mensagem de pedido do WhatsApp em vez da URL crua do arquivo
 * de imagem no Storage — no iOS, um link `wa.me` cujo `text` termina numa
 * URL que resolve como `image/*` direto dispara o fluxo nativo de
 * "compartilhar como foto" do sistema, pulando a caixa de composição de
 * texto inteira (mensagem pré-formatada nunca chega ao revendedor). Como
 * `/[slug]` é HTML com Open Graph (`generateMetadata` em page.tsx, também
 * cobrindo o caso `?produto=`), o WhatsApp ainda gera o preview visual da
 * foto (og:image) sem acionar esse desvio — e o revendedor ganha um link
 * de volta pra vitrine com o produto aberto, não um arquivo estático.
 */
export function buildProductUrl(slug: string, productId: string): string {
  return `${buildStoreUrl(slug)}?produto=${productId}`;
}
