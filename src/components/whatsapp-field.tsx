"use client";

/**
 * Campo de WhatsApp — usado no onboarding E em Configurações.
 *
 * POR QUE UM COMPONENTE, E NÃO DOIS INPUTS PARECIDOS
 *
 * As duas telas pediam o mesmo dado em formatos diferentes: o onboarding
 * mostrava a máscara `(11) 99999-9999` (sem DDI) e Configurações devolvia
 * `5595984404479` cru. O revendedor cadastrava de um jeito e revia de outro,
 * sem nada explicando a diferença.
 *
 * O QUE A PESSOA VÊ vs. O QUE É SALVO
 *
 * Na tela: `+55` fixo à esquerda, fora da área editável, e `(95) 98440-4479`
 * dentro dela. No formulário: `5595984404479`, dígitos colados — que é o
 * ÚNICO formato que o link `wa.me` aceita.
 *
 * O `+55` sair da área editável não é enfeite: ele é obrigatório no link e
 * invisível como regra. Solto dentro do campo, era confundido com sobra e
 * apagado — e um número sem DDI gera um `wa.me` que não abre conversa
 * nenhuma, que é a falha mais cara deste produto.
 *
 * A linha "Prévia: ..." que existia embaixo saiu junto. Ela compensava a
 * ilegibilidade de 13 dígitos colados; com a máscara aplicada no próprio
 * campo, repetir o número embaixo virou ruído.
 */

const BR_COUNTRY_CODE = "55";
/** DDD (2) + celular com nono dígito (9). Fixos são até 8, e cabem no mesmo teto. */
const MAX_NATIONAL_DIGITS = 11;

/** Só os dígitos nacionais (sem o 55), a partir do valor salvo no formulário. */
export function toNationalDigits(stored: string): string {
  const digits = (stored ?? "").replace(/\D/g, "");
  const withoutCountry = digits.startsWith(BR_COUNTRY_CODE) ? digits.slice(2) : digits;
  return withoutCountry.slice(0, MAX_NATIONAL_DIGITS);
}

/** `5595984404479` — o formato que vai para o `wa.me`. */
export function toStoredValue(nationalDigits: string): string {
  const digits = nationalDigits.replace(/\D/g, "").slice(0, MAX_NATIONAL_DIGITS);
  return digits ? `${BR_COUNTRY_CODE}${digits}` : "";
}

/**
 * `(95) 98440-4479`, montado progressivamente enquanto digita.
 *
 * Formatação própria em vez de `AsYouType`: aqui o campo já não recebe o DDI,
 * e era justamente ele que fazia a lib agrupar `55 95 98440 4479` — lendo o
 * `55` como parte do número nacional por falta do `+`.
 */
export function formatNational(nationalDigits: string): string {
  const digits = nationalDigits.replace(/\D/g, "").slice(0, MAX_NATIONAL_DIGITS);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;

  const area = digits.slice(0, 2);
  const rest = digits.slice(2);
  // O corte do hífen segue o tamanho: 9 dígitos quebram em 5+4 (celular),
  // 8 quebram em 4+4 (fixo). Fixo é sempre 4+4 até completar.
  const splitAt = rest.length > 8 ? 5 : 4;

  return rest.length <= splitAt
    ? `(${area}) ${rest}`
    : `(${area}) ${rest.slice(0, splitAt)}-${rest.slice(splitAt)}`;
}

export type WhatsappFieldProps = {
  /** Valor atual do formulário (formato salvo: `55DDXXXXXXXXX`). */
  value: string;
  /** Recebe já no formato salvo, pronto para o `wa.me`. */
  onChange: (storedValue: string) => void;
  onBlur?: () => void;
  /** Classes do input, para cada tela manter a própria paleta. */
  inputClassName: string;
  /** Classes do prefixo `+55`. */
  prefixClassName: string;
  /** Classes do invólucro que desenha a borda. */
  wrapperClassName: string;
};

export function WhatsappField({
  value,
  onChange,
  onBlur,
  inputClassName,
  prefixClassName,
  wrapperClassName,
}: WhatsappFieldProps) {
  return (
    <div className={wrapperClassName}>
      <span className={prefixClassName} aria-hidden="true">
        +55
      </span>
      <input
        id="whatsapp"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        // O rótulo visível diz só "WhatsApp"; sem isto, um leitor de tela não
        // teria como saber que o campo já assume o código do Brasil.
        aria-label="WhatsApp, DDD e número (o código do Brasil já está incluído)"
        placeholder="(11) 99999-9999"
        value={formatNational(toNationalDigits(value))}
        onChange={(event) => onChange(toStoredValue(event.target.value))}
        onBlur={onBlur}
        className={inputClassName}
      />
    </div>
  );
}
