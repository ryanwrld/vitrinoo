"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { lockScroll } from "@/lib/ui/scroll-lock";

/**
 * Shell do diálogo do detalhe de produto aberto sobre a vitrine — controlado
 * pelo query param `?produto=<id>` na própria `/[slug]/page.tsx` (D-01,
 * revisado), não por rota interceptada/paralela do Next. A primeira versão
 * usava `@modal/(.)[produto]` (parallel + intercepting routes); esse padrão
 * corrompia a árvore de rotas do app INTEIRO no App Router do Next 16 —
 * reproduzido em build de produção isolado, com navegação client-side em
 * `/admin/*` (segmento sem NENHUMA relação com `/[slug]`) devolvendo 404
 * fantasma. Query param é o caminho chato mas comprovadamente seguro.
 *
 * Fechar remove `produto` da URL via `router.push` (nunca `router.back()`):
 * um visitante pode chegar direto num link compartilhado
 * `/[slug]?produto=X` sem entrada anterior no histórico — `back()) nesse
 * caso sairia do site inteiro em vez de voltar pro grid.
 *
 * NÃO usa `<dialog showModal()>`: o `::backdrop` nativo e o top-layer
 * brigam com o `position: fixed` do CTA da versão página e têm suporte
 * irregular nos webviews in-app (Instagram/WhatsApp) que são o canal
 * principal de tráfego da vitrine — um overlay `fixed` comum é o caminho
 * previsível em todos eles. Foco, Escape e trava de scroll são portanto
 * responsabilidade explícita deste componente.
 */
export function ProductModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("produto");
    const query = nextParams.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  // Trava o scroll do grid atrás do modal, em efeito próprio e com
  // dependências vazias: dividir efeito com o listener de Escape faria a trava
  // ser desfeita e refeita toda vez que `close` mudasse de identidade, e cada
  // ciclo desses é um salto de 15px no layout (a barra de rolagem some e
  // volta). `lockScroll` também compensa essa largura — ver
  // src/lib/ui/scroll-lock.ts.
  useEffect(() => lockScroll(), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:items-center md:p-6"
      onClick={close}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes do produto"
        tabIndex={-1}
        // Cliques dentro do card nunca devem borbulhar até o overlay e
        // fechar o modal no meio da escolha de tamanho.
        onClick={(event) => event.stopPropagation()}
        className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-xl outline-none md:max-h-[88dvh] md:rounded-[2rem] lg:max-w-4xl xl:max-w-5xl"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Fechar"
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-600 shadow-sm transition-colors duration-150 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        {children}
      </div>
    </div>
  );
}
