"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search, ImageOff, CornerDownLeft, X } from "lucide-react";
import { buildSearchRegistry, filterRegistry, PRIMARY_NAV_IDS, type SearchEntry } from "@/lib/search/registry";
import { searchProducts, type ProductSearchResult } from "@/lib/search/actions";
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } from "@/lib/search/recent-searches";
import { formatBRLPrice } from "@/lib/currency/brl";
import { lockScroll } from "@/lib/ui/scroll-lock";

/**
 * Busca global do painel — command palette central (modal) com atalho pra
 * qualquer rota do app + busca de produtos por nome. Ver spec em
 * docs/superpowers/specs/2026-07-26-busca-command-palette-design.md.
 *
 * Estrutura em 3 peças pra o mesmo modal servir desktop E mobile sem
 * duplicar estado/listener/prefetch:
 *   - `SearchTriggerButton`: o campo "Buscar…" (pill). Fica no aside no
 *     desktop e dentro do drawer no mobile — os dois só chamam `onClick`.
 *   - `SearchModal`: casca que monta `SearchPalette` só quando aberto.
 *   - `SearchPalette`: o painel + toda a lógica. Monta a cada abertura
 *     (estado nasce limpo, sem efeito de reset) e desmonta ao fechar.
 * O estado `open` e o atalho ⌘K/Ctrl+K vivem no `AdminSidebar`, que renderiza
 * o modal uma vez só.
 *
 * O miolo é estado React controlado (não `:focus`/`peer` puro): CSS sozinho
 * não filtra lista, não navega por teclado, e o blur fecharia o painel antes
 * do clique num resultado registrar.
 */

type Selectable =
  | { type: "recent"; term: string }
  | { type: "nav"; entry: SearchEntry }
  | { type: "product"; product: ProductSearchResult };

/**
 * Detecta Mac no client pra mostrar o atalho certo na plaquinha (⌘ no Mac,
 * Ctrl no Windows/Linux). O ATALHO já funciona nos dois (o listener escuta
 * metaKey || ctrlKey) — isto é só o rótulo visual. useSyncExternalStore (não
 * setState num efeito): o servidor não conhece o SO, então o snapshot do
 * servidor é `false` (Ctrl) até a hidratação confirmar, sem mismatch.
 */
const noopSubscribe = () => () => {};
function useIsMac(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent),
    () => false
  );
}

/** Campo "Buscar…" (pill) — só dispara `onClick`. A plaquinha ⌘K/Ctrl K some
 *  abaixo de lg (no mobile ninguém usa atalho, só toca). */
export function SearchTriggerButton({ onClick }: { onClick: () => void }) {
  const isMac = useIsMac();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-sm text-gray-400 transition-colors duration-150 hover:border-gray-300 hover:text-gray-500 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-500 dark:hover:border-gray-700"
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 text-left">Buscar…</span>
      <kbd className="hidden shrink-0 rounded border border-gray-200 bg-white px-1.5 font-sans text-[10px] font-semibold text-gray-400 lg:inline dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}

/** Casca: monta o painel só quando aberto (estado nasce limpo a cada vez). */
export function SearchModal({
  open,
  onClose,
  storeName,
  storeSlug,
}: {
  open: boolean;
  onClose: () => void;
  storeName: string | null;
  storeSlug?: string | null;
}) {
  if (!open) return null;
  return <SearchPalette onClose={onClose} storeName={storeName} storeSlug={storeSlug} />;
}

function SearchPalette({
  onClose,
  storeName,
  storeSlug,
}: {
  onClose: () => void;
  storeName: string | null;
  storeSlug?: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => getRecentSearches());
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  const registry = useMemo(() => buildSearchRegistry({ storeName, storeSlug }), [storeName, storeSlug]);
  const trimmed = query.trim();
  const isEmpty = trimmed === "";

  const navMatches = useMemo(() => {
    if (isEmpty) return registry.filter((entry) => (PRIMARY_NAV_IDS as readonly string[]).includes(entry.id));
    return filterRegistry(registry, trimmed);
  }, [registry, trimmed, isEmpty]);

  // Lista plana pra navegação por teclado + destaque. Ordem = ordem visual.
  const items = useMemo<Selectable[]>(() => {
    if (isEmpty) {
      return [
        ...recent.map((term): Selectable => ({ type: "recent", term })),
        ...navMatches.map((entry): Selectable => ({ type: "nav", entry })),
      ];
    }
    return [
      ...navMatches.map((entry): Selectable => ({ type: "nav", entry })),
      ...products.map((product): Selectable => ({ type: "product", product })),
    ];
  }, [isEmpty, recent, navMatches, products]);

  // Toda mudança de texto passa por aqui (input e clique em busca recente) —
  // reseta destaque e ajusta loading/products fora de qualquer efeito, pra o
  // corpo do useEffect da busca não conter setState síncrono (regra de lint).
  const updateQuery = useCallback((value: string) => {
    setQuery(value);
    setActiveIndex(0);
    if (value.trim().length < 2) {
      setProducts([]);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, []);

  // Foca o input e trava o scroll do body enquanto o modal existe.
  // `lockScroll` compensa a largura da barra de rolagem que some junto com a
  // trava — sem isso o painel inteiro desloca 15px ao abrir a busca (ver
  // src/lib/ui/scroll-lock.ts).
  useEffect(() => {
    inputRef.current?.focus();
    return lockScroll();
  }, []);

  // Pré-carrega as rotas internas na abertura — quem abriu a busca provavelmente
  // vai navegar. Sem isso, `router.push` faria carregamento a frio no clique;
  // com o prefetch a rota já está quente e a navegação é instantânea.
  useEffect(() => {
    for (const entry of registry) {
      if (entry.kind === "route") router.prefetch(entry.href);
    }
  }, [registry, router]);

  // Busca de produtos debounced (≥ 2 chars). O corpo do efeito não chama
  // setState (só mexe no ref e agenda o timer) — o loading/clear pra < 2 chars
  // já foi tratado em updateQuery. requestId descarta respostas obsoletas.
  const requestIdRef = useRef(0);
  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (trimmed.length < 2) return;
    const timer = setTimeout(async () => {
      const results = await searchProducts(trimmed);
      if (requestIdRef.current !== requestId) return; // resposta obsoleta
      setProducts(results);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [trimmed]);

  // "X" de uma busca recente e "Limpar tudo" — ambos sempre visíveis (não só
  // no hover): num popup também usado no mobile, hover-to-reveal esconderia
  // o controle pra sempre de quem só toca a tela.
  const handleRemoveRecent = useCallback((term: string) => {
    setRecent(removeRecentSearch(term));
    setActiveIndex(0);
  }, []);

  const handleClearRecent = useCallback(() => {
    setRecent(clearRecentSearches());
    setActiveIndex(0);
  }, []);

  const handleSelect = useCallback(
    (item: Selectable) => {
      if (item.type === "recent") {
        updateQuery(item.term);
        inputRef.current?.focus();
        return;
      }
      if (item.type === "nav") {
        addRecentSearch(trimmed || item.entry.label);
        if (item.entry.external) {
          window.open(item.entry.href, "_blank", "noopener,noreferrer");
        } else {
          router.push(item.entry.href);
        }
        onClose();
        return;
      }
      // produto
      addRecentSearch(trimmed || item.product.name);
      router.push(`/admin/produtos/${item.product.id}/editar`);
      onClose();
    },
    [trimmed, router, onClose, updateQuery]
  );

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) handleSelect(item);
    }
  }

  const showRecent = isEmpty && recent.length > 0;
  const showEmptyState = !isEmpty && !loading && items.length === 0;

  // Portalizado pro <body>: o <aside> da sidebar é `position: sticky`, que cria
  // um stacking context — sem o portal, o modal (fixed z-60) ficaria PRESO nele
  // e o <main> pintaria por cima, roubando cliques/scroll. `admin-scope` na raiz
  // re-habilita o dark mode (o seletor dark exige esse ancestral).
  return createPortal(
    <div className="admin-scope fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[10vh] sm:pt-[12vh]" role="dialog" aria-modal="true" aria-label="Busca">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fechar busca"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 cursor-default bg-black/45 backdrop-blur-[2px]"
      />

      {/* Painel */}
      <div className="animate-scale-in relative flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900 sm:max-h-[70vh]">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 dark:border-gray-800">
          <Search className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Buscar produtos, páginas e ações…"
            // text-[16px] (não text-base=15px do tema): abaixo de 16px o
            // Safari iOS dá zoom automático na página inteira ao focar o
            // input — é o único lugar do app que precisa disso, então fixo
            // aqui em vez de mexer no token global.
            className="h-14 flex-1 bg-transparent text-[16px] text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-50 dark:placeholder:text-gray-500"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {showRecent && (
            <Section
              title="Buscas recentes"
              action={
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleClearRecent();
                  }}
                  className="rounded px-2 py-1 text-[11px] font-semibold text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                >
                  Limpar tudo
                </button>
              }
            >
              {recent.map((term, index) => (
                <div
                  key={`recent-${term}`}
                  className={`flex min-h-11 w-full items-center rounded-lg text-sm transition-colors duration-100 ${
                    activeIndex === index ? "bg-primary-subtle dark:bg-blue-400/15" : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  {/* Botão principal ocupa o resto da linha; o "X" é irmão, não filho
                      (evita <button> aninhado) e tem seu próprio onMouseDown, então um
                      toque nele nunca aciona a seleção da busca recente por baixo. */}
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleSelect({ type: "recent", term });
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left"
                  >
                    <Search className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                    <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{term}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover "${term}" das buscas recentes`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleRemoveRecent(term);
                    }}
                    className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 active:bg-gray-300 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300 dark:active:bg-gray-600"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </Section>
          )}

          {navMatches.length > 0 && (
            <Section title={isEmpty ? "Ir para" : "Navegação"}>
              {navMatches.map((entry, index) => {
                const globalIndex = (showRecent ? recent.length : 0) + index;
                const Icon = entry.Icon;
                return (
                  <RowButton key={entry.id} active={activeIndex === globalIndex} onSelect={() => handleSelect({ type: "nav", entry })}>
                    <Icon className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <span className="flex-1 truncate text-left text-gray-700 dark:text-gray-300">{entry.label}</span>
                    {entry.external && <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">abre em nova aba</span>}
                  </RowButton>
                );
              })}
            </Section>
          )}

          {!isEmpty && (loading || products.length > 0) && (
            <Section title="Produtos">
              {loading && products.length === 0
                ? [0, 1].map((key) => <ProductSkeleton key={`skeleton-${key}`} />)
                : products.map((product, index) => {
                    const globalIndex = navMatches.length + index;
                    return (
                      <RowButton key={product.id} active={activeIndex === globalIndex} onSelect={() => handleSelect({ type: "product", product })} padded>
                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                          {product.coverUrl ? (
                            <Image src={product.coverUrl} alt={product.name} fill sizes="44px" className="object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <ImageOff className="h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                            </div>
                          )}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-left text-sm font-medium text-gray-900 dark:text-gray-50">{product.name}</span>
                          <span className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            {formatBRLPrice(product.price)}
                            <span
                              className={`rounded-full px-1.5 py-px text-[10px] font-bold ${
                                product.disponivel
                                  ? "bg-success-bg text-success-fg dark:bg-success-solid/15"
                                  : "bg-error-bg text-error-badge-fg dark:bg-error-solid/15"
                              }`}
                            >
                              {product.disponivel ? "Disponível" : "Esgotado"}
                            </span>
                          </span>
                        </div>
                      </RowButton>
                    );
                  })}
            </Section>
          )}

          {showEmptyState && (
            <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
              <span className="font-medium text-gray-900 dark:text-gray-50">Nenhum resultado</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">Tente o nome do modelo ou de uma página do painel.</span>
            </div>
          )}
        </div>

        {/* Rodapé com dicas de teclado — escondido no mobile (sem teclado). */}
        <div className="hidden items-center gap-4 border-t border-gray-100 px-4 py-2.5 text-[11px] text-gray-400 sm:flex dark:border-gray-800 dark:text-gray-500">
          <span className="flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" aria-hidden="true" /> selecionar
          </span>
          <span>↑ ↓ navegar</span>
          <span>esc fechar</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-1 last:mb-0">
      <div className="flex items-center justify-between px-2 pb-1 pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{title}</p>
        {action}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function RowButton({
  active,
  onSelect,
  padded,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  padded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // onMouseDown (não onClick): dispara antes de qualquer blur, então o
      // clique num resultado sempre registra antes do painel fechar.
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect();
      }}
      className={`flex min-h-11 w-full items-center gap-3 rounded-lg text-sm transition-colors duration-100 ${padded ? "p-2" : "px-2 py-2"} ${
        active ? "bg-primary-subtle dark:bg-blue-400/15" : "hover:bg-gray-100 dark:hover:bg-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

function ProductSkeleton() {
  return (
    <div className="flex items-center gap-3 p-2">
      <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="h-3 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    </div>
  );
}
