"use client";

import { useState } from "react";
import type { Origem } from "@/lib/marketplace/pricing-actions";
import { AbrirFluxoPrecos } from "./marketplace/abrir-fluxo-precos";

/**
 * A precificação que o lojista está devendo, aberta sozinha e sem saída.
 *
 * O layout monta ISTO SEMPRE, mesmo quando não há pendência, e é este componente que
 * decide. A alternativa — o layout renderizar condicionalmente — tinha um defeito real: a
 * própria conclusão quita a pendência no banco, o `revalidatePath` da Server Action fazia o
 * servidor reavaliar, a condição virava falsa e o fluxo era DESMONTADO no instante em que a
 * tela de sucesso deveria aparecer. O confete nunca chegava a existir.
 *
 * Por isso a origem é CONGELADA na primeira vez que aparece: depois disso, quem tira o
 * fluxo da tela é o lojista clicando em "Ver meus produtos", não o servidor.
 *
 * Não existe X, Esc nem clique no fundo. A pendência vive em `stores`
 * (`sample_pricing_started_at` / `pack_imported_at`), então recarregar, sair da conta ou
 * abrir em outro aparelho traz o fluxo de volta. Precificar é obrigatório: o lojista
 * escolhe QUANDO, nunca SE.
 */
export function PrecificacaoPendente({ origem }: { origem: Origem | null }) {
  const [travada, setTravada] = useState<Origem | null>(origem);
  const [dispensado, setDispensado] = useState(false);

  /*
    Ajuste DURANTE O RENDER, não num efeito. É o padrão do React para estado que acompanha
    uma prop, e aqui é obrigatório: `setState` dentro de efeito custa um render a mais por
    transição — a mesma regra que a fase do sorteio já respeita neste projeto.

    Só ACENDE, nunca apaga por conta do servidor. É essa assimetria que protege a tela de
    sucesso (a conclusão zera a pendência e revalida, e sem isso o fluxo sumiria antes do
    confete) e é ela que deixa uma pendência nova — comprar o pacote depois da amostra —
    ainda conseguir abrir.
  */
  if (origem && !travada) setTravada(origem);

  if (!travada || dispensado) return null;

  return <AbrirFluxoPrecos origem={travada} onConcluido={() => setDispensado(true)} />;
}
