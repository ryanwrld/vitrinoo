"use client";

import { startTransition, useEffect } from "react";
import { usePathname } from "next/navigation";
import { logPageview } from "@/lib/products/pageview-actions";
import { resolveVisitorId } from "@/lib/analytics/visitor-id";

/**
 * Tracker de visita à LOJA, montado uma única vez por `layout.tsx` da
 * vitrine. Responsabilidade estreita de propósito: registrar que alguém
 * abriu uma página da vitrine. A visita a um PRODUTO é registrada por
 * `product-view-tracker.tsx`, montado em `page.tsx` — ver abaixo o porquê
 * da separação.
 *
 * A dependência do efeito é `pathname` e SOMENTE ele — `usePathname()`
 * exclui a query string por definição, o que garante que trocar filtro,
 * busca ou ordenação (mesma pathname, query diferente) não dispara um
 * pageview novo (D-02).
 *
 * POR QUE O PRODUTO NÃO É RESOLVIDO AQUI: tentei ler `?produto=` com
 * `useSearchParams()` neste componente e o valor chegava sempre nulo.
 * Layouts NÃO re-renderizam em navegação que muda apenas a query string,
 * então um `useSearchParams()` daqui devolve valor obsoleto — o log do
 * servidor mostrava `GET /rlesportes?produto=<id>` chegando e, na mesma
 * navegação, `logPageview(store, null, visitor)`. É exatamente por isso
 * que o id do produto precisa vir como PROP, de um Server Component que
 * recebe `searchParams` de verdade.
 *
 * O caso `/{slug}/{id}` (página cheia, link compartilhado no WhatsApp)
 * continua resolvido aqui pelo pathname, que é reativo em layout — e ali
 * `product-view-tracker` não é montado, então nunca há linha duplicada.
 *
 * Disparo em `useEffect` (client-side), nunca no corpo de um Server
 * Component: crawlers de unfurling (WhatsApp/Facebook) fazem GET real na
 * página para gerar o preview de Open Graph, mas não executam JavaScript
 * do cliente — nunca chegam a montar este componente, então nunca inflam
 * a contagem (Pitfall 2 do 06-RESEARCH.md).
 *
 * Repetição (atualizar a página, ir e voltar entre grid e produto) NÃO é
 * filtrada aqui: este componente sempre dispara, e quem descarta a
 * duplicata é o índice único de (visitante, produto, dia) da migration
 * 0010. Filtrar no cliente seria frágil (basta limpar o storage) e
 * espalharia a regra de contagem por duas camadas — o banco é a única
 * fonte de verdade sobre o que conta como visualização.
 */
export function PageviewTracker({ storeId }: { storeId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    // "/{slug}" → grid (product_id null, D-01)
    // "/{slug}/{id}" → detalhe em página cheia (product_id presente)
    //
    // O parsing esperava 3 segmentos (`["loja", slug, produto]`) de quando a
    // vitrine morava em `/loja/[slug]`. Desde que ela passou para a raiz
    // (commit b137f7a) são 2 segmentos, a condição nunca era verdadeira e
    // TODO pageview era gravado com product_id nulo — o que deixava "Mais
    // visualizados" do painel permanentemente vazio.
    const segments = pathname.split("/").filter(Boolean); // [slug] ou [slug, id]
    const productId = segments.length >= 2 ? segments[1] : null;
    const visitorId = resolveVisitorId();

    startTransition(() => {
      logPageview(storeId, productId, visitorId).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
