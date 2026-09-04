/**
 * As três ilustrações do carrossel de abertura do fluxo de precificação.
 *
 * DESENHO PLANO, sem foto: elas ilustram o que vai acontecer (definir preço, ter a vitrine
 * pronta, receber o pacote), e foto de chuteira aqui competiria com as fotos de verdade que
 * o lojista vê dois segundos depois. Portadas do protótipo aprovado.
 *
 * `viewBox` sem `width`/`height` fixos: o palco é fluido (encolhe no celular) e o SVG
 * acompanha por CSS. No protótipo os atributos existiam e o palco não podia crescer sem a
 * ilustração ficar boiando pequena dentro dele.
 *
 * As cores são as do painel escuro — este fluxo só existe dentro do pop-up, que herda o
 * fundo do card. Escrevê-las por token seria mais bonito e mais frágil: `currentColor` não
 * alcança oito preenchimentos diferentes num desenho, e um `var()` por retângulo geraria
 * oito tokens que só esta tela usa.
 */

const A = "#3140C4"; // primário vivo
const A2 = "#5C6BDA";
const B = "#1c1e2c"; // linha2
const C = "#292C3D"; // linha
const E = "#9CA3BE"; // txt2
const F = "#F7F8FB"; // txt

/** Chuteira em traço, reaproveitada nas três ilustrações. */
function Bota({ x, y, s, cor }: { x: number; y: number; s: number; cor: string }) {
  return (
    <g
      transform={`translate(${x},${y}) scale(${s})`}
      fill="none"
      stroke={cor}
      strokeWidth="2.4"
      strokeLinejoin="round"
    >
      <path d="M2 15c-.4-2 .6-3.2 2.8-3.8l11-3.2c1.5-.5 2.6-1.1 3.5-2l1.7-1.7c1.5-1.5 3.7-1.6 5.3-.3 1.8 1.5 2.8 3.6 2.8 6v3.6c0 .8-.7 1.5-1.5 1.5H3.5c-.8 0-1.4-.5-1.5-1.2z" />
      <path d="M5.5 17v2.2M11.5 17v2.2M18 17v2.2M24.5 17v2.2M29.5 17v2.2" strokeLinecap="round" />
    </g>
  );
}

const CAIXA = "h-full w-full";

/** 1. PRECIFICAR — cartão com o campo de preço sendo preenchido. */
function Precificar() {
  return (
    <svg viewBox="0 0 300 176" className={CAIXA} aria-hidden="true">
      <rect x="30" y="18" width="240" height="140" rx="16" fill={B} />
      <rect x="46" y="34" width="208" height="108" rx="13" fill="#191b28" stroke={C} />
      <g opacity=".9">
        <Bota x={64} y={58} s={1.05} cor={E} />
      </g>
      <rect x="64" y="86" width="72" height="7" rx="3.5" fill={C} />
      <rect x="64" y="99" width="46" height="6" rx="3" fill={B} stroke={C} />
      <rect x="158" y="60" width="82" height="34" rx="9" fill="none" stroke={A} strokeWidth="2" />
      <text x="169" y="82" fontFamily="Inter" fontSize="12" fontWeight="600" fill="#575E7D">
        R$
      </text>
      <rect x="190" y="68" width="30" height="18" rx="3" fill={A2} opacity=".85" />
      {/* O cursor piscando é o que faz a cena ler como "sendo preenchido agora" em vez de
          um campo já preenchido. `<animate>` do próprio SVG: não precisa de JS nem entra
          na conta de re-render do React. */}
      <rect x="226" y="66" width="2" height="22" rx="1" fill={A2}>
        <animate attributeName="opacity" values="1;0;1" dur="1.3s" repeatCount="indefinite" />
      </rect>
      <path d="M160 116h34M160 128h58" stroke={C} strokeWidth="5" strokeLinecap="round" />
      <g transform="translate(226,110)">
        <circle r="15" fill={A} opacity=".18" />
        <path
          d="M-6 4 L0 -5 L6 4"
          fill="none"
          stroke={A2}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** 2. CATÁLOGO — a vitrine em grade. */
function Vitrine() {
  return (
    <svg viewBox="0 0 300 176" className={CAIXA} aria-hidden="true">
      <rect x="52" y="12" width="196" height="152" rx="18" fill={B} />
      <rect x="66" y="26" width="168" height="124" rx="13" fill="#191b28" stroke={C} />
      <rect x="80" y="38" width="46" height="7" rx="3.5" fill={C} />
      <rect x="80" y="52" width="140" height="9" rx="4.5" fill={B} stroke={C} />
      {[0, 1, 2, 3].map((k) => {
        const cx = 80 + (k % 2) * 72;
        const cy = 72 + Math.floor(k / 2) * 38;
        return (
          <g key={k}>
            <rect x={cx} y={cy} width="60" height="30" rx="8" fill={B} stroke={C} />
            <g opacity=".75">
              <Bota x={cx + 8} y={cy + 8} s={0.62} cor={k === 0 ? A2 : E} />
            </g>
            <rect x={cx + 8} y={cy + 22} width="24" height="4" rx="2" fill={C} />
          </g>
        );
      })}
      <circle cx="150" cy="158" r="3" fill={C} />
    </svg>
  );
}

/** 3. PACOTE — a pilha de fichas, com a contagem do que está entrando. */
function Pacote({ total }: { total: number }) {
  return (
    <svg viewBox="0 0 300 176" className={CAIXA} aria-hidden="true">
      <rect
        x="72"
        y="42"
        width="156"
        height="96"
        rx="15"
        fill={B}
        opacity=".55"
        transform="rotate(-7 150 90)"
      />
      <rect
        x="72"
        y="38"
        width="156"
        height="96"
        rx="15"
        fill="#171927"
        transform="rotate(-3.5 150 86)"
        stroke={C}
      />
      <rect x="72" y="34" width="156" height="98" rx="15" fill="#191b28" stroke={A} strokeOpacity=".55" />
      <Bota x={94} y={58} s={1.5} cor={A2} />
      <rect x="94" y="98" width="66" height="7" rx="3.5" fill={C} />
      <rect x="94" y="111" width="40" height="6" rx="3" fill={B} stroke={C} />
      <g transform="translate(198,104)">
        <circle r="16" fill={A} />
        {/* A contagem é o argumento da tela, então vem do conjunto real que está entrando —
            990 para quem comprou o pacote, 10 para quem sorteou. Fixar "990" aqui mentiria
            para metade dos usuários do fluxo. */}
        <text
          y="4.5"
          textAnchor="middle"
          fontFamily="Manrope"
          fontSize={total >= 100 ? 11 : 13}
          fontWeight="800"
          fill={F}
        >
          {total}
        </text>
      </g>
    </svg>
  );
}

export function ilustracoesDoFluxo(total: number) {
  return [
    { titulo: "Você define o preço", desenho: <Precificar /> },
    { titulo: "Sua vitrine, pronta", desenho: <Vitrine /> },
    {
      titulo: `${total} ${total === 1 ? "chuteira" : "chuteiras"} entrando na loja`,
      desenho: <Pacote total={total} />,
    },
  ];
}
