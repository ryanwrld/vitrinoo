"use client";

import { useSyncExternalStore } from "react";

/**
 * Extraído de `product-order-panel.tsx` (T-05-11), único consumidor atual —
 * mantido como hook à parte (não inline no componente) porque a mesma regra
 * de "aba nova só em desktop com mouse" se aplica a qualquer CTA de WhatsApp
 * futuro na vitrine, sem arriscar duas cópias divergirem silenciosamente
 * (ex.: alguém ajusta o breakpoint num lugar e esquece do outro).
 *
 * Aparelho com mouse e tela larga é a ÚNICA situação em que abrir o WhatsApp
 * numa aba NOVA é melhor que na mesma aba: `pointer: fine` é o teste que
 * importa, não a largura — o navegador in-app do Instagram/WhatsApp (canal
 * principal de tráfego da vitrine) é sempre `pointer: coarse`, e é
 * justamente ele que lida mal com um novo contexto de navegação. A largura
 * entra só como segunda condição, pra não pegar um tablet grande com caneta.
 *
 * Esta é uma das poucas exceções deliberadas de detecção de aparelho em JS
 * da vitrine: `target` é atributo HTML, não estilo, então não existe forma
 * de expressar isso em CSS puro.
 */
const DESKTOP_POINTER_QUERY = "(min-width: 768px) and (pointer: fine)";

/**
 * `useSyncExternalStore` e não `useState` + efeito: o snapshot do servidor é
 * `false`, ou seja, o HTML sempre chega com o comportamento SEGURO (mesma
 * aba) e só vira aba nova depois da hidratação, num aparelho que já provou
 * ser desktop. O caminho errado nunca aparece, nem por um quadro.
 */
export function useOpensInNewTab(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mediaQuery = window.matchMedia(DESKTOP_POINTER_QUERY);
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP_POINTER_QUERY).matches,
    () => false
  );
}
