"use server";

import { createClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/time/store-timezone";

/**
 * Sincroniza `stores.timezone` (migration 0013) com o fuso do aparelho de
 * onde o revendedor está acessando o painel.
 *
 * POR QUE EXISTE, além da detecção no onboarding: aquela só roda na criação
 * da loja, então toda loja anterior à 0013 ficaria presa no default
 * (America/Sao_Paulo) para sempre — inclusive a do próprio dono do produto,
 * que é de Roraima. Sem isto, "detecção automática" só valeria para quem se
 * cadastrasse dali em diante.
 *
 * DELIBERADAMENTE SEM TRAVA de "só na primeira vez" (pedido explícito do
 * usuário: "caso eu vá viajar, não quero nada fixo"). Toda abertura do
 * painel reconcilia — quem viaja vê as métricas no fuso onde está.
 *
 * Escrita só acontece quando o valor MUDA: a comparação é feita no cliente
 * (timezone-sync.tsx) e reconferida aqui, então a visita comum ao painel não
 * gera UPDATE nenhum.
 *
 * Segurança: escopo do dono via `owner_id = auth.uid()` no próprio filtro,
 * nunca aceitando um storeId do cliente (mesma disciplina de `getOwnedStore`
 * em products/actions.ts). O único dado vindo do cliente é a string do
 * fuso, validada contra o motor de datas antes de tocar no banco. Falha em
 * silêncio: fuso é conveniência de exibição e nunca pode derrubar o
 * carregamento do painel.
 */
export async function syncStoreTimezone(timezone: string): Promise<void> {
  try {
    if (!isValidTimeZone(timezone)) return;

    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    await supabase
      .from("stores")
      .update({ timezone })
      .eq("owner_id", userData.user.id)
      .neq("timezone", timezone);
  } catch {
    // Silencioso de propósito — ver docblock.
  }
}
