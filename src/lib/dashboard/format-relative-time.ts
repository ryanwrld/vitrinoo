import { DEFAULT_TIMEZONE, resolveTimeZone } from "@/lib/time/store-timezone";

/**
 * Extraído de `dashboard/page.tsx` pra ser reaproveitado por `/admin/dashboard/notificacoes`
 * e `notification-bell.tsx` — mesmo formato, uma única fonte de verdade.
 *
 * Só os primeiros minutos/horas ficam relativos ("há 23 min", "há 23h") —
 * a partir de 24h, mostra data e hora exatas em vez de "há Xd": contar
 * "quantos dias atrás foi isso" exige o lojista fazer conta de cabeça (ou
 * checar o calendário) toda vez que revisita um evento antigo.
 *
 * Um fuso EXPLÍCITO é obrigatório aqui: o servidor (Vercel) roda em UTC, e
 * sem ele um evento das 23h apareceria com a data do dia seguinte. Era fixo
 * em `America/Sao_Paulo`; agora recebe o fuso da loja (migration 0013),
 * porque o Brasil tem três fusos continentais e um revendedor de Roraima
 * (UTC-4) via os horários deslocados em uma hora. O parâmetro é OPCIONAL e
 * cai em São Paulo — todo chamador que ainda não passa fuso mantém
 * exatamente o comportamento anterior.
 */
function formatExactDateTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

export function formatRelativeTime(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return formatExactDateTime(iso, resolveTimeZone(timeZone));
}
