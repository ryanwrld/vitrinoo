"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownWideNarrow, Heart, Search, X } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { useDebouncedValue } from "@/lib/hooks/use-debounce";
import { SOLES, SOLE_LABELS, PUBLIC_FULFILLMENTS, SORT_OPTIONS, DEFAULT_SORT } from "@/lib/products/constants";
import type { BrandFacet } from "@/lib/products/public-facets";
import { useFavorites } from "@/lib/favorites/use-favorites";
import { FilterDropdown, type DropdownOption } from "./filter-dropdown";
import { ActiveFilters, type ActiveFilterChip } from "./active-filters";

export type FilterBarParams = {
  q?: string;
  brand: string[];
  sole: string[];
  fulfillment: string[];
  sort: string;
};

export type FilterBarProps = {
  slug: string;
  currentParams: FilterBarParams;
  /** Marcas realmente presentes no catálogo publicado (public-facets.ts). */
  brandFacets: BrandFacet[];
  accentColor: string;
  /** Quantidade de produtos renderizados na página atual. */
  resultCount: number;
  /** `true` quando `?ids=...` está presente — a aba Favoritos está ativa. */
  favoritesActive: boolean;
};

/**
 * Barra de comando da vitrine pública: busca, filtros e ordenação numa
 * única faixa compacta.
 *
 * Substitui `product-filters.tsx`, que empilhava três fileiras de chips sem
 * rótulo (211px de altura antes do primeiro produto, siglas cruas como
 * "TF"/"IC" sem tradução, e nenhum feedback de quantos filtros estavam
 * ativos). Aqui a regra é: o produto é o herói — os controles ocupam uma
 * linha, e o que está filtrado aparece como chip removível abaixo.
 *
 * Mantém a disciplina que já valia antes: a URL é a ÚNICA fonte de verdade
 * dos filtros (nenhum estado próprio persistido; cada mudança reconstrói a
 * query string a partir de `currentParams`), busca com debounce de 400ms, e
 * `page` NUNCA é herdado ao mudar filtro — trocar de filtro na página 3 e
 * continuar na página 3 devolveria um vazio inexplicável.
 *
 * `produto` (query param que abre o modal de detalhe, ver product-modal.tsx)
 * também é descartado em qualquer navegação daqui: mudar o filtro com o
 * modal aberto deve mostrar o resultado novo, não manter o produto anterior
 * por cima dele.
 */
export function FilterBar({ slug, currentParams, brandFacets, accentColor, resultCount, favoritesActive }: FilterBarProps) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(currentParams.q ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [stuck, setStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { ids: favoriteIds, count: favoritesCount } = useFavorites(slug);

  /**
   * Toggle "Favoritos" (Nível 2 do roadmap de valor) — NÃO é um filtro como
   * os outros (brand/sole/fulfillment): ele troca a página inteira pra
   * `?ids=<favoritos>`, que o Server Component (page.tsx) trata como um modo
   * de exibição à parte (favorites-view.tsx), não como mais um `.in()` na
   * mesma query. Por isso não passa por `navigate()`/`currentParams` — os
   * dois modos são mutuamente exclusivos de propósito.
   */
  function handleFavoritesToggle() {
    if (favoritesActive) {
      router.push(`/${slug}`, { scroll: false });
      return;
    }
    if (favoriteIds.length === 0) {
      toast.error("Você ainda não favoritou nenhum produto.");
      return;
    }
    router.push(`/${slug}?ids=${favoriteIds.join(",")}`, { scroll: false });
  }

  useEffect(() => {
    const currentQ = currentParams.q ?? "";
    if (debouncedSearch === currentQ) return;
    navigate({ q: debouncedSearch || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Sombra da barra sticky só depois que ela descola do topo. Um sentinela
  // de 1px + IntersectionObserver em vez de listener de scroll: não dispara
  // a cada pixel rolado, que é o que causa jank em celular fraco no 4G.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      threshold: 1,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  function navigate(overrides: Partial<Omit<FilterBarParams, "sort">> & { sort?: string }) {
    const merged = { ...currentParams, ...overrides };
    const search = new URLSearchParams();
    if (merged.q) search.set("q", merged.q);
    (merged.brand ?? []).forEach((value) => search.append("brand", value));
    (merged.sole ?? []).forEach((value) => search.append("sole", value));
    (merged.fulfillment ?? []).forEach((value) => search.append("fulfillment", value));
    // Ordenação padrão não suja a URL — `/loja` e `/loja?sort=recentes` são
    // a mesma coisa, e o link que o revendedor compartilha fica limpo.
    if (merged.sort && merged.sort !== DEFAULT_SORT) search.set("sort", merged.sort);

    const queryString = search.toString();
    router.push(queryString ? `/${slug}?${queryString}` : `/${slug}`, { scroll: false });
  }

  function toggleMulti(category: "brand" | "sole" | "fulfillment", value: string) {
    const current = currentParams[category];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    navigate({ [category]: next });
  }

  function clearAll() {
    setSearchInput("");
    router.push(`/${slug}`, { scroll: false });
  }

  const brandOptions: DropdownOption[] = brandFacets.map((facet) => ({
    value: facet.value,
    label: facet.label,
  }));

  const soleOptions: DropdownOption[] = SOLES.map((sole) => ({
    value: sole,
    label: SOLE_LABELS[sole],
  }));

  const fulfillmentOptions: DropdownOption[] = PUBLIC_FULFILLMENTS.map((item) => ({
    value: item.value,
    label: item.label,
  }));

  // Chips de filtro ativo — a busca por texto entra junto, porque para o
  // cliente ela é tão "filtro" quanto uma marca, e sem isso um termo
  // digitado e esquecido no campo vira resultado vazio sem explicação.
  const activeChips: ActiveFilterChip[] = [
    ...(currentParams.q ? [{ category: "q", value: currentParams.q, label: `"${currentParams.q}"` }] : []),
    ...currentParams.brand.map((value) => ({
      category: "brand",
      value,
      label: brandFacets.find((facet) => facet.value === value)?.label ?? value,
    })),
    ...currentParams.sole.map((value) => ({
      category: "sole",
      value,
      label: SOLE_LABELS[value as (typeof SOLES)[number]] ?? value,
    })),
    ...currentParams.fulfillment.map((value) => ({
      category: "fulfillment",
      value,
      label: PUBLIC_FULFILLMENTS.find((item) => item.value === value)?.label ?? value,
    })),
  ];

  function removeChip(category: string, value: string) {
    if (category === "q") {
      setSearchInput("");
      navigate({ q: undefined });
      return;
    }
    toggleMulti(category as "brand" | "sole" | "fulfillment", value);
  }

  return (
    <>
      {/* Sentinela do sticky — 1px invisível logo acima da barra. */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />

      <div
        className={clsx(
          "sticky top-0 z-30 -mx-4 flex flex-col gap-3 bg-white px-4 py-3 transition-shadow duration-200 sm:-mx-6 sm:px-6 md:-mx-12 md:px-12 lg:-mx-20 lg:px-20 xl:-mx-24 xl:px-24 2xl:-mx-28 2xl:px-28",
          stuck && "shadow-[0_1px_0_0_rgb(0_0_0/0.06),0_4px_12px_-4px_rgb(0_0_0/0.08)]"
        )}
      >
        {/* Linha de controles. No desktop (md+) busca e dropdowns dividem a
            mesma linha, com a busca elástica; abaixo disso a busca ocupa a
            largura toda e os dropdowns viram uma faixa rolável.

            O toggle "Favoritos" fica FORA desse par — sempre visível, os
            dois modos (catálogo filtrado x lista de favoritos) são
            mutuamente exclusivos, então busca/marca/solado/entrega/ordenar
            somem quando ele está ativo (não fazem sentido sobre uma lista
            que já não vem do `.range()` paginado). */}
        {/* `items-start`, não `items-center`: abaixo de `md` a busca e a
            faixa de dropdowns empilham em 2 linhas dentro do wrapper
            flex-1 (ver comentário abaixo), e centralizar o pill "Favoritos"
            contra a altura combinada das duas linhas o deixava flutuando no
            meio do vão entre elas — nem alinhado com a busca, nem com os
            filtros. A partir de `md` busca+filtros voltam a ser UMA linha só
            da mesma altura do pill, então não muda nada aí. */}
        <div className="flex items-start gap-2.5 md:items-center md:gap-3">
          <button
            type="button"
            onClick={handleFavoritesToggle}
            aria-pressed={favoritesActive}
            aria-label={favoritesActive ? "Voltar ao catálogo" : "Ver favoritos"}
            style={favoritesActive ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
            className={clsx(
              "flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2",
              favoritesActive ? "text-white" : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
            )}
          >
            <Heart className={clsx("h-4 w-4 shrink-0", favoritesCount > 0 && !favoritesActive && "fill-red-500 text-red-500")} aria-hidden="true" />
            <span className="hidden sm:inline">Favoritos</span>
            {favoritesCount > 0 && (
              <span
                className={clsx(
                  "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold tabular-nums",
                  favoritesActive ? "bg-white/25 text-white" : "bg-gray-100 text-gray-700"
                )}
              >
                {favoritesCount}
              </span>
            )}
          </button>

          {!favoritesActive && (
            <div className="flex flex-1 flex-col gap-2.5 md:flex-row md:items-center md:gap-3">
              <div className="flex min-h-11 items-center gap-2.5 rounded-full border border-gray-300 bg-white px-4 transition-colors duration-150 focus-within:border-gray-900 md:flex-1">
                <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Buscar por nome…"
                  aria-label="Buscar produtos por nome"
                  /* `text-base` (16px) não é escolha estética: abaixo disso o
                     Safari no iOS dá zoom automático ao focar o campo e
                     desmonta o layout da vitrine. */
                  className="w-full bg-transparent py-2 text-base text-gray-900 outline-none placeholder:text-gray-400 [&::-webkit-search-cancel-button]:hidden"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput("")}
                    aria-label="Limpar busca"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* `-mx-4 px-4` devolve o sangramento até a borda da tela: sem
                  isso, o último dropdown some sob o padding e o cliente não
                  percebe que a faixa rola. `[scrollbar-width:none]` esconde a
                  barra no desktop, onde ela não some sozinha. */}
              <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
                {brandOptions.length > 0 && (
              <FilterDropdown
                label="Marca"
                options={brandOptions}
                selected={currentParams.brand}
                onToggle={(value) => toggleMulti("brand", value)}
                onClear={() => navigate({ brand: [] })}
                multiple
                accentColor={accentColor}
              />
            )}

            <FilterDropdown
              label="Tipo de campo"
              options={soleOptions}
              selected={currentParams.sole}
              onToggle={(value) => toggleMulti("sole", value)}
              onClear={() => navigate({ sole: [] })}
              multiple
              accentColor={accentColor}
            />

            <FilterDropdown
              label="Entrega"
              options={fulfillmentOptions}
              selected={currentParams.fulfillment}
              onToggle={(value) => toggleMulti("fulfillment", value)}
              onClear={() => navigate({ fulfillment: [] })}
              multiple
              accentColor={accentColor}
            />

            {/* Separador visual: ordenar não é filtro, e agrupá-lo junto
                sugeriria que também limita o resultado. Só no desktop, onde
                há espaço horizontal para a distinção ser lida. */}
            <span className="hidden h-6 w-px shrink-0 bg-gray-200 md:block" aria-hidden="true" />

            <FilterDropdown
              label="Ordenar"
              options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              selected={currentParams.sort !== DEFAULT_SORT ? [currentParams.sort] : []}
              onToggle={(value) => navigate({ sort: value })}
              onClear={() => navigate({ sort: DEFAULT_SORT })}
              multiple={false}
              accentColor={accentColor}
              triggerVariant="icon"
              triggerIcon={ArrowDownWideNarrow}
            />
              </div>
            </div>
          )}
        </div>
      </div>

      {!favoritesActive && (
        <div className="flex flex-col gap-2.5">
          <ActiveFilters chips={activeChips} onRemove={removeChip} onClearAll={clearAll} />

          {/* `aria-live` para leitor de tela anunciar a mudança de resultado —
              sem isso, quem não enxerga a tela filtra e não recebe retorno
              nenhum. Mostra o que ESTÁ renderizado, nunca um total prometido:
              a regra de esconder esgotado roda em memória depois da
              paginação (ver isVisible em public-list.ts), então uma contagem
              do banco mentiria para mais. */}
          {resultCount > 0 && (
            <p aria-live="polite" className="text-sm text-gray-500">
              {resultCount} {resultCount === 1 ? "produto" : "produtos"}
            </p>
          )}
        </div>
      )}
    </>
  );
}
