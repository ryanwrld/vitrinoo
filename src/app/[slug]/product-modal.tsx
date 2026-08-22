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
        // `md:max-h-[552px]` — SÓ desktop, decisão do usuário (2026-08-20/
        // 21). `px` fixo não escala com a tela (ao contrário de `dvh`, que
        // num monitor grande de verdade dá folga de sobra e deixa a
        // descrição inteira caber em vez de cortar). Valor calibrado junto
        // com a largura da foto (`md:w-1/2`, product-order-panel.tsx — a
        // foto é quadrada, então largura ≈ altura): 24px de padding-top do
        // painel + ~488px de foto + margem. Os +12px por cima do que a
        // conta fechava (540px) são de propósito — produto SEM descrição
        // media 543px de conteúdo real contra um teto de 540px (folga do
        // `aspect-square`/flex fica 3-7px "solta" por arredondamento de
        // sub-pixel), e o `overflow-y-auto` do painel, corretíssimo,
        // liberava scroll por causa desses poucos pixels — sem NENHUM
        // motivo real pro usuário rolar (2026-08-21: "scroll só quando
        // tiver elemento que precise, senão desativado"). Com folga, esse
        // caso fecha sem sobra nenhuma; a descrição longa continua exigindo
        // rolagem normalmente, o comportamento CONDICIONAL de sempre do
        // `overflow-y-auto` (never `overflow-y-scroll`) — mostra a barra
        // SÓ quando o conteúdo realmente excede, nunca por padrão. Acima
        // do teto, a descrição nunca aparece sem rolar, em
        // NENHUM tamanho de monitor — a rolagem que já existe dentro do
        // painel (`product-order-panel.tsx`, overflow-y-auto) cobre o
        // resto, sem segunda barra. Mobile (`max-h-[92dvh]`, sem `md:`)
        // não muda.
        //
        // `min-[1280px]:max-[1599px]:max-w-[950px] min-[1600px]:max-w-5xl`
        // — decisão do usuário (2026-08-20): notebooks reais (MacBook
        // 1470×956 e parecidos, faixa 1280-1599px) caíam no MESMO
        // `xl:max-w-5xl` (1024px) que um monitor 4K de verdade — o popup
        // ficava do tamanho de monitor grande dentro de uma tela de
        // notebook. Faixa nova só pra esse intervalo, um pouco menor
        // (950px, ~439px de foto em vez de ~481px); monitores grandes de
        // verdade (≥1600px) continuam no `max-w-5xl` de sempre, sem
        // mudança nenhuma. TODAS as faixas de largura usam
        // `min-[...]:max-[...]:` arbitrário, nunca `lg:`/`xl:` nomeado
        // junto: são intervalos SEM sobreposição, então a ordem de
        // geração do CSS do Tailwind não pode causar a regra errada
        // ganhando a cascata. Descobri isso na prática, testando ao vivo:
        // o Tailwind sempre põe breakpoints NOMEADOS (`lg:`, `xl:`) DEPOIS
        // dos arbitrários no arquivo gerado, não importa o valor em px —
        // `lg:max-w-4xl` (sem teto superior) vencia em TODAS as larguras
        // acima de 1024px, até nas faixas que deviam usar 950px ou
        // max-w-5xl. Convertendo TUDO pra arbitrário isso some.
        className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-xl outline-none md:max-h-[552px] md:rounded-[2rem] min-[1024px]:max-[1279px]:max-w-4xl min-[1280px]:max-[1599px]:max-w-[950px] min-[1600px]:max-w-5xl"
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
