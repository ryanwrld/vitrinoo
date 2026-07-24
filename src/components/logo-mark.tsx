/**
 * LogoMark — símbolo SVG do Vitrinoo.
 * Conceito: vitrine de loja — um "V" formado por duas prateleiras em perspectiva
 * leve dentro de um quadrado arredondado azul de marca.
 * Funciona em todos os tamanhos (sidebar 28px, auth 30px, etc).
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="28" height="28" rx="7" fill="#0D21A1" />
      {/* Prateleira superior esquerda → centro */}
      <path
        d="M6 9.5L14 13.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Prateleira superior direita → centro */}
      <path
        d="M22 9.5L14 13.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Haste vertical do V */}
      <path
        d="M14 13.5V19.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Pequeno detalhe: ponto de destaque na prateleira inferior (produto em vitrine) */}
      <circle cx="14" cy="19.5" r="1.5" fill="rgba(255,255,255,0.55)" />
    </svg>
  );
}

/**
 * LogoFull — símbolo + wordmark lado a lado.
 * Usar na sidebar e nos layouts de auth.
 */
export function LogoFull({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <LogoMark size={size} />
      <span className="font-display text-lg font-extrabold text-gray-900">
        Vitrinoo
      </span>
    </div>
  );
}
