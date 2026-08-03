"use client";

import { startTransition, useEffect } from "react";
import { usePathname } from "next/navigation";
import { logPageview } from "@/lib/products/pageview-actions";

/**
 * Chave do identificador anônimo de visitante no `localStorage`.
 * `localStorage` e não `sessionStorage` de propósito: sessionStorage morre
 * ao fechar a aba, então abrir a vitrine numa aba nova (comportamento
 * corriqueiro de quem recebe o link no WhatsApp) já valeria como pessoa
 * nova — justamente a contagem inflada que a migration 0010 corrige.
 */
const VISITOR_ID_KEY = "vitrinoo:visitor-id";

/**
 * Identidade anônima e estável do visitante. É um UUID SORTEADO: não deriva
 * de e-mail, telefone, IP nem de fingerprint do aparelho — não identifica
 * pessoa alguma, só permite dizer "estas duas visitas vieram do mesmo
 * navegador", que é o mínimo necessário pra não contar a mesma pessoa
 * várias vezes no mesmo dia.
 *
 * Todo acesso ao storage é protegido: navegador em modo restrito, storage
 * bloqueado ou cota estourada fazem `localStorage` LANÇAR, e uma exceção
 * aqui derrubaria o efeito inteiro — a visita não seria contada. No pior
 * caso devolvemos um id efêmero: a visita continua registrada, só não
 * deduplicada (mesmo comportamento que o sistema tinha antes).
 */
function resolveVisitorId(): string {
  try {
    const stored = window.localStorage.getItem(VISITOR_ID_KEY);
    if (stored) return stored;

    const generated = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_ID_KEY, generated);
    return generated;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Tracker invisível montado uma única vez por `layout.tsx` da vitrine
 * (nunca em `page.tsx` — `page.tsx` recebe `searchParams` e remontaria a
 * cada troca de filtro, violando D-02). Mesmo formato de `SessionWatcher`
 * (`useEffect` + `return null`), mas reagindo a `usePathname()` em vez de
 * `onAuthStateChange`.
 *
 * A dependência do efeito é deliberadamente `pathname`, NUNCA
 * `searchParams` — `usePathname()` exclui a query string por definição, o
 * que garante que trocar um filtro/termo de busca (mesma pathname, query
 * diferente) não dispara um novo pageview (D-02). Só uma navegação real
 * (grid → detalhe, ou detalhe de um produto → outro) muda `pathname`.
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
    // pathname: "/loja/{slug}" (grid, D-01, product_id null) ou
    // "/loja/{slug}/{produto}" (detalhe, product_id presente).
    const segments = pathname.split("/").filter(Boolean); // ["loja", slug, produto?]
    const productId = segments.length >= 3 ? segments[2] : null;
    const visitorId = resolveVisitorId();

    startTransition(() => {
      logPageview(storeId, productId, visitorId).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
