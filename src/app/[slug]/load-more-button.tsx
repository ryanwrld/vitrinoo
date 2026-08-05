"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { fetchNextPage } from "@/lib/products/public-actions";
import type { QueryPublicProductsParams } from "@/lib/products/public-list";
import { ProductCard, type PublicProductCardData } from "./product-card";

export type LoadMoreButtonProps = {
  slug: string;
  initialPage: number;
  initialHasMore: boolean;
  filters: Omit<QueryPublicProductsParams, "page">;
};

/**
 * Controle de paginação MOBILE (D-05, primário) — os primeiros 20 produtos
 * já vêm renderizados pelo Server Component (page.tsx); este componente só
 * acumula o que vem DEPOIS, nunca substitui o que já foi renderizado pelo
 * servidor (04-RESEARCH.md Pattern 7). Chama `fetchNextPage` (Server Action)
 * via `useTransition`, mesmo padrão de `product-list.tsx` do admin
 * (useTransition + toast de erro).
 *
 * Visível só no mobile via CSS (`flex md:hidden`, aplicado por page.tsx) —
 * nunca detecção de device em JS.
 */
export function LoadMoreButton({ slug, initialPage, initialHasMore, filters }: LoadMoreButtonProps) {
  const [items, setItems] = useState<PublicProductCardData[]>([]);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    startTransition(async () => {
      const result = await fetchNextPage(slug, filters, currentPage + 1);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setItems((prev) => [...prev, ...result.products]);
      setCurrentPage((page) => page + 1);
      setHasMore(result.hasMore);
    });
  }

  if (!hasMore && items.length === 0) return null;

  return (
    <>
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} slug={slug} />
          ))}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={isPending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none"
        >
          {isPending ? "Carregando…" : "Carregar mais"}
        </button>
      )}
    </>
  );
}
