/**
 * Extraído de `dashboard/page.tsx` pra ser reaproveitado por `/admin/dashboard/notificacoes`
 * e `notification-bell.tsx` — mesmo formato, uma única fonte de verdade.
 *
 * Só os primeiros minutos/horas ficam relativos ("há 23 min", "há 23h") —
 * a partir de 24h, mostra data e hora exatas em vez de "há Xd": contar
 * "quantos dias atrás foi isso" exige o lojista fazer conta de cabeça (ou
 * checar o calendário) toda vez que revisita um evento antigo.
 *
 * `America/Sao_Paulo` é fixo de propósito: o servidor (Vercel) roda em UTC,
 * então sem isso um evento das 23h de Brasília apareceria com a data do dia
 * seguinte — e o app é exclusivamente pt-BR/BRT.
 */
const EXACT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatExactDateTime(iso: string): string {
  const parts = EXACT_DATE_TIME_FORMATTER.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return formatExactDateTime(iso);
}
