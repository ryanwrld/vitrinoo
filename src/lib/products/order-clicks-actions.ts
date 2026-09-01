"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Server Action PÚBLICA/ANÔNIMA — arquivo deliberadamente SEPARADO de
 * src/lib/products/actions.ts (owner-scoped, autenticado), mesma disciplina
 * de src/lib/products/public-actions.ts (04). NUNCA importar/chamar
 * getOwnedStore() neste arquivo.
 *
 * `logOrderClick` registra o clique em "Pedir agora" (T-05-09/T-05-10) de
 * forma fire-and-forget (D-10): try/catch que só loga via console.error,
 * NUNCA lança — quem chama (product-order-panel.tsx) dispara isto dentro de
 * um startTransition sem nunca esperar o resultado, e a navegação nativa do
 * `<a href>` ao wa.me nunca é atrasada por esta chamada.
 *
 * Insert BARE (sem `.select()`/`.single()`) — o papel `anon` não tem
 * nenhuma policy de leitura em `order_clicks` (05-01, Pitfall 2); encadear
 * `.select()` faria um insert bem-sucedido parecer uma falha (o SELECT
 * pós-insert retornaria vazio/erro mesmo com a linha gravada). Só o `error`
 * do insert é inspecionado.
 *
 * Deduplicação por (visitante, produto, dia) desde a migration 0012 — mesma
 * régua que `logPageview` já usava desde a 0010. Sem isso as duas métricas
 * mediam coisas diferentes (visualização = pessoas, clique = toques) e a
 * "Taxa de conversão" do dashboard, que divide uma pela outra, podia passar
 * de 100%.
 */

/** Violação de índice único no Postgres. Aqui NÃO é falha: é a deduplicação
 *  por visitante/dia da migration 0012 fazendo exatamente o seu trabalho. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * A data de deduplicação (`click_date`) NÃO é mais calculada aqui — desde a
 * migration 0023 o trigger `order_clicks_set_click_date` a preenche a partir
 * de `stores.timezone`, ignorando qualquer valor enviado pelo cliente. Ver o
 * comentário equivalente em `pageview-actions.ts` para o porquê completo.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function logOrderClick(
  storeId: string,
  productId: string,
  size: number,
  visitorId: string
): Promise<void> {
  try {
    // Um visitorId ausente/malformado (localStorage bloqueado, storage cheio,
    // navegador exótico) NÃO pode custar o clique inteiro: cai num id novo a
    // cada acesso, ou seja, degrada exatamente pro comportamento antigo de
    // contar toda vez — só nesse caso de borda, em vez de sempre.
    const visitor = UUID_PATTERN.test(visitorId) ? visitorId : crypto.randomUUID();

    const supabase = await createClient();
    const { error } = await supabase.from("order_clicks").insert({
      store_id: storeId,
      product_id: productId,
      size,
      visitor_id: visitor,
    });

    // Duplicata = este visitante já pediu este produto hoje. É o caminho
    // ESPERADO quando o wa.me não abre de primeira e a pessoa toca de novo,
    // então não vira ruído no log.
    if (error && error.code !== PG_UNIQUE_VIOLATION) {
      console.error("logOrderClick: insert falhou", error);
    }
  } catch (err) {
    console.error("logOrderClick: erro inesperado", err);
  }
}
