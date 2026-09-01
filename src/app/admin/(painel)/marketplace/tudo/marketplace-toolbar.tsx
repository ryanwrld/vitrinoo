"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, ChevronDown, X } from "lucide-react";
import { SOLE_LABELS, type SOLES } from "@/lib/products/constants";

/* `total` continua vindo da consulta, mas NÃO é exibido: os números dentro do
   seletor viravam um segundo texto por linha e transformavam a lista num
   relatório. Quem abre o filtro quer escolher um solado, não comparar volumes —
   e a contagem do resultado já aparece logo abaixo da barra. */
type Faceta = { valor: string; total: number };

/**
 * Busca e filtros do marketplace. Os `searchParams` são a única fonte de
 * verdade — abrir a URL filtrada reproduz exatamente a mesma tela, mesmo padrão
 * de `/admin/produtos`.
 *
 * Trocar qualquer filtro VOLTA PARA A PÁGINA 1. Sem isso, quem estivesse na
 * página 12 e filtrasse por uma marca com 3 itens cairia numa página vazia e
 * leria como "não tem nada", quando na verdade tem.
 */
export function MarketplaceToolbar({
  marcas,
  solados,
  mostrarStatus,
}: {
  marcas: Faceta[];
  solados: Faceta[];
  mostrarStatus: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [busca, setBusca] = useState(searchParams.get("q") ?? "");
  const primeiroRender = useRef(true);

  function navegar(mudancas: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor) params.set(chave, valor);
      else params.delete(chave);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  // Debounce da busca: digitar dispara uma navegação por tecla sem isso, e cada
  // navegação refaz a query no servidor.
  useEffect(() => {
    if (primeiroRender.current) {
      primeiroRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      navegar({ q: busca.trim() || null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const temFiltro =
    searchParams.get("q") ||
    searchParams.get("brand") ||
    searchParams.get("sole") ||
    searchParams.get("status");

  const estiloSelect =
    "min-h-11 w-full appearance-none truncate rounded-xl border border-gray-300 bg-white px-3 py-2 pr-9 text-sm text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-1.5 transition-colors duration-150 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:focus-within:ring-blue-400/20">
        <Search className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por modelo, linha ou marca"
          aria-label="Buscar no marketplace"
          className="min-h-9 w-full text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-50 dark:placeholder:text-gray-600"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <div className="relative">
          <select
            aria-label="Marca"
            value={searchParams.get("brand") ?? ""}
            onChange={(e) => navegar({ brand: e.target.value || null })}
            className={estiloSelect}
          >
            <option value="">Todas as marcas</option>
            {marcas.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.valor}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          />
        </div>

        <div className="relative">
          <select
            aria-label="Solado"
            value={searchParams.get("sole") ?? ""}
            onChange={(e) => navegar({ sole: e.target.value || null })}
            className={estiloSelect}
          >
            <option value="">Todos os solados</option>
            {solados.map((s) => (
              <option key={s.valor} value={s.valor}>
                {SOLE_LABELS[s.valor as (typeof SOLES)[number]] ?? s.valor}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          />
        </div>

        {/* Só para quem cura: um revendedor não tem o que fazer com "rascunho". */}
        {mostrarStatus && (
          <div className="relative">
            <select
              aria-label="Situação"
              value={searchParams.get("status") ?? ""}
              onChange={(e) => navegar({ status: e.target.value || null })}
              className={estiloSelect}
            >
              <option value="">Todas as situações</option>
              <option value="published">Publicadas</option>
              <option value="draft">Rascunho</option>
              <option value="archived">Arquivadas</option>
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            />
          </div>
        )}

        <div className="relative">
          <select
            aria-label="Ordenar"
            value={searchParams.get("sort") ?? "recentes"}
            onChange={(e) => navegar({ sort: e.target.value })}
            className={estiloSelect}
          >
            {/* "Lançamentos", e não "Lançamentos primeiro": é o padrão da lista e
                aparece fechado o tempo todo ao lado de dois filtros. O "primeiro"
                era a palavra mais comprida da barra para explicar o que a própria
                posição no seletor já diz. */}
            <option value="recentes">Lançamentos</option>
            <option value="menor_preco">Menor preço</option>
            <option value="maior_preco">Maior preço</option>
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          />
        </div>

        {temFiltro && (
          <button
            type="button"
            onClick={() => {
              setBusca("");
              navegar({ q: null, brand: null, sole: null, status: null });
            }}
            className="col-span-2 flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 sm:col-span-1 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
