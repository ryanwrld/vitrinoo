"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { useDebouncedValue } from "@/lib/hooks/use-debounce";
import { BRANDS, SOLES } from "@/lib/products/constants";

export type ProductToolbarParams = {
  q?: string;
  status?: string;
  brand?: string;
  sole?: string;
  sort?: string;
};

export type ProductToolbarProps = {
  currentParams: ProductToolbarParams;
};

/**
 * Toolbar de busca/filtro/ordenação (PROD-06, 03-UI-SPEC.md §Product list
 * page toolbar). Nunca escreve estado próprio de filtro — cada mudança
 * chama `router.push` reconstruindo a URL a partir de `currentParams`
 * (prop vinda de `page.tsx`, já derivada do `searchParams` real), o que
 * satisfaz o must_have "abrir a URL filtrada reproduz a mesma visualização"
 * (a URL é a única fonte de verdade, nunca um estado React paralelo).
 *
 * A busca por nome usa `useDebouncedValue` (já existe desde a Fase 2,
 * `src/lib/hooks/use-debounce.ts`, mesmo padrão de `slug-editor.tsx`) para
 * não disparar `router.push` a cada tecla — só depois que o valor "assenta"
 * por 400ms. Os selects de filtro/ordenação disparam `router.push`
 * imediatamente no `onChange` (sem debounce, já que não são digitação livre).
 *
 * Mobile: os controles ficam em `flex-wrap gap-2` (nunca uma tira de scroll
 * horizontal que esconde controles, 03-UI-SPEC.md §Spacing Scale).
 */
export function ProductToolbar({ currentParams }: ProductToolbarProps) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(currentParams.q ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  // Só dispara a navegação quando o valor debounced diverge do que já está
  // refletido na URL — evita um `router.push` redundante logo após a própria
  // navegação disparada por este mesmo efeito (mesma disciplina de
  // `needsCheck` em slug-editor.tsx: nunca setState síncrono, sempre
  // derivado/comparado antes de agir).
  useEffect(() => {
    const currentQ = currentParams.q ?? "";
    if (debouncedSearch === currentQ) return;
    navigate({ q: debouncedSearch || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function navigate(overrides: Partial<ProductToolbarParams>) {
    const merged: ProductToolbarParams = { ...currentParams, ...overrides };
    const search = new URLSearchParams();
    if (merged.q) search.set("q", merged.q);
    if (merged.status) search.set("status", merged.status);
    if (merged.brand) search.set("brand", merged.brand);
    if (merged.sole) search.set("sole", merged.sole);
    if (merged.sort) search.set("sort", merged.sort);
    const queryString = search.toString();
    router.push(queryString ? `/admin/produtos?${queryString}` : "/admin/produtos");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:focus-within:ring-blue-400/20">
        <Search className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Buscar por nome…"
          aria-label="Buscar por nome"
          className="w-full min-h-11 text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-50 dark:placeholder:text-gray-600"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <select
            value={currentParams.status ?? ""}
            onChange={(event) => navigate({ status: event.target.value || undefined })}
            aria-label="Filtrar por status"
            className="min-h-11 appearance-none rounded-md border border-gray-300 bg-white px-3 py-2 pr-9 text-sm text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20"
          >
            <option value="">Todos</option>
            <option value="published">Publicado</option>
            <option value="draft">Rascunho</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
        </div>

        <div className="relative">
          <select
            value={currentParams.brand ?? ""}
            onChange={(event) => navigate({ brand: event.target.value || undefined })}
            aria-label="Filtrar por marca"
            className="min-h-11 appearance-none rounded-md border border-gray-300 bg-white px-3 py-2 pr-9 text-sm text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20"
          >
            <option value="">Todas as marcas</option>
            {BRANDS.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
        </div>

        <div className="relative">
          <select
            value={currentParams.sole ?? ""}
            onChange={(event) => navigate({ sole: event.target.value || undefined })}
            aria-label="Filtrar por solado"
            className="min-h-11 appearance-none rounded-md border border-gray-300 bg-white px-3 py-2 pr-9 text-sm text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20"
          >
            <option value="">Todos os solados</option>
            {SOLES.map((sole) => (
              <option key={sole} value={sole}>
                {sole}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
        </div>

        <div className="relative">
          <select
            value={currentParams.sort ?? "recente"}
            onChange={(event) => navigate({ sort: event.target.value === "recente" ? undefined : event.target.value })}
            aria-label="Ordenar por"
            className="min-h-11 appearance-none rounded-md border border-gray-300 bg-white px-3 py-2 pr-9 text-sm text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20"
          >
            <option value="recente">Mais recente</option>
            <option value="nome">Nome</option>
            <option value="preco">Preço</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
