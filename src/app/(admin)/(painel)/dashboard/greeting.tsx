"use client";

import { useEffect, useState } from "react";

/**
 * Saudação dinâmica por período do dia — "Bom dia, Lojista!" / "Boa tarde,
 * Empreendedor!" / "Boa noite, Guerreiro!". Client Component de propósito:
 * o Dashboard é um Server Component, então o servidor só conhece o fuso
 * horário DELE, nunca o do visitante (Brasília, Manaus, ou qualquer outro
 * país) — só o navegador sabe a hora local de verdade. `getHours()` sem
 * nenhum argumento de fuso já resolve isso sozinho, sem precisar mapear
 * timezone manualmente.
 *
 * Primeiro render usa "Dashboard" (mesmo texto/classe de antes) até o
 * `useEffect` calcular a saudação real no cliente — evita divergência
 * entre o HTML gerado no servidor e o do navegador (hydration mismatch).
 * Um intervalo de 60s reavalia a hora, então a saudação troca sozinha se
 * o revendedor deixar a aba aberta atravessando 12h/18h, sem precisar
 * recarregar a página.
 */
function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Bom dia, Lojista!";
  if (hour >= 12 && hour < 18) return "Boa tarde, Empreendedor!";
  return "Boa noite, Guerreiro!";
}

export function Greeting() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setText(greetingForHour(new Date().getHours()));
    update();
    const intervalId = setInterval(update, 60_000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <h1 className="font-display text-2xl leading-tight font-extrabold text-gray-900 dark:text-gray-50">{text ?? "Dashboard"}</h1>
  );
}
