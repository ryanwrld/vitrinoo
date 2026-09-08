"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Paginação numerada da listagem de produtos.
 *
 * Mesma mecânica de URL do `Paginacao` da grade do acervo
 * (marketplace/tudo/marketplace-grid.tsx): a página vive no `?page=`, cada clique é uma
 * navegação que o Server Component recalcula do zero. Nada de estado de página no cliente.
 *
 * O que ela tem a mais: com 21 páginas, chegar na 19 pelas setas custa 18 cliques. Então o
 * número da página ATUAL é um botão que vira campo — digitar 19 e apertar Enter leva direto.
 * É o mesmo alvo que a pessoa já está olhando, sem um segundo controle ocupando a linha.
 */
export function Paginacao({ pagina, totalPaginas }: { pagina: number; totalPaginas: number }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const campoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editando) campoRef.current?.select();
  }, [editando]);

  if (totalPaginas <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    return `${pathname}?${params.toString()}`;
  };

  function confirmar() {
    const alvo = Number.parseInt(rascunho, 10);
    setEditando(false);
    if (!Number.isFinite(alvo)) return;
    // Fora do intervalo vira o extremo mais próximo, em vez de recusar em silêncio.
    const destino = Math.min(Math.max(alvo, 1), totalPaginas);
    if (destino !== pagina) router.push(href(destino));
  }

  const seta =
    "flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-gray-700 transition-colors duration-150 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800";
  const setaInativa = `${seta} pointer-events-none opacity-40`;
  const numero =
    "flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:text-gray-300 dark:hover:bg-gray-800";

  return (
    <nav className="flex items-center justify-center gap-1.5 pt-6" aria-label="Paginação">
      {pagina > 1 ? (
        <Link href={href(pagina - 1)} className={seta} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </Link>
      ) : (
        <span className={setaInativa} aria-hidden="true">
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </span>
      )}

      {janelaDePaginas(pagina, totalPaginas).map((item, i) =>
        item === "…" ? (
          <span key={`vao-${i}`} className="px-1 text-sm text-gray-400 dark:text-gray-500" aria-hidden="true">
            …
          </span>
        ) : item === pagina ? (
          editando ? (
            <input
              key="atual"
              ref={campoRef}
              type="text"
              inputMode="numeric"
              autoFocus
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value.replace(/\D/g, ""))}
              onBlur={confirmar}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmar();
                if (e.key === "Escape") setEditando(false);
              }}
              aria-label={`Ir para a página (1 a ${totalPaginas})`}
              className="h-9 w-14 rounded-full border border-primary bg-white text-center text-sm font-semibold text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:bg-gray-900 dark:text-gray-50"
            />
          ) : (
            <button
              key="atual"
              type="button"
              onClick={() => {
                setRascunho(String(pagina));
                setEditando(true);
              }}
              aria-current="page"
              aria-label={`Página ${pagina} de ${totalPaginas}. Clique para digitar outra página.`}
              className={`${numero} bg-primary text-white hover:bg-primary hover:opacity-90 dark:text-white`}
            >
              {pagina}
            </button>
          )
        ) : (
          <Link key={item} href={href(item)} className={numero} aria-label={`Página ${item}`}>
            {item}
          </Link>
        ),
      )}

      {pagina < totalPaginas ? (
        <Link href={href(pagina + 1)} className={seta} aria-label="Próxima página">
          <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </Link>
      ) : (
        <span className={setaInativa} aria-hidden="true">
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </span>
      )}
    </nav>
  );
}

/**
 * Quais números aparecem: sempre a primeira, a última, a atual e uma vizinha de cada lado,
 * com "…" no lugar do que foi omitido. Com 21 páginas, listar todas encheria a linha e no
 * celular quebraria em três fileiras de números.
 */
function janelaDePaginas(atual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const paginas = new Set<number>([1, total, atual]);
  if (atual - 1 > 1) paginas.add(atual - 1);
  if (atual + 1 < total) paginas.add(atual + 1);
  // Perto das pontas, completa para o mesmo comprimento — senão a linha encolhe e os
  // números dançam de posição ao navegar.
  if (atual <= 3) [2, 3, 4].forEach((p) => p < total && paginas.add(p));
  if (atual >= total - 2) [total - 1, total - 2, total - 3].forEach((p) => p > 1 && paginas.add(p));

  const ordenadas = [...paginas].sort((a, b) => a - b);
  const saida: (number | "…")[] = [];
  ordenadas.forEach((p, i) => {
    if (i > 0 && p - ordenadas[i - 1] > 1) saida.push("…");
    saida.push(p);
  });
  return saida;
}
