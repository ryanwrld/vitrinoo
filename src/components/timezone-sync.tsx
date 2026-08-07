"use client";

import { startTransition, useEffect } from "react";
import { syncStoreTimezone } from "@/lib/settings/timezone-actions";

/**
 * Mantém `stores.timezone` alinhado ao fuso do aparelho onde o revendedor
 * está usando o painel. Montado no layout de `(painel)` — ou seja, existe
 * SOMENTE no admin autenticado; a vitrine pública `/[slug]` nunca carrega
 * este componente nem a Server Action que ele chama.
 *
 * Roda a cada abertura do painel, sem trava de "só uma vez" (pedido
 * explícito do usuário: quem viaja quer o painel acompanhando). Como o
 * UPDATE só é disparado quando o fuso mudou de fato, a visita comum não
 * escreve nada — a comparação acontece aqui e é reconferida no servidor.
 *
 * `startTransition` fire-and-forget, mesmo padrão dos trackers da vitrine:
 * o resultado é ignorado e nada na tela espera por ele. Fuso é conveniência
 * de exibição — não pode atrasar nem derrubar o carregamento do painel.
 */
export function TimezoneSync({ currentTimezone }: { currentTimezone: string }) {
  useEffect(() => {
    // `resolvedOptions().timeZone` pode vir vazio em navegadores antigos;
    // nesse caso não há o que sincronizar e a loja mantém o valor atual.
    const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!deviceTimezone || deviceTimezone === currentTimezone) return;

    startTransition(() => {
      syncStoreTimezone(deviceTimezone).catch(() => {});
    });
  }, [currentTimezone]);

  return null;
}
