/**
 * Fuso horário por loja (migration 0013).
 *
 * Antes disso, todo cálculo de "dia" assumia `America/Sao_Paulo` fixo. O
 * Brasil tem TRÊS fusos continentais — UTC-3, UTC-4 (Roraima, Amazonas,
 * Rondônia, Mato Grosso, Mato Grosso do Sul) e UTC-5 (Acre) —, então para
 * um revendedor de Boa Vista o "hoje" do painel começava às 23h da noite
 * anterior no relógio dele, e um pedido das 23h30 aparecia como sendo do
 * dia seguinte.
 *
 * ESCOPO DELIBERADAMENTE LIMITADO AO PAINEL: este módulo é consumido apenas
 * pelo dashboard do revendedor. As Server Actions públicas (`logPageview`,
 * `logOrderClick`) seguem gravando a data de deduplicação em São Paulo, e a
 * vitrine `/[slug]` não importa nada daqui. A trava anti-duplicata só
 * precisa ser CONSISTENTE, não local — e manter a superfície pública
 * intocada era requisito explícito do usuário.
 *
 * Efeito residual conhecido e aceito: como a janela de deduplicação (São
 * Paulo) e a janela do painel (fuso da loja) não coincidem exatamente, uma
 * MESMA pessoa pode, em tese, contar duas vezes num mesmo "dia da loja" se
 * os dois acessos caírem em lados opostos da meia-noite de Brasília. É uma
 * fresta de 1h a 2h por dia, e o efeito é subcontar/sobrecontar em 1, nunca
 * perder dado.
 */

/** Fuso assumido quando a loja não tem um válido — o mesmo que valia para todo mundo antes da 0013. */
export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

/**
 * Valida um identificador IANA usando o próprio motor de datas do runtime,
 * em vez de uma lista fixa: a base de fusos muda com o tempo e uma lista
 * hardcoded envelheceria em silêncio. `Intl.DateTimeFormat` LANÇA
 * `RangeError` para identificador desconhecido — é essa exceção que serve
 * de validação.
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Normaliza qualquer entrada (nula, vazia, inválida) para um fuso utilizável. */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
}

/**
 * Deslocamento do fuso em relação ao UTC, em milissegundos, NO INSTANTE
 * dado. Calculado formatando o instante no fuso alvo e relendo os campos
 * como se fossem UTC — a diferença entre os dois é exatamente o offset.
 *
 * Recalcular por instante (em vez de fixar `-3h`) é o que faz isto valer
 * para fusos com horário de verão. O Brasil não observa desde 2019
 * (Decreto 9.826/2019), mas um revendedor pode legitimamente ter o
 * aparelho em outro país, e um offset fixo erraria por uma hora metade do
 * ano nesse caso.
 */
function timeZoneOffsetMs(timeZone: string, at: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(at)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  // `hour` volta como "24" à meia-noite em alguns runtimes com hour12:false.
  const hour = Number(parts.hour) % 24;

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );

  return asIfUtc - at.getTime();
}

/**
 * Instante UTC correspondente à meia-noite de hoje NO FUSO DA LOJA.
 * Substitui o antigo `startOfTodayBR` de metrics.ts, que tinha o offset
 * `-03:00` embutido.
 *
 * O offset é aplicado duas vezes de propósito: a primeira converte "agora"
 * para a parede do relógio local e zera as horas; a segunda reconfere o
 * offset JÁ NA MEIA-NOITE encontrada. Sem esse segundo passo, um fuso que
 * troca de offset entre o instante atual e a meia-noite (virada de horário
 * de verão) erraria por uma hora.
 */
export function startOfTodayInTimeZone(timeZone: string, referenceMs: number = Date.now()): Date {
  const zone = resolveTimeZone(timeZone);

  const firstOffset = timeZoneOffsetMs(zone, new Date(referenceMs));
  const local = new Date(referenceMs + firstOffset);
  local.setUTCHours(0, 0, 0, 0);

  const approximateUtc = local.getTime() - firstOffset;
  const settledOffset = timeZoneOffsetMs(zone, new Date(approximateUtc));

  return new Date(local.getTime() - settledOffset);
}
