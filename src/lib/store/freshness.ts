import { DEFAULT_TIMEZONE, resolveTimeZone } from "@/lib/time/store-timezone";

/**
 * "Atualizado há X" do cartão de perfil da vitrine.
 *
 * NÃO reusa `formatRelativeTime` (src/lib/dashboard/format-relative-time.ts)
 * de propósito: aquele passa a mostrar data e hora exatas depois de 24h,
 * porque no painel o revendedor precisa saber QUANDO um pedido chegou. Aqui
 * é o oposto — "07/08/2026 14:32" não diz nada ao cliente final, enquanto
 * "há 2 dias" responde na hora a pergunta que ele realmente tem: esta loja
 * ainda está viva?
 *
 * A diferença é contada em DIAS DE CALENDÁRIO no fuso da loja, não em
 * blocos de 24 horas. Uma edição feita ontem às 23h precisa dizer "ontem"
 * mesmo às 8h de hoje — pela conta de 24h ela ainda seria "hoje", que é
 * falso para qualquer pessoa lendo.
 *
 * Devolve `null` quando não há nada publicado: o cartão simplesmente não
 * renderiza o número, em vez de inventar "há 0 dias".
 */
export function formatStoreFreshness(
  iso: string | null,
  timeZone: string | null = DEFAULT_TIMEZONE
): string | null {
  if (!iso) return null;

  const zone = resolveTimeZone(timeZone);
  const updated = new Date(iso);
  if (Number.isNaN(updated.getTime())) return null;

  const days = civilDaysBetween(updated, new Date(), zone);

  // Futuro só acontece com relógio de servidor adiantado ou dado corrompido.
  // Tratar como "hoje" é a leitura menos errada — "há -1 dias" seria um bug
  // visível na vitrine pública de um cliente.
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;

  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "há 1 semana";
  if (weeks < 5) return `há ${weeks} semanas`;

  const months = Math.floor(days / 30);
  if (months <= 1) return "há 1 mês";
  if (months < 12) return `há ${months} meses`;

  const years = Math.floor(days / 365);
  return years === 1 ? "há 1 ano" : `há ${years} anos`;
}

/**
 * Dias de calendário entre duas datas, no fuso informado. Compara as chaves
 * civis (`AAAA-MM-DD`) em vez de subtrair timestamps, que é o que garante a
 * contagem por virada de meia-noite local e não por múltiplos de 24h.
 */
function civilDaysBetween(from: Date, to: Date, timeZone: string): number {
  const key = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "01";
    return Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")));
  };

  return Math.round((key(to) - key(from)) / 86_400_000);
}
