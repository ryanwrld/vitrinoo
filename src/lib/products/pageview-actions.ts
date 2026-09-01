"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Server Action PÚBLICA/ANÔNIMA — arquivo deliberadamente SEPARADO de
 * src/lib/products/actions.ts (owner-scoped, autenticado), mesma disciplina
 * de order-clicks-actions.ts (05) e public-actions.ts (04). NUNCA importar/
 * chamar getOwnedStore() neste arquivo.
 *
 * `logPageview` registra um acesso à vitrine pública (grid = product_id
 * null, detalhe = product_id) de forma fire-and-forget: try/catch que só
 * loga via console.error, NUNCA lança — quem chama (pageview-tracker.tsx)
 * dispara isto dentro de um startTransition sem nunca esperar o resultado,
 * e a navegação nunca é atrasada por esta chamada.
 *
 * Insert BARE (sem encadear select ou single) — o papel `anon` não tem
 * nenhuma policy de leitura em `pageviews` (mesmo Pitfall 2 de
 * 05-RESEARCH.md); encadear uma leitura pós-insert faria um insert
 * bem-sucedido parecer uma falha. Só o `error` do insert é inspecionado.
 */

/** Violação de índice único no Postgres. Aqui NÃO é falha: é a deduplicação
 *  por visitante/dia da migration 0010 fazendo exatamente o seu trabalho. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * A data de deduplicação (`view_date`) NÃO é mais calculada aqui.
 *
 * Ela era `Intl.DateTimeFormat` com `America/Sao_Paulo` HARDCODED, enviada
 * pronta no insert. Duas coisas estavam erradas nisso:
 *
 *   1. O painel lê tudo no fuso da LOJA (`startOfTodayInTimeZone`). Gravar em
 *      São Paulo e ler em Boa Vista (UTC-4, o caso real da `rlesportes`)
 *      colocava gravação e leitura em réguas diferentes — um acesso das 23h30
 *      já era "amanhã" para a trava de dedup enquanto o dashboard ainda o
 *      contava em "hoje".
 *   2. A data era um valor ENVIADO pelo cliente num caminho anônimo, e o
 *      Postgres aceitava o que viesse.
 *
 * Desde a migration 0023 o trigger `pageviews_set_view_date` preenche a
 * coluna a partir de `stores.timezone`, ignorando qualquer valor enviado.
 * Não reintroduzir o cálculo aqui: haveria duas fontes de verdade para a
 * metade mais frágil da chave de deduplicação.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function logPageview(
  storeId: string,
  productId: string | null,
  visitorId: string,
): Promise<void> {
  try {
    // Um visitorId ausente/malformado (localStorage bloqueado, storage cheio,
    // navegador exótico) NÃO pode custar a visita inteira: cai num id novo a
    // cada acesso, ou seja, degrada exatamente pro comportamento antigo de
    // contar toda vez — só nesse caso de borda, em vez de sempre.
    const visitor = UUID_PATTERN.test(visitorId) ? visitorId : crypto.randomUUID();

    const supabase = await createClient();
    const { error } = await supabase.from("pageviews").insert({
      store_id: storeId,
      product_id: productId,
      visitor_id: visitor,
    });

    // Duplicata = este visitante já foi contado neste produto hoje. É o
    // caminho ESPERADO em toda atualização de página / ida-e-volta entre
    // grid e produto, então não vira ruído no log.
    if (error && error.code !== PG_UNIQUE_VIOLATION) {
      console.error("logPageview: insert falhou", error);
    }
  } catch (err) {
    console.error("logPageview: erro inesperado", err);
  }
}
