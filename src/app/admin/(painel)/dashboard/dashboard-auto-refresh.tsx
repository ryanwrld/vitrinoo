"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 10_000;

/**
 * Mantém o placar do dia, o feed de atividade e os rankings de tendência
 * sempre correntes enquanto o revendedor deixa a aba do dashboard aberta —
 * sem isso, os números só atualizavam numa navegação/reload manual.
 *
 * `router.refresh()` (não `location.reload()`) re-executa o Server
 * Component da página — o MESMO `Promise.all` que já busca
 * today/feed/rankings juntos — sem perder scroll/estado local e sem
 * duplicar as queries num client fetch à parte.
 *
 * Pausa via `visibilitychange` quando a aba não está visível: evita gastar
 * requisições/egress com uma aba minimizada ou em outra tela, mesma
 * disciplina de custo já aplicada no restante do projeto (RESEARCH.md,
 * "nunca Realtime por padrão" — polling simples é suficiente aqui, e único
 * ponto de decisão fica neste componente, não espalhado).
 */
export function DashboardAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    };
    const stop = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);

  return null;
}
