"use client";

import { startTransition, useEffect } from "react";
import { logPageview } from "@/lib/products/pageview-actions";
import { resolveVisitorId } from "@/lib/analytics/visitor-id";

/**
 * Registra a visita a um PRODUTO aberto como modal sobre o grid
 * (`/{slug}?produto=<id>`). Montado por `page.tsx` — um Server Component
 * que recebe `searchParams` de verdade — e o id chega como PROP.
 *
 * Essa prop é o ponto central do componente, não um detalhe: ler o
 * `?produto=` com `useSearchParams()` lá no `PageviewTracker` do layout não
 * funciona, porque layouts não re-renderizam quando só a query string muda
 * (o valor chegava sempre nulo, e nenhuma visualização de produto era
 * gravada). Um Server Component é a única fonte confiável do parâmetro.
 *
 * Não há risco de contagem dobrada com o tracker do layout: aquele só grava
 * `product_id` quando a PATHNAME tem o id (`/{slug}/{id}`, página cheia), e
 * abrir o modal não muda a pathname. Cada caminho registra exatamente uma
 * linha.
 *
 * Reabrir o mesmo produto grava de novo, de propósito — a deduplicação por
 * (visitante, produto, dia) é responsabilidade do índice único da migration
 * 0010, nunca do cliente (ver pageview-tracker.tsx).
 */
export function ProductViewTracker({ storeId, productId }: { storeId: string; productId: string }) {
  useEffect(() => {
    const visitorId = resolveVisitorId();

    startTransition(() => {
      logPageview(storeId, productId, visitorId).catch(() => {});
    });
  }, [storeId, productId]);

  return null;
}
