"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ShareVitrineButton } from "@/components/share-vitrine-button";
import { InstagramIcon } from "@/components/icons/instagram-icon";
import { instagramProfileUrl } from "@/lib/social/instagram";
import { buildStoreUrl } from "@/lib/slug/store-url";
import { getContrastTextColor } from "@/lib/color/contrast";
import { ImageWithFallback } from "./image-with-fallback";

/** Altura da barra. Casada com o `top-14` da barra de filtros — se mudar aqui, muda lá. */
export const STICKY_BAR_HEIGHT_PX = 56;

export type StoreStickyBarProps = {
  name: string;
  slug: string;
  logoUrl: string | null;
  accentColor: string | null;
  instagram: string | null;
};

/**
 * O cartão de perfil ENCOLHIDO: barra fina que aparece quando o cartão
 * grande sai de vista.
 *
 * POR QUE ELA EXISTE
 *
 * Sem ela, quem rola dois produtos perde de vez a identidade da loja — e
 * perde junto o compartilhar e o Instagram, que só existiam lá em cima. Nas
 * referências o botão de ação acompanha o perfil o tempo todo; aqui ele
 * acompanha a rolagem.
 *
 * COMO NÃO BRIGA COM A BARRA DE FILTROS
 *
 * A vitrine já tinha um elemento grudado no topo (busca + gavetas). Dois
 * elementos disputando `top: 0` se sobrepõem e quebram os dois. A solução é
 * empilhar: esta barra é `fixed` no topo, e a de filtros passa a grudar em
 * `top-14` — exatamente a altura desta. Uma coreografia só, não duas
 * independentes.
 *
 * `fixed` e NÃO `sticky`: `sticky` exigiria que ela ocupasse altura no fluxo
 * o tempo todo, deixando uma faixa vazia de 56px acima da capa desde o
 * primeiro quadro. Fora do fluxo, ela não custa nada enquanto está escondida.
 *
 * O gatilho é um sentinela de 1px renderizado por ESTE componente, logo
 * abaixo do cartão. Um `IntersectionObserver` sobre ele em vez de um listener
 * de scroll: não dispara a cada pixel rolado, que é o que trava celular
 * fraco em 4G — a mesma disciplina que a barra de filtros já usa.
 */
export function StoreStickyBar({ name, slug, logoUrl, accentColor, instagram }: StoreStickyBarProps) {
  const [visible, setVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const accent = accentColor ?? "#0D21A1";
  const isDarkText = getContrastTextColor(accent) === "dark";

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // `boundingClientRect.top < 0` distingue "saiu por cima" (rolou para
        // baixo, a barra deve aparecer) de "ainda não chegou". Sem essa
        // checagem, o sentinela fora de vista ABAIXO da dobra — o estado
        // inicial em telas curtas — também acionaria a barra, e ela nasceria
        // visível sobrepondo o cartão grande.
        setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />

      <div
        // `aria-hidden` enquanto escondida: ela é uma DUPLICATA do cartão
        // acima, então um leitor de tela anunciaria o nome da loja duas vezes
        // na mesma página. Escondida, ela não existe para ninguém.
        aria-hidden={!visible}
        style={{ backgroundColor: accent, height: STICKY_BAR_HEIGHT_PX }}
        className={clsx(
          "fixed inset-x-0 top-0 z-40 flex items-center gap-3 px-4 shadow-[0_1px_0_0_rgb(0_0_0/0.08),0_8px_20px_-8px_rgb(0_0_0/0.25)] sm:px-6 md:px-12 lg:px-20 xl:px-24 2xl:px-28",
          // `motion-reduce:transition-none` e não a supressão global do
          // globals.css: aqui o movimento é a própria informação de que a
          // barra chegou, então quem pediu menos movimento recebe o estado
          // final imediato, nunca um elemento que aparece do nada no meio da
          // tela.
          "transition-[transform,opacity] duration-[260ms] ease-[var(--vt-drawer-ease)] motion-reduce:transition-none",
          visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0"
        )}
      >
        {/* Mesmo teto e mesma linha vertical do cabeçalho e da grade (ver
            page.tsx): a barra fixa é a continuação do cabeçalho quando ele
            sai de cena. */}
        <div className="mx-auto flex w-full max-w-[100rem] items-center gap-3">
          <div
            className={clsx(
              "relative h-9 w-9 shrink-0 overflow-hidden rounded-full",
              isDarkText ? "bg-black/10" : "bg-white/20"
            )}
          >
            <ImageWithFallback src={logoUrl} alt="" />
          </div>

          {/* `truncate` + `min-w-0`: nome longo de loja em celular estreito
              precisa cortar, nunca empurrar as ações para fora da tela. */}
          <span
            className={clsx(
              "min-w-0 flex-1 truncate font-display text-base font-bold tracking-tight",
              isDarkText ? "text-gray-900" : "text-white"
            )}
          >
            {name}
          </span>

          <div className="flex shrink-0 items-center gap-1">
            <ShareVitrineButton
              url={buildStoreUrl(slug)}
              storeName={name}
              label={null}
              ariaLabel={`Compartilhar a vitrine de ${name}`}
              // `tabIndex={-1}` acompanha o estado escondido pelo mesmo motivo
              // do `aria-hidden`: sem isso, quem navega por Tab no topo da
              // página cai num botão invisível.
              className={clsx(
                "flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-150 disabled:opacity-60",
                isDarkText
                  ? "text-gray-900 hover:bg-black/10 focus-visible:ring-gray-900/40"
                  : "text-white hover:bg-white/20 focus-visible:ring-white/60",
                "focus-visible:outline-none focus-visible:ring-2"
              )}
            />
            {instagram && (
              <a
                href={instagramProfileUrl(instagram)}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={visible ? undefined : -1}
                aria-label={`Instagram de ${name}`}
                className={clsx(
                  "flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-150",
                  isDarkText
                    ? "text-gray-900 hover:bg-black/10 focus-visible:ring-gray-900/40"
                    : "text-white hover:bg-white/20 focus-visible:ring-white/60",
                  "focus-visible:outline-none focus-visible:ring-2"
                )}
              >
                <InstagramIcon className="h-[18px] w-[18px]" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
