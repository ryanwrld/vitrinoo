import Link from "next/link";

export type PaginationNumberedProps = {
  slug: string;
  currentPage: number;
  hasMore: boolean;
  /** Query string atual (filtros/busca) já serializada, SEM a chave "page". */
  searchParamsString: string;
};

/**
 * Controle de paginação DESKTOP (D-05, variante secundária) — Server
 * Component sem estado nenhum. Cada clique é uma navegação de página inteira
 * que o Server Component recalcula do zero (sem cache, VITR-03). Sem analog
 * direto no codebase (nenhuma paginação numerada existia antes desta fase).
 *
 * Visível só no desktop via CSS (`hidden md:flex`, aplicado por page.tsx) —
 * nunca detecção de device em JS.
 */
export function PaginationNumbered({ slug, currentPage, hasMore, searchParamsString }: PaginationNumberedProps) {
  const prefix = searchParamsString ? `${searchParamsString}&` : "";

  return (
    <nav className="flex items-center gap-3" aria-label="Paginação">
      {currentPage > 1 && (
        <Link
          href={`/${slug}?${prefix}page=${currentPage - 1}`}
          className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
        >
          Anterior
        </Link>
      )}
      {hasMore && (
        <Link
          href={`/${slug}?${prefix}page=${currentPage + 1}`}
          className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
        >
          Próxima
        </Link>
      )}
    </nav>
  );
}
