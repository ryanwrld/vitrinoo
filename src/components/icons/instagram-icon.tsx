import type { SVGProps } from "react";

/**
 * Glifo do Instagram desenhado à mão.
 *
 * O `lucide-react` 1.x REMOVEU os ícones de marca (`Instagram`, `Facebook`,
 * etc.) — importar dali quebra o build. Trazer uma biblioteca inteira de
 * ícones de marca só por causa deste símbolo seria peso desproporcional, e a
 * versão oficial do Instagram é um asset colorido com regras próprias de uso
 * que não combina com o resto da interface.
 *
 * Então: mesma grade de 24, mesmo `stroke-width: 2`, mesmas pontas
 * arredondadas e `currentColor` do lucide, para ele conviver sem destoar ao
 * lado dos outros ícones do projeto (`Share2`, `ChevronDown`…).
 */
export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      {/* Ponto do flash: um traço de comprimento zero com ponta arredondada
          vira um círculo cheio — o mesmo recurso que o lucide usa nos seus
          próprios ícones com pontos. */}
      <path d="M17.5 6.5h.01" />
    </svg>
  );
}
