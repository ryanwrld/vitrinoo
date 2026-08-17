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
  /** Ids favoritados ativos como filtro (`?ids=`) — ver comentário do toggle
   *  "Favoritos" abaixo. */
  ids: string[];
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
 * No mobile as três pílulas viram células de um grid de 3 colunas IGUAIS
 * (ver o grupo no JSX), então cada uma precisa preencher a própria célula
 * (`w-full`) e poder truncar dentro dela (`min-w-0`).
 *
 * Grid, e não `flex` com `shrink`: medido ao vivo, a negociação de
 * `flex-shrink` posicionava as pílulas no tamanho encolhido mas as
 * RENDERIZAVA no tamanho do conteúdo — com os três filtros ativos (cada
 * badge de contagem soma ~26px) elas se sobrepunham 7-8px entre si e por
 * cima do botão de Favoritos. Num grid a largura da célula é calculada
 * antes do conteúdo, então sobreposição deixa de ser possível por
 * construção, em qualquer combinação de filtros ativos.
 */
const PILL_CELL = "max-md:w-full max-md:min-w-0";

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
   * Toggle "Favoritos" (Nível 2 do roadmap de valor) — filtro combinável
   * como qualquer outro (brand/sole/fulfillment): entra em `?ids=` via
   * `navigate()`, na MESMA query paginada de queryPublicProducts
   * (public-list.ts), preservando busca/marca/tipo de campo/entrega/ordenar
   * já ativos. NÃO troca de página/modo de exibição.
   */
  function handleFavoritesToggle() {
    if (favoritesActive) {
      navigate({ ids: [] });
      return;
    }
    if (favoriteIds.length === 0) {
      toast.error("Você ainda não favoritou nenhum produto.");
      return;
    }
    navigate({ ids: favoriteIds });
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
    if ((merged.ids ?? []).length > 0) search.set("ids", merged.ids.join(","));
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
      {/* Sentinela do sticky — 1px invisível logo acima da barra.
       *
       * `-mb-5` cancela o vão que ele mesmo cria: sendo um filho de verdade
       * do container da página (`flex flex-col gap-5`, ver page.tsx), este
       * 1px invisível consumia um slot INTEIRO de `gap-5`. Ou seja, 20px de
       * espaço vazio entre a linha divisória e a busca existiam só porque um
       * elemento de medição estava no fluxo — não por decisão de respiro.
       *
       * ACOPLAMENTO EXPLÍCITO: o `-mb-5` tem que ser o MESMO valor do
       * `gap-5` do container em page.tsx. Se aquele gap mudar, este número
       * muda junto. Fica em `max-md:` porque o desktop está aprovado como
       * está e não deve mexer. */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px max-md:-mb-5" />

      <div
        className={clsx(
          "sticky top-0 z-30 -mx-4 flex flex-col gap-3 bg-white px-4 py-3 transition-shadow duration-200 sm:-mx-6 sm:px-6 md:-mx-12 md:px-12 lg:-mx-20 lg:px-20 xl:-mx-24 xl:px-24 2xl:-mx-28 2xl:px-28",
          stuck && "shadow-[0_1px_0_0_rgb(0_0_0/0.06),0_4px_12px_-4px_rgb(0_0_0/0.08)]"
        )}
      >
        {/* Linha de controles. No desktop (md+) busca e dropdowns dividem a
            mesma linha, com a busca elástica; abaixo disso a busca ocupa a
            largura toda e os dropdowns viram uma faixa rolável.

            O toggle "Favoritos" fica FORA desse par, à esquerda — mas é UM
            FILTRO como os outros (busca/marca/solado/entrega/ordenar ficam
            visíveis e funcionais com ele ativo, e combinam livremente: dá
            pra buscar/filtrar DENTRO dos favoritos, igual a qualquer chip de
            marca ou entrega). */}
        {/* UMA fileira plana, não containers aninhados. O aninhamento
            anterior (Favoritos fora + busca/filtros dentro de um wrapper
            `flex-1`) era a causa raiz do scroll horizontal no mobile: a
            faixa de filtros herdava a largura que SOBRAVA depois do pill
            Favoritos, ~54px a menos que a tela, e com isso os quatro
            controles (404px de conteúdo) não cabiam em 358px úteis nem com
            a linha inteira. A solução era `overflow-x-auto`, que escondia
            justamente "Entrega" — o filtro de maior intenção de compra
            (pronta entrega x encomenda decide se o cliente recebe essa
            semana ou em 30 dias) — atrás de um gesto que ninguém descobre,
            conflitava com a rolagem vertical da página e, perto da borda do
            iOS, disparava o "voltar" do navegador.
            Plana, a fileira controla a posição de cada peça por `order`, e
            o `flex-wrap` distribui em duas linhas SEM nenhum eixo de
            rolagem novo.
            No mobile: linha 1 = busca (largura total); linha 2 = os três
            filtros de atributo à esquerda e, empurrado por `ml-auto`, o par
            de lentes de visualização (Favoritos + Ordenar). A quebra de
            linha passa a ser o separador semântico — atributo do produto em
            cima, modo de ver o catálogo embaixo.
            A partir de `md`, `flex-nowrap` + `md:order-none` devolvem tudo
            à ordem do DOM numa linha só: exatamente o desktop de hoje. */}
        {/* Gaps separados no mobile: o HORIZONTAL é orçamento de largura
            (cada 2px a mais aproxima o par Favoritos+Ordenar de cair numa 3ª
            linha), o VERTICAL é respiro entre a busca e a fileira de filtros
            e não disputa espaço com nada. Um `gap` único forçaria os dois a
            usarem o mesmo número e um dos lados sairia errado.

            No desktop `md:gap-3` é o valor ORIGINAL e fica intocado. Achatar
            a fileira trouxe o separador e o "Ordenar" para o nível do pai,
            onde herdariam 12px onde antes tinham 8px (viviam dentro da faixa
            de pílulas, `gap-2`); os dois devolvem a diferença com `md:-ml-1`.
            Tentei antes o caminho inverso — `md:gap-2` no pai + `md:ml-1` nos
            dois pontos que precisavam de 12px — e ele bate igual enquanto a
            busca é elástica, mas DIVERGE ~8px entre 800px e 950px, faixa em
            que a busca já colapsou a 0: ali gap ainda encolhe e margem não,
            então os totais deixam de ser equivalentes. Margem negativa em
            cima do gap original não tem esse problema. */}
        <div className="flex items-center gap-2.5 max-md:flex-wrap max-md:gap-x-1.5 max-md:gap-y-2.5 md:gap-3">
          {/* `ml-auto` só no mobile: é o que cola Favoritos+Ordenar na borda
              direita da 2ª linha, separando-os dos filtros por um vão em vez
              de um traço. No desktop ele volta a ser o primeiro item da
              linha, colado à esquerda. */}
          <button
            type="button"
            onClick={handleFavoritesToggle}
            aria-pressed={favoritesActive}
            aria-label={favoritesActive ? "Voltar ao catálogo" : "Ver favoritos"}
            style={favoritesActive ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
            className={clsx(
              "relative flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2",
              // Abaixo de `sm` vira um quadrado de 44px (o rótulo já estava
              // escondido aí de qualquer forma, então `px-3.5` só deixava uma
              // cápsula torta de 46px). Isso é o que o casa com o botão de
              // Ordenar, que é 44×44 e faz exatamente o mesmo tipo de
              // trabalho — os dois são lentes de visualização, não filtros de
              // atributo. Mesmo tamanho, mesma borda, mesmo raio = leem como
              // par em vez de dois acidentes soltos.
              // `order-3` + `ml-auto`: manda o par para o fim da 2ª linha,
              // colado na borda direita. Acima de `md` nenhuma dessas regras
              // existe — o botão volta a ser o primeiro item da linha única.
              "max-md:order-3 max-md:ml-auto max-sm:w-11 max-sm:justify-center max-sm:px-0",
              favoritesActive ? "text-white" : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
            )}
          >
            <Heart className={clsx("h-4 w-4 shrink-0", favoritesCount > 0 && !favoritesActive && "fill-red-500 text-red-500")} aria-hidden="true" />
            <span className="hidden sm:inline">Favoritos</span>
            {favoritesCount > 0 && (
              <span
                className={clsx(
                  // Absoluto no canto enquanto o botão é um quadrado de 44px
                  // (não cabe contador ao lado do ícone); volta ao fluxo a
                  // partir de `sm`, junto com o rótulo.
                  // Sai do fluxo e vira selo no canto SÓ enquanto o botão é o
                  // quadrado de 44px (abaixo de `sm`), onde não há largura
                  // para um contador ao lado do ícone. De `sm` para cima
                  // volta a ser exatamente o que sempre foi.
                  "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold tabular-nums max-sm:absolute max-sm:-right-1 max-sm:-top-1",
                  favoritesActive ? "bg-white/25 text-white" : "bg-gray-100 text-gray-700 max-sm:border max-sm:border-white"
                )}
              >
                {favoritesCount}
              </span>
            )}
          </button>

          {/* `order-1 w-full`: sozinha na 1ª linha do mobile. A busca é o
              controle mais usado e o único que aceita entrada livre — dar a
              ela a linha inteira é o que libera espaço para os outros cinco
              caberem na 2ª sem rolagem.

              `min-w-0` em `max-md:` e não na base: como classe base ele
              permitia a busca encolher abaixo do próprio conteúdo TAMBÉM no
              desktop, e entre 800px e 900px (onde ela já colapsou a 0) isso
              puxava a fileira de filtros ~26px para a esquerda em relação ao
              layout original. */}
          <div className="flex min-h-11 items-center gap-2.5 rounded-full border border-gray-300 bg-white px-4 transition-colors duration-150 focus-within:border-gray-900 max-md:order-1 max-md:w-full max-md:min-w-0 md:flex-1">
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

          {/* Os três filtros de ATRIBUTO, agrupados. `min-w-0` para poderem
              truncar em telas abaixo de ~340px em vez de estourar a largura
              — truncar é degradação legível, rolagem horizontal não é. */}
          {/* `max-md:gap-1.5`: a 360px (Galaxy A, o aparelho mais comum do
              público-alvo) os 2px a mais por vão eram exatamente o que
              empurrava o par Favoritos+Ordenar para uma 3ª linha. */}
          {/* `max-md:flex-1` é o que trava o layout em 2 linhas SEMPRE. Sem
              ele, ativar um filtro faz a pílula crescer ~26px (ganha o badge
              de contagem) e, a 360px, isso empurrava o par Favoritos+Ordenar
              para uma 3ª linha — a barra pulava de altura e jogava os
              produtos para baixo a cada toque num filtro.
              Como UM item flex, o grupo ENCOLHE em vez de deixar os vizinhos
              quebrarem (a quebra do flex-wrap é decidida pelo tamanho de
              conteúdo, não pelo tamanho já encolhido), e as pílulas truncam
              lá dentro. Altura estável vale mais que um rótulo inteiro: o
              corte só acontece em tela estreita COM filtro ativo, e nesse
              exato momento o chip logo abaixo já mostra o nome completo.
              `max-md:gap-1.5`: a 360px (Galaxy A, o aparelho mais comum do
              público-alvo) os 2px a mais por vão eram exatamente o que
              faltava para o par caber.
              `min-w-0` fica em `max-md:` e NÃO na base: como classe base ele
              deixava o grupo encolher também no desktop, e aí entre 800px e
              950px (faixa em que a busca já colapsou a 0) a fileira inteira
              assentava ~8px mais à esquerda que a original. Medido: com o
              escopo mobile, as 16 combinações de largura × estado do desktop
              batem posição e tamanho exatos com o código anterior. */}
          <div className="flex items-center gap-2 max-md:order-2 max-md:grid max-md:w-full max-md:min-w-0 max-md:flex-1 max-md:grid-cols-3 max-md:gap-1.5">
            {brandOptions.length > 0 && (
              <FilterDropdown
                /* Plural só no desktop: ali o rótulo encabeça a lista aberta
                   ("Marcas" > Nike, Adidas…) e o singular soava como se
                   coubesse uma escolha só, quando o filtro é multi-seleção.
                   No mobile o gatilho e a gaveta ficam no singular — a
                   pílula divide a fileira com mais quatro controles. A
                   gaveta do mobile acompanha o desktop ("Marcas"), porque lá
                   também encabeça a lista aberta. */
                label="Marcas"
                shortLabel="Marca"
                options={brandOptions}
                selected={currentParams.brand}
                onToggle={(value) => toggleMulti("brand", value)}
                onClear={() => navigate({ brand: [] })}
                multiple
                accentColor={accentColor}
                className={PILL_CELL}
              />
            )}

            <FilterDropdown
              /* "Tipo de solado" e não "Tipo de campo": as opções são
                 AG/MG/SG/TF/IC/FG, que são SOLADOS — a peça da chuteira. O
                 rótulo antigo descrevia o local de jogo, não o que o filtro
                 de fato seleciona. Vale em todo lugar (gatilho do desktop,
                 título da gaveta no mobile, aria-label). */
              label="Tipo de solado"
              /* No mobile as três pílulas dividem a fileira com os dois
                 botões-ícone; o rótulo inteiro sozinho comeria mais da metade
                 dela. "Solado" cabe e não perde o sentido — o nome completo
                 reaparece no título da gaveta e nos chips de filtro ativo. */
              shortLabel="Solado"
              options={soleOptions}
              selected={currentParams.sole}
              onToggle={(value) => toggleMulti("sole", value)}
              onClear={() => navigate({ sole: [] })}
              multiple
              accentColor={accentColor}
              className={PILL_CELL}
            />

            <FilterDropdown
              /* "Meio de Entrega": as opções são "Pronta entrega" e "Sob
                 encomenda" — o filtro seleciona COMO o produto chega, não a
                 entrega em si. Como nos outros dois, a pílula do mobile fica
                 com a versão curta: ela divide a fileira com mais quatro
                 controles e o nome inteiro truncaria. */
              label="Meio de Entrega"
              shortLabel="Entrega"
              options={fulfillmentOptions}
              selected={currentParams.fulfillment}
              onToggle={(value) => toggleMulti("fulfillment", value)}
              onClear={() => navigate({ fulfillment: [] })}
              multiple
              accentColor={accentColor}
              className={PILL_CELL}
            />
          </div>

          {/* Separador visual: ordenar não é filtro, e agrupá-lo junto
              sugeriria que também limita o resultado. Só no desktop — no
              mobile essa distinção já é feita pela quebra de linha e pelo
              vão do `ml-auto`, que separam melhor do que um traço de 1px. */}
          <span className="hidden h-6 w-px shrink-0 bg-gray-200 md:-ml-1 md:block" aria-hidden="true" />

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
            className="max-md:order-4 md:-ml-1"
          />
        </div>
      </div>

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
    </>
  );
}
